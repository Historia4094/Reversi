/**
 * Bedenkzeit und Zeitablauf, ohne Netzwerk.
 *
 * expire() wird direkt aufgerufen, statt 60 Sekunden zu warten. Nur zwei
 * Tests arbeiten mit echten, sehr kurzen Zeitgebern – um zu prüfen, dass
 * der Timer wirklich auslöst und dass dispose() ihn wirklich abräumt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Match } from '../server/match.js';
import { BLACK, WHITE, EMPTY, END } from '../server/game.js';

const players = {
  [BLACK]: { id: 'a', name: 'Anna' },
  [WHITE]: { id: 'b', name: 'Bruno' },
};

function newMatch(options = {}) {
  const changes = [];
  const ends = [];
  const match = new Match({
    id: 't',
    players,
    turnMs: 60_000,
    random: () => 0,
    onChange: (m, events) => changes.push(events),
    onEnd: (m) => ends.push(m),
    ...options,
  });
  return { match, changes, ends };
}

test('Ein eigener Zug stellt die Uhr neu und meldet das Ereignis', (t) => {
  const { match, changes } = newMatch();
  t.after(() => match.dispose());
  match.start();

  const result = match.move(BLACK, 2, 3);
  assert.equal(result.ok, true);
  assert.equal(changes.length, 1);
  assert.equal(changes[0][0].type, 'move');
  assert.ok(match.remainingMs() > 59_000, 'die Uhr läuft für den nächsten Zug neu');
});

test('Zeitablauf: der Server setzt einen erlaubten Zug, danach ist der Gegner dran', (t) => {
  const { match, changes } = newMatch();
  t.after(() => match.dispose());
  match.start();

  match.expire();

  const events = changes.at(-1);
  assert.equal(events[0].type, 'timeout');
  assert.equal(events[0].player, BLACK);
  assert.equal(events[0].count, 1);
  assert.deepEqual(events[0].square, { row: 2, col: 3 }, 'mit random()=0 der erste erlaubte Zug');

  const move = events.find((e) => e.type === 'move');
  assert.equal(move.auto, true);
  assert.equal(match.game.board[2][3], BLACK);
  assert.equal(match.game.currentPlayer, WHITE);
  assert.equal(match.timeouts[BLACK], 1);
});

test('Ein eigener Zug setzt den Zähler für Zeitüberschreitungen zurück', (t) => {
  const { match } = newMatch();
  t.after(() => match.dispose());
  match.start();

  match.expire(); // Schwarz: 1
  assert.equal(match.timeouts[BLACK], 1);
  const white = match.game.viewFor(WHITE).legalMoves[0];
  match.move(WHITE, white.row, white.col);
  const black = match.game.viewFor(BLACK).legalMoves[0];
  match.move(BLACK, black.row, black.col);
  assert.equal(match.timeouts[BLACK], 0);
});

test('Beim dritten Zeitablauf in Folge gilt die Partie als aufgegeben', (t) => {
  const { match, changes, ends } = newMatch();
  t.after(() => match.dispose());
  match.start();

  for (let round = 0; round < 2; round++) {
    match.expire(); // Schwarz läuft ab
    const reply = match.game.viewFor(WHITE).legalMoves[0];
    match.move(WHITE, reply.row, reply.col); // Weiß zieht selbst
  }
  assert.equal(match.timeouts[BLACK], 2);
  assert.equal(ends.length, 0);

  match.expire(); // drittes Mal

  assert.equal(ends.length, 1);
  assert.equal(match.over, true);
  assert.equal(match.game.endReason, END.INACTIVE);
  assert.equal(match.game.winner(), WHITE);

  const last = changes.at(-1);
  assert.equal(last[0].type, 'timeout');
  assert.equal(last[0].square, null, 'beim dritten Mal kein Ersatzzug');
  assert.equal(last.at(-1).type, 'end');

  const result = match.resultFor(BLACK);
  assert.equal(result.youWon, false);
  assert.equal(result.forfeitedBy, BLACK);
  assert.equal(match.resultFor(WHITE).youWon, true);
});

test('Aufgeben per Klick beendet die Partie mit Sieg für den Gegner', (t) => {
  const { match, ends } = newMatch();
  t.after(() => match.dispose());
  match.start();
  match.resign(WHITE);
  assert.equal(ends.length, 1);
  assert.equal(match.resultFor(BLACK).youWon, true);
  assert.equal(match.resultFor(BLACK).endReason, END.RESIGN);
  assert.equal(match.move(BLACK, 2, 3).ok, false, 'nach dem Ende keine Züge mehr');
});

test('Nach Spielende zählt die Uhr nicht weiter', (t) => {
  const { match } = newMatch();
  t.after(() => match.dispose());
  match.start();
  match.resign(BLACK);
  assert.equal(match.timer, null);
  assert.equal(match.remainingMs(), 0);
  match.expire();
  assert.equal(match.timeouts[WHITE], 0, 'expire() nach dem Ende bewirkt nichts');
});

test('Die Sicht enthält Bedenkzeit und Zähler aus eigener Perspektive', (t) => {
  const { match } = newMatch();
  t.after(() => match.dispose());
  match.start();
  match.expire();
  const white = match.viewFor(WHITE);
  assert.equal(white.turnMs, 60_000);
  assert.equal(white.maxTimeouts, 3);
  assert.deepEqual(white.timeouts, { mine: 0, opponent: 1 });
  assert.ok(white.remainingMs > 0);
});

test('Der echte Zeitgeber löst aus', async (t) => {
  const { match, changes } = newMatch({ turnMs: 30 });
  t.after(() => match.dispose());
  match.start();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.ok(changes.length >= 1, 'es gab mindestens einen Zeitablauf');
  assert.equal(changes[0][0].type, 'timeout');
});

test('dispose() räumt den Zeitgeber ab – keine Geisterzüge nach dem Abbruch', async () => {
  const { match, changes } = newMatch({ turnMs: 30 });
  match.start();
  match.dispose();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(changes.length, 0);
  assert.equal(match.game.board[2][3], EMPTY);
});

test('Direkt nach start() ist die volle Bedenkzeit übrig', (t) => {
  const { match } = newMatch();
  t.after(() => match.dispose());
  assert.equal(match.viewFor(BLACK).remainingMs, 0, 'vor dem Start läuft keine Uhr');
  match.start();
  assert.ok(match.viewFor(BLACK).remainingMs > 59_000);
});

test('Absicherung: Findet der Server keinen Ersatzzug, läuft die Uhr neu, statt abzustürzen', (t) => {
  const { match, changes } = newMatch();
  t.after(() => match.dispose());
  const error = t.mock.method(console, 'error', () => {});
  match.start();
  // Nach den Regeln unmöglich, deshalb mit einer Attrappe erzwungen.
  match.game.playRandom = () => ({ ok: false, reason: 'kein Zug' });
  match.expire();
  assert.equal(error.mock.callCount(), 1);
  assert.equal(changes.length, 0, 'kein Zustand ohne Zug');
  assert.ok(match.remainingMs() > 59_000, 'die Uhr läuft neu');
});

test('Ein Fehler beim Zeitablauf wird geloggt und hält den Prozess nicht an', async (t) => {
  const error = t.mock.method(console, 'error', () => {});
  const { match } = newMatch({
    turnMs: 20,
    onChange: () => {
      throw new Error('Absicht');
    },
  });
  t.after(() => match.dispose());
  match.start();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(error.mock.callCount() >= 1);
  assert.match(String(error.mock.calls[0].arguments[0]), /Zeitablauf fehlgeschlagen/);
});

test('Ohne Rückrufe läuft eine Partie bis zur Aufgabe; danach ist Aufgeben abgelehnt', () => {
  const match = new Match({ id: 'ohne', players, turnMs: 60_000 });
  match.start();
  assert.equal(match.resign(BLACK).ok, true);
  assert.equal(match.over, true);
  assert.deepEqual(match.resign(WHITE), { ok: false, reason: 'Die Partie ist beendet.' });
  match.dispose();
});
