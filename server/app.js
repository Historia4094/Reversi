/**
 * Der Spielserver: Express liefert die statischen Dateien aus, Socket.io
 * transportiert die Spielnachrichten.
 *
 * Grundsatz: der Client sendet nur Absichten ("ich will auf Feld r/c",
 * "ich gebe auf"), niemals Zustand. Der Server hält das Brett und die
 * Uhr, prüft jeden Zug gegen die Regeln und schickt beiden Seiten den
 * neuen Zustand samt der Ereignisse, die dabei entstanden sind. Ein
 * manipulierter Client kann dadurch nichts erzwingen, was die Regeln
 * nicht hergeben.
 *
 * createGameServer() hat keine Seiteneffekte: Sie startet nichts, liest
 * keine Umgebungsvariablen und beendet nie den Prozess. Das übernimmt
 * index.js. Die Tests erzeugen den Server deshalb im eigenen Prozess und
 * erfassen ihn so auch in der Testabdeckung.
 */

import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Server as SocketServer } from 'socket.io';

import { Lobby } from './lobby.js';
import { Match, DEFAULT_TURN_MS } from './match.js';
import { BLACK, WHITE, opponentOf } from './game.js';
import { cleanName, FALLBACK_NAME } from '../public/shared/names.js';
import {
  ConnectionCounter,
  RateLimiter,
  clientAddress,
  isHandshake,
  isSameOrigin,
  MAX_MESSAGE_BYTES,
} from './limits.js';
import { DEFAULT_MAX_CONNECTIONS_PER_IP } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Nach einem abgelehnten Zug bekommt der Absender sein Brett neu, damit
 * eine manipulierte Anzeige sich korrigiert – aber höchstens einmal in
 * diesem Abstand. Sonst würde jede abgelehnte Nachricht von wenigen Byte
 * mit dem ganzen Brett samt Verlauf beantwortet.
 */
const CORRECTION_INTERVAL_MS = 1000;

/**
 * @param {object} [options]
 * @param {number} [options.turnMs] Bedenkzeit pro Zug.
 * @param {number} [options.maxConnectionsPerIp]
 * @param {number} [options.messagesPerSecond] Grenze pro Socket, siehe limits.js.
 * @param {string[]} [options.allowedOrigins] zusätzlich erlaubte Seiten (ALLOWED_ORIGINS).
 * @param {Pick<Console, 'log' | 'warn' | 'error'>} [options.logger] In Tests still.
 */
