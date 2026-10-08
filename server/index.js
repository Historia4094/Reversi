/**
 * Server. Express liefert die statischen Dateien aus, Socket.io
 * transportiert die Spielnachrichten.
 *
 * Grundsatz: der Client sendet nur Absichten ("ich will auf Feld r/c",
 * "ich gebe auf"), niemals Zustand. Der Server hält das Brett und die
 * Uhr, prüft jeden Zug gegen die Regeln und schickt beiden Seiten den
 * neuen Zustand samt der Ereignisse, die dabei entstanden sind. Ein
 * manipulierter Client kann dadurch nichts erzwingen, was die Regeln
 * nicht hergeben.
 */

import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { Server as SocketServer } from 'socket.io';

import { Lobby } from './lobby.js';
import { Match, DEFAULT_TURN_MS } from './match.js';
import { BLACK, WHITE } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const DEFAULT_PORT = 3000;

/** Port: erstes CLI-Argument, sonst Umgebungsvariable, sonst 3000. */
function resolvePort() {
  for (const [source, candidate] of [
    ['Argument', process.argv[2]],
    ['PORT', process.env.PORT],
  ]) {
    if (candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isInteger(value) && value > 0 && value < 65536) return value;
    console.warn(`Ungültiger Port aus ${source}: "${candidate}" – wird ignoriert.`);
  }
  return DEFAULT_PORT;
}

/** Bedenkzeit pro Zug in Sekunden, über TURN_SECONDS einstellbar. */
function resolveTurnMs() {
  const raw = process.env.TURN_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_TURN_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0.2 && seconds <= 600) {
    return Math.round(seconds * 1000);
  }
  console.warn(
    `Ungültige TURN_SECONDS "${raw}" (erlaubt: 0.2 bis 600) – nehme ${DEFAULT_TURN_MS / 1000}.`,
  );
  return DEFAULT_TURN_MS;
}

const PORT = resolvePort();
const TURN_MS = resolveTurnMs();

// Ohne Host-Angabe lauscht Node auf "::" im Dual-Stack-Modus und nimmt
// damit IPv4 und IPv6 an. Das ist wichtig, weil der Kursserver per IPv6
// erreichbar ist. Auf einem reinen IPv4-Rechner fällt Node automatisch
// auf 0.0.0.0 zurück – die Anforderung "läuft auch auf IPv4" bleibt erfüllt.
const HOST = process.env.HOST || undefined;

const MAX_NAME_LENGTH = 20;

const app = express();
app.use(express.static(PUBLIC_DIR));

const server = http.createServer(app);
const io = new SocketServer(server);

const lobby = new Lobby({
  createMatch: (id, players) =>
    new Match({
      id,
      players,
      turnMs: TURN_MS,
      onChange: broadcastState,
      onEnd: finishMatch,
    }),
});

/**
 * Kürzt und säubert den Anzeigenamen. Nie ungeprüft weiterreichen.
 * Steuerzeichen (\p{Cc}) und unsichtbare Formatzeichen (\p{Cf}, z. B.
 * Zeichen, die die Schreibrichtung umdrehen) fliegen raus – sie könnten
 * die Anzeige beim Gegner verfälschen.
 */
function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/**
 * Schickt beiden Spielern ihre jeweilige Sicht auf den Zustand, dazu die
 * Ereignisse seit dem letzten Stand (Zug, Aussetzen, Zeitablauf, Ende).
 */
function broadcastState(match, events = []) {
  for (const color of [BLACK, WHITE]) {
    const player = match.players[color];
    io.to(player.id).emit('state', { ...match.viewFor(color), events });
  }
}

/** Teilt das Ergebnis mit und gibt beide Spieler frei. */
function finishMatch(match) {
  console.log(`Partie ${match.id} beendet (${match.game.endReason}).`);
  for (const color of [BLACK, WHITE]) {
    io.to(match.players[color].id).emit('gameOver', match.resultFor(color));
  }
  lobby.close(match.id);
}

/** Gemeinsamer Rahmen für alle Handler: Fehler loggen, nie abstürzen. */
function guarded(socket, label, handler) {
  return (payload) => {
    try {
      handler(payload);
    } catch (error) {
      console.error(`${label} fehlgeschlagen:`, error);
      socket.emit('errorMessage', { message: 'Die Anfrage konnte nicht verarbeitet werden.' });
    }
  };
}

