/**
 * Integrationstest. Startet den echten Server auf einem echten Port und
 * verbindet echte Socket.io-Clients. Damit ist geprüft, was der Dozent
 * am Spieltag tut, nicht nur die Regellogik.
 *
 * Der Server läuft im Testprozess (test/helpers/net.js), damit er in der
 * Testabdeckung erscheint. Den Start über server/index.js prüft
 * test/start.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as net from './helpers/net.js';

const { once, connected, stateWhere } = net;

const BLACK = 1;
const WHITE = 2;

let url;
let game;

const newClient = () => net.newClient(url);
const startMatch = (t, nameA, nameB) => net.startMatch(t, url, nameA, nameB);

test.before(async () => {
  ({ url, game } = await net.startServer());
});

test.after(() => game.close());

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
      // Kurze Pause wie bei einem Menschen: Ohne sie schickte jede Seite
      // rund 30 Züge in wenigen Millisekunden und liefe in den Flutschutz.
      setTimeout(() => sockets[color].emit('move', { row: move.row, col: move.col }), 60);
    });
  }

  const opening = blackStart.state.legalMoves[0];
  black.emit('move', { row: opening.row, col: opening.col });

  const result = await finished;
  assert.equal(result.reason, 'finished');
  assert.ok(result.scores.black + result.scores.white >= 4);
  assert.ok(result.scores.black + result.scores.white <= 64);
});