export function createGameServer({
  turnMs = DEFAULT_TURN_MS,
  maxConnectionsPerIp = DEFAULT_MAX_CONNECTIONS_PER_IP,
  messagesPerSecond,
  allowedOrigins = [],
  logger = console,
} = {}) {
  const app = express();
  app.use(express.static(PUBLIC_DIR));

  const server = http.createServer(app);
  const connections = new ConnectionCounter(maxConnectionsPerIp);

  const io = new SocketServer(server, {
    // Standard wären 1 MB; das Spiel braucht unter 1 KB pro Nachricht.
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    // Läuft vor dem Handshake, also bevor die Verbindung Speicher kostet.
    allowRequest: (req, callback) => {
      if (!isSameOrigin(req, allowedOrigins)) {
        warnOnce(
          `origin:${req.headers.origin}`,
          `Verbindung abgelehnt: Die Seite ${req.headers.origin} passt nicht zur Adresse ` +
            `${req.headers.host}. Gehört sie zum Spiel (z. B. hinter einem Proxy), ` +
            `ALLOWED_ORIGINS=${req.headers.origin} setzen.`,
        );
        return callback('Fremde Herkunft', false);
      }
      if (isHandshake(req) && !connections.canConnect(clientAddress(req))) {
        return callback('Zu viele Verbindungen von dieser Adresse', false);
      }
      return callback(null, true);
    },
  });

  /** Jede Warnung nur einmal, damit ein wiederholender Client das Log nicht füllt. */
  const warned = new Set();
  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    logger.warn(message);
  }

  const lobby = new Lobby({
    createMatch: (id, players) =>
      new Match({
        id,
        players,
        turnMs,
        onChange: broadcastState,
        onEnd: finishMatch,
      }),
  });

  /**
   * Schickt beiden Spielern ihre jeweilige Sicht auf den Zustand, dazu die
   * Ereignisse seit dem letzten Stand (Zug, Aussetzen, Zeitablauf, Ende).
   */
  function broadcastState(match, events = []) {
    for (const color of [BLACK, WHITE]) {
      io.to(match.players[color].id).emit('state', { ...match.viewFor(color), events });
    }
  }

  /** Teilt das Ergebnis mit und gibt beide Spieler frei. */
  function finishMatch(match) {
    logger.log(`Partie ${match.id} beendet (${match.game.endReason}).`);
    for (const color of [BLACK, WHITE]) {
      io.to(match.players[color].id).emit('gameOver', match.resultFor(color));
    }
    lobby.close(match.id);
  }

  /* --- Handler, je einer pro Nachricht ------------------------------ */

  function onJoin(socket, payload) {
    const name = cleanName(payload?.name) || FALLBACK_NAME;
    // Suchnummer des Clients: wird nur zurückgeschickt, nie ausgewertet.
    const ticket = Number.isSafeInteger(payload?.ticket) ? payload.ticket : null;
    const result = lobby.join(socket.id, name, ticket);

    if (result.status === 'busy') {
      socket.emit('joinRejected', {
        ticket,
        message: 'Du bist bereits in einer laufenden Partie.',
      });
      return;
    }
    if (result.status === 'waiting') {
      socket.emit('waiting', { name, ticket });
      return;
    }
    startMatch(result.match);
  }

  function startMatch(match) {
    logger.log(
      `Partie ${match.id} gestartet: ${match.players[BLACK].name} gegen ${match.players[WHITE].name}.`,
    );
    // Uhr zuerst starten: Die Startnachricht enthält die Restzeit. Würde
    // die Uhr erst danach laufen, käme dort 0 an und die Anzeige stünde
    // bis zum ersten Zug auf 0:00.
    match.start();
    for (const color of [BLACK, WHITE]) {
      const player = match.players[color];
      io.to(player.id).emit('gameStart', {
        ticket: player.ticket,
        matchId: match.id,
        yourColor: color,
        yourName: player.name,
        opponentName: match.players[opponentOf(color)].name,
        state: { ...match.viewFor(color), events: [] },
      });
    }
  }

  function onMove(socket, payload) {
    const match = lobby.matchOf(socket.id);
    if (!match || match.over) {
      socket.emit('errorMessage', { message: 'Du bist in keiner laufenden Partie.' });
      return;
    }

    // Bewusst kein Number(): "2" oder [3] würden sonst zu gültigen
    // Koordinaten. game.js akzeptiert nur echte Ganzzahlen auf dem Brett.
    const color = lobby.colorOf(match, socket.id);
    const result = match.move(color, payload?.row, payload?.col);
    if (result.ok) return; // Match verteilt den neuen Zustand über onChange.

    // Abgelehnt: Nur der Absender erfährt davon, der Zustand bleibt.
    socket.emit('rejected', { message: result.reason });
    const now = Date.now();
    if (now - (socket.data.correctedAt ?? 0) >= CORRECTION_INTERVAL_MS) {
      socket.data.correctedAt = now;
      socket.emit('state', { ...match.viewFor(color), events: [] });
    }
  }

  function onResign(socket) {
    const match = lobby.matchOf(socket.id);
    if (!match || match.over) return;
    match.resign(lobby.colorOf(match, socket.id));
  }

  /**
   * Verbindungsabbruch oder freiwilliges Verlassen.
   * Laut Aufgabe wird die Partie dann einfach terminiert – der Server
   * darf dabei unter keinen Umständen abstürzen.
   */
  function onDeparture(socket) {
    const { opponent, matchId } = lobby.leave(socket.id);
    if (!opponent) return;
    logger.log(`Partie ${matchId} abgebrochen: ein Spieler hat sie verlassen.`);
    io.to(opponent.id).emit('gameOver', {
      reason: 'opponentLeft',
      message: 'Dein Gegner hat die Partie verlassen.',
    });
  }

  /* --- Verbindung ----------------------------------------------------- */

  /**
   * Gemeinsamer Rahmen für alle Nachrichten des Clients: Flutschutz,
   * Fehler loggen, nie abstürzen.
   */
  function guarded(socket, limiter, label, handler) {
    return (payload) => {
      if (!limiter.take()) {
        // Höchstens eine Meldung pro Flut, sonst wäre die Antwort selbst
        // wieder eine Flut.
        if (!socket.data.throttled) {
          socket.data.throttled = true;
          logger.warn(`Zu viele Nachrichten von ${socket.id}, verwerfe.`);
          socket.emit('errorMessage', { message: 'Zu viele Anfragen. Bitte kurz warten.' });
        }
        return;
      }
      socket.data.throttled = false;
      try {
        handler(socket, payload);
      } catch (error) {
        logger.error(`${label} fehlgeschlagen:`, error);
        socket.emit('errorMessage', { message: 'Die Anfrage konnte nicht verarbeitet werden.' });
      }
    };
  }

  const handlers = { join: onJoin, move: onMove, resign: onResign, leave: onDeparture };

  // Die eigentliche Zählung. allowRequest oben weist nur ab, was schon
  // sicher zu viel ist: Bauen mehrere Clients gleichzeitig eine Verbindung
  // auf, kommen sie dort alle durch, bevor die erste gezählt ist. Hier
  // dagegen geschehen Prüfen und Zählen in einem Schritt.
  io.use((socket, next) => {
    const address = clientAddress(socket.request);
    if (!connections.canConnect(address)) {
      warnOnce(
        `limit:${address}`,
        `Grenze von ${maxConnectionsPerIp} Verbindungen für ${address} erreicht ` +
          '(MAX_CONNECTIONS_PER_IP).',
      );
      next(new Error('Zu viele Verbindungen von dieser Adresse'));
      return;
    }
    connections.add(address);
    socket.data.address = address;
    next();
  });

  io.on('connection', (socket) => {
    const { address } = socket.data;
    const limiter = new RateLimiter({ perSecond: messagesPerSecond });

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, guarded(socket, limiter, event, handler));
    }

    // Kein Flutschutz: Die Trennung kommt nicht vom Client, sondern von
    // Socket.io selbst, und muss immer aufgeräumt werden.
    socket.on('disconnect', () => {
      connections.remove(address);
      try {
        onDeparture(socket);
      } catch (error) {
        logger.error('disconnect fehlgeschlagen:', error);
      }
    });

    socket.on('error', (error) => {
      logger.error('Socket-Fehler:', error?.message ?? error);
    });
  });

  return {
    server,
    io,
    lobby,
    /** Beendet alle Verbindungen und Partien. Für Tests und sauberes Herunterfahren. */
    close() {
      for (const match of lobby.matches.values()) match.dispose();
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}
