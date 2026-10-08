/**
 * Integrationstest. Startet den echten Server als eigenen Prozess und
 * verbindet zwei echte Socket.io-Clients. Damit ist geprüft, was der
 * Dozent am Spieltag tut, nicht nur die Regellogik.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { io as ioClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4321;
const URL = `http://127.0.0.1:${PORT}`;

const BLACK = 1;
const WHITE = 2;

let serverProcess;

/** Wartet auf ein einzelnes Ereignis eines Sockets. */
function once(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout bei "${event}"`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Wartet, bis der Socket verbunden ist. Ein einfaches once('connect')
 * reicht nicht: ist die Verbindung schon aufgebaut, wenn der Listener
 * gesetzt wird, kommt das Ereignis nie wieder.
 */
function connected(socket) {
  if (socket.connected) return Promise.resolve();
  return once(socket, 'connect');
}

/** Wartet auf einen Zustand, der die Bedingung erfüllt. */
function stateWhere(socket, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout: kein passender Zustand')), timeout);
    const listener = (state) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('state', listener);
      resolve(state);
    };
    socket.on('state', listener);
  });
}

function newClient() {
  return ioClient(URL, { transports: ['websocket'], forceNew: true });
}

/**
 * Baut eine laufende Partie auf und liefert beide Sockets samt
 * Startzustand. Schwarz ist der Spieler, der zuerst gewartet hat.
 */
async function startMatch(t, nameA = 'Anna', nameB = 'Bruno') {
  const black = newClient();
  const white = newClient();
  t.after(() => {
    black.disconnect();
    white.disconnect();
  });

  await connected(black);
  black.emit('join', { name: nameA });
  await once(black, 'waiting');

  await connected(white);
  const startBlack = once(black, 'gameStart');
  white.emit('join', { name: nameB });
  const whiteStart = await once(white, 'gameStart');
  const blackStart = await startBlack;

  return { black, white, blackStart, whiteStart };
}

test.before(async () => {
  serverProcess = spawn('node', ['server/index.js', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startet nicht')), 8000);
    serverProcess.stdout.on('data', (chunk) => {
      if (String(chunk).includes('läuft auf')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
});

test.after(() => {
  serverProcess?.kill();
});

test('Die Suchnummer kommt in waiting und gameStart unverändert zurück', async (t) => {
  const black = newClient();
  const white = newClient();
  t.after(() => {
    black.disconnect();
    white.disconnect();
  });
  await connected(black);
  black.emit('join', { name: 'Anna', ticket: 3 });
  assert.equal((await once(black, 'waiting')).ticket, 3);

  await connected(white);
  const startBlack = once(black, 'gameStart');
  white.emit('join', { name: 'Bruno', ticket: 1 });
  assert.equal((await once(white, 'gameStart')).ticket, 1);
  assert.equal((await startBlack).ticket, 3, 'jeder bekommt seine eigene Nummer');
});

test('Der erste Spieler wartet, der zweite startet die Partie', async (t) => {
  const { blackStart, whiteStart } = await startMatch(t);

  // Wer zuerst gewartet hat, spielt Schwarz und beginnt.
  assert.equal(blackStart.yourColor, BLACK);
  assert.equal(whiteStart.yourColor, WHITE);
  assert.equal(blackStart.opponentName, 'Bruno');
  assert.equal(whiteStart.opponentName, 'Anna');
  assert.equal(blackStart.state.yourTurn, true);
  assert.equal(whiteStart.state.yourTurn, false);
});

test('Ein Zug wird geprüft und an beide Seiten verteilt', async (t) => {
  const { black, white } = await startMatch(t);

  const stateBlack = once(black, 'state');
  const stateWhite = once(white, 'state');
  black.emit('move', { row: 2, col: 3 });

  const viewBlack = await stateBlack;
  const viewWhite = await stateWhite;

  assert.equal(viewBlack.board[2][3], BLACK);
  assert.equal(viewBlack.board[3][3], BLACK, 'der eingeschlossene Stein wurde gedreht');
  assert.deepEqual(viewBlack.board, viewWhite.board, 'beide sehen dasselbe Brett');
  assert.equal(viewBlack.yourTurn, false);
  assert.equal(viewWhite.yourTurn, true);
  assert.equal(viewBlack.legalMoves.length, 0, 'wer nicht dran ist, bekommt keine Zugliste');
});

test('Ein Zug außerhalb der Reihe wird abgelehnt, das Brett bleibt unverändert', async (t) => {
  const { white } = await startMatch(t);

  // Beide Listener vor dem Senden setzen: Ablehnung und korrigierter
  // Zustand kommen unmittelbar nacheinander.
  const rejected = once(white, 'rejected');
  const corrected = once(white, 'state');
  white.emit('move', { row: 2, col: 3 });

  const message = await rejected;
  assert.match(message.message, /nicht am Zug/);
  assert.equal((await corrected).board[2][3], 0, 'das Brett wurde nicht verändert');
});

test('Ein regelwidriger Zug wird abgelehnt', async (t) => {
  const { black } = await startMatch(t);

  const rejected = once(black, 'rejected');
  black.emit('move', { row: 0, col: 0 });
  const message = await rejected;
  assert.match(message.message, /dreht keinen Stein/);
});

test('Unsinnige Nachrichten bringen den Server nicht zum Absturz', async (t) => {
  const { black } = await startMatch(t);

  for (const payload of [null, undefined, {}, { row: 'x', col: {} }, { row: 999, col: -5 }, []]) {
    black.emit('move', payload);
  }

  // Jede Ablehnung schickt den Zustand zurück. Deshalb wird nicht auf
  // die nächste Nachricht gewartet, sondern auf die erste, die den
  // gültigen Zug enthält.
  const applied = stateWhere(black, (state) => state.board[2][3] === BLACK);
  black.emit('move', { row: 2, col: 3 });
  const view = await applied;
  assert.equal(view.board[3][3], BLACK);
});

test('Koordinaten als Text oder Liste werden abgelehnt, nicht umgewandelt', async (t) => {
  const { black } = await startMatch(t);

  // "2" und [3] würden mit Number() zu 2 und 3 – einem erlaubten Zug.
  const rejected = once(black, 'rejected');
  const corrected = once(black, 'state');
  black.emit('move', { row: '2', col: [3] });

  assert.match((await rejected).message, /Ungültige Koordinaten/);
  assert.equal((await corrected).board[2][3], 0, 'kein Stein wurde gesetzt');
});

test('Eine zweite Anmeldung während der Partie beendet sie nicht', async (t) => {
  const { black, white } = await startMatch(t);

  const refused = once(white, 'joinRejected');
  white.emit('join', { name: 'Bruno', ticket: 7 });
  const answer = await refused;
  assert.match(answer.message, /bereits in einer laufenden Partie/);
  assert.equal(answer.ticket, 7, 'die Suchnummer kommt zurück');

  // Die Partie läuft weiter: Schwarz kann ziehen, Weiß sieht den Zug.
  const seen = once(white, 'state');
  black.emit('move', { row: 2, col: 3 });
  assert.equal((await seen).board[2][3], BLACK);
});

test('Verbindungsabbruch beendet die Partie beim Gegner', async (t) => {
  const { black, white } = await startMatch(t);

  const ended = once(white, 'gameOver');
  black.disconnect();
  const payload = await ended;
  assert.equal(payload.reason, 'opponentLeft');
});

test('Zwei Partien laufen gleichzeitig und unabhängig voneinander', async (t) => {
  const first = await startMatch(t, 'A', 'B');
  const second = await startMatch(t, 'C', 'D');

  const stateB = once(first.white, 'state');
  first.black.emit('move', { row: 2, col: 3 });
  await stateB;

  // Partie 2 ist unberührt: dort ist immer noch Schwarz am Zug.
  const stateD = once(second.white, 'state');
  second.black.emit('move', { row: 4, col: 5 });
  const viewD = await stateD;
  assert.equal(viewD.board[4][5], BLACK);
  assert.equal(viewD.board[2][3], 0, 'der Zug aus Partie 1 ist hier nicht sichtbar');
});

test('Eine vollständige Partie läuft bis zum Ergebnis durch', async (t) => {
  const { black, white, blackStart } = await startMatch(t);

  const sockets = { [BLACK]: black, [WHITE]: white };

  const finished = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Die Partie endet nicht')), 20000);
    black.once('gameOver', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  // Beide Seiten ziehen automatisch, sobald sie dran sind.
  for (const color of [BLACK, WHITE]) {
    sockets[color].on('state', (state) => {
      if (state.finished || !state.yourTurn) return;
      const move = state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)];
      sockets[color].emit('move', { row: move.row, col: move.col });
    });
  }

  const opening = blackStart.state.legalMoves[0];
  black.emit('move', { row: opening.row, col: opening.col });

  const result = await finished;
  assert.equal(result.reason, 'finished');
  assert.ok(result.scores.black + result.scores.white >= 4);
  assert.ok(result.scores.black + result.scores.white <= 64);
});
