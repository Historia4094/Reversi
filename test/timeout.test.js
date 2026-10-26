/**
 * Zeitablauf und Aufgeben über das echte Netzwerk.
 *
 * Eigener Server mit sehr kurzer Bedenkzeit (0,4 s), damit der Test nicht
 * Minuten dauert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as net from './helpers/net.js';

const { once } = net;

const BLACK = 1;
const WHITE = 2;

let url;
let game;

const startMatch = (t) => net.startMatch(t, url);

test.before(async () => {
  ({ url, game } = await net.startServer({ turnMs: 400 }));
});

test.after(() => game.close());

test('Der Zustand enthält Bedenkzeit und Restzeit', async (t) => {
  const { blackStart } = await startMatch(t);
  assert.equal(blackStart.state.turnMs, 400);
  // Die Uhr läuft schon, wenn die Startnachricht ankommt – nicht erst
  // nach dem ersten Zug.
  assert.ok(blackStart.state.remainingMs > 0, 'Restzeit beim Start ist nicht 0');
  assert.ok(blackStart.state.remainingMs <= 400);
  assert.deepEqual(blackStart.state.timeouts, { mine: 0, opponent: 0 });
});

test('Zeitablauf: Ersatzzug, Ereignis bei beiden, danach ist der Gegner dran', async (t) => {
  const { black, white } = await startMatch(t);

  const [viewBlack, viewWhite] = await Promise.all([once(black, 'state'), once(white, 'state')]);
  for (const view of [viewBlack, viewWhite]) {
    const timeout = view.events.find((e) => e.type === 'timeout');
    assert.ok(timeout, 'Zeitablauf wird gemeldet');
    assert.equal(timeout.player, BLACK);
    assert.ok(timeout.square, 'mit dem Feld des Ersatzzugs');
  }
  assert.equal(viewWhite.yourTurn, true);
  assert.deepEqual(viewBlack.timeouts, { mine: 1, opponent: 0 });
});

test('Wer dreimal in Folge nicht zieht, verliert – bei beiden angezeigt', async (t) => {
  const { black, white } = await startMatch(t);

  // Weiß antwortet sofort, Schwarz bleibt untätig.
  white.on('state', (state) => {
    if (state.yourTurn && !state.finished) {
      const move = state.legalMoves[0];
      white.emit('move', { row: move.row, col: move.col });
    }
  });

  const [resultBlack, resultWhite] = await Promise.all([
    once(black, 'gameOver', 8000),
    once(white, 'gameOver', 8000),
  ]);
  assert.equal(resultBlack.endReason, 'inactive');
  assert.equal(resultBlack.youWon, false);
  assert.equal(resultBlack.forfeitedBy, BLACK);
  assert.equal(resultWhite.youWon, true);
});

test('Aufgeben per Klick beendet die Partie für beide', async (t) => {
  const { black, white } = await startMatch(t);
  const results = Promise.all([once(black, 'gameOver'), once(white, 'gameOver')]);
  white.emit('resign');
  const [resultBlack, resultWhite] = await results;
  assert.equal(resultBlack.endReason, 'resign');
  assert.equal(resultBlack.youWon, true);
  assert.equal(resultWhite.youWon, false);
  assert.equal(resultWhite.forfeitedBy, WHITE);
});

test('Nach Spielende können beide sofort neu suchen', async (t) => {
  const { black, white } = await startMatch(t);
  const results = Promise.all([once(black, 'gameOver'), once(white, 'gameOver')]);
  black.emit('resign');
  await results;

  black.emit('join', { name: 'Anna' });
  await once(black, 'waiting');
  const again = once(black, 'gameStart');
  white.emit('join', { name: 'Bruno' });
  const start = await once(white, 'gameStart');
  await again;
  assert.equal(start.opponentName, 'Anna');
});