io.on('connection', (socket) => {
  socket.on(
    'join',
    guarded(socket, 'join', (payload) => {
      const name = sanitizeName(payload?.name) || 'Spieler';
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

      const { match } = result;
      console.log(
        `Partie ${match.id} gestartet: ${match.players[BLACK].name} gegen ${match.players[WHITE].name}.`,
      );
      // Uhr zuerst starten: Die Startnachricht enthält die Restzeit. Würde
      // die Uhr erst danach laufen, käme dort 0 an und die Anzeige stünde
      // bis zum ersten Zug auf 0:00.
      match.start();
      for (const color of [BLACK, WHITE]) {
        const player = match.players[color];
        const opponent = match.players[color === BLACK ? WHITE : BLACK];
        io.to(player.id).emit('gameStart', {
          ticket: player.ticket,
          matchId: match.id,
          yourColor: color,
          yourName: player.name,
          opponentName: opponent.name,
          state: { ...match.viewFor(color), events: [] },
        });
      }
    }),
  );

  socket.on(
    'move',
    guarded(socket, 'move', (payload) => {
      const match = lobby.matchOf(socket.id);
      if (!match || match.over) {
        socket.emit('errorMessage', { message: 'Du bist in keiner laufenden Partie.' });
        return;
      }

      // Bewusst kein Number(): "2" oder [3] würden sonst zu gültigen
      // Koordinaten. game.js akzeptiert nur echte Ganzzahlen auf dem Brett.
      const color = lobby.colorOf(match, socket.id);
      const result = match.move(color, payload?.row, payload?.col);
      if (!result.ok) {
        // Abgelehnter Zug: nur der Absender erfährt davon, der Zustand
        // bleibt unverändert. Sein Brett wird trotzdem neu gesetzt,
        // damit eine manipulierte Anzeige sich wieder korrigiert.
        socket.emit('rejected', { message: result.reason });
        socket.emit('state', { ...match.viewFor(color), events: [] });
      }
      // Bei Erfolg verteilt Match über onChange den neuen Zustand.
    }),
  );

  socket.on(
    'resign',
    guarded(socket, 'resign', () => {
      const match = lobby.matchOf(socket.id);
      if (!match || match.over) return;
      match.resign(lobby.colorOf(match, socket.id));
    }),
  );

  socket.on(
    'leave',
    guarded(socket, 'leave', () => handleDeparture(socket)),
  );
  socket.on(
    'disconnect',
    guarded(socket, 'disconnect', () => handleDeparture(socket)),
  );

  socket.on('error', (error) => {
    console.error('Socket-Fehler:', error?.message ?? error);
  });
});

/**
 * Verbindungsabbruch oder freiwilliges Verlassen.
 * Laut Aufgabe wird die Partie dann einfach terminiert – der Server
 * darf dabei unter keinen Umständen abstürzen.
 */
function handleDeparture(socket) {
  const { opponent, matchId } = lobby.leave(socket.id);
  if (opponent) {
    console.log(`Partie ${matchId} abgebrochen: ein Spieler hat sie verlassen.`);
    io.to(opponent.id).emit('gameOver', {
      reason: 'opponentLeft',
      message: 'Dein Gegner hat die Partie verlassen.',
    });
  }
}

// Letzte Absicherung. Normalerweise beendet Node sich bei einem
// unbehandelten Fehler. Die Aufgabe verlangt aber ausdrücklich, dass der
// Server nicht abstürzt – laufende Partien anderer Paare sollen
// weiterlaufen. Alle Socket-Handler fangen ihre Fehler schon selbst
// (guarded); hier landet nur, was trotzdem durchrutscht, etwa aus einem
// Zeitgeber. Der Fehler wird vollständig geloggt, damit er auffällt.
process.on('uncaughtException', (error) => {
  console.error('Unbehandelter Fehler:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelte Rejection:', reason);
});

/** IPv4-Adressen im lokalen Netz – dort erreichen Handy und Tablet das Spiel. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

// Startfehler (Port belegt, keine Berechtigung) sind dagegen fatal: ohne
// Port kann der Server nichts tun. Exit-Code 1, damit es auffällt.
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist schon belegt. Läuft der Server noch in einem anderen Fenster?`);
  } else {
    console.error('Server konnte nicht starten:', error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Reversi läuft auf http://localhost:${PORT}`);
  const addresses = lanAddresses();
  if (addresses.length > 0) {
    console.log('Im selben Netzwerk (Handy, Tablet) erreichbar unter:');
    for (const address of addresses) console.log(`  http://${address}:${PORT}`);
  }
  console.log(`Bedenkzeit pro Zug: ${TURN_MS / 1000} Sekunden`);
});
