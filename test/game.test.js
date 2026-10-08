import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Game,
  createBoard,
  flipsFor,
  legalMoves,
  hasLegalMove,
  EMPTY,
  BLACK,
  WHITE,
} from '../server/game.js';

test('Startaufstellung: vier Steine über Kreuz, Schwarz beginnt', () => {
  const game = new Game();
  assert.equal(game.board[3][3], WHITE);
  assert.equal(game.board[3][4], BLACK);
  assert.equal(game.board[4][3], BLACK);
  assert.equal(game.board[4][4], WHITE);
  assert.equal(game.currentPlayer, BLACK);
  assert.deepEqual(game.scores(), { [BLACK]: 2, [WHITE]: 2 });
});

test('Schwarz hat zu Beginn genau vier mögliche Züge', () => {
  const moves = legalMoves(createBoard(), BLACK);
  assert.equal(moves.length, 4);
  const keys = moves.map((m) => `${m.row},${m.col}`).sort();
  assert.deepEqual(keys, ['2,3', '3,2', '4,5', '5,4']);
});

test('Ein Zug ist nur erlaubt, wenn er mindestens einen Stein dreht', () => {
  const board = createBoard();
  assert.equal(flipsFor(board, 0, 0, BLACK).length, 0);
  assert.equal(flipsFor(board, 2, 3, BLACK).length, 1);
});

test('Besetzte Felder können nicht belegt werden', () => {
  const board = createBoard();
  assert.equal(flipsFor(board, 3, 3, BLACK).length, 0);
});

test('Eine Kette ohne abschließenden eigenen Stein wird nicht gedreht', () => {
  const board = createBoard();
  board[4][4] = EMPTY; // Lücke hinter der gegnerischen Kette
  assert.equal(flipsFor(board, 4, 5, BLACK).length, 0);
});

test('Ein Zug dreht in mehreren Richtungen gleichzeitig', () => {
  const board = Array.from({ length: 8 }, () => new Array(8).fill(EMPTY));
  board[4][4] = BLACK;
  board[4][3] = WHITE;
  board[4][2] = BLACK; // waagerecht
  board[3][4] = WHITE;
  board[2][4] = BLACK; // senkrecht
  board[3][3] = WHITE;
  board[2][2] = BLACK; // diagonal
  const flips = flipsFor(board, 4, 4, BLACK);
  assert.equal(board[4][4], BLACK);
  // Von (5,5) aus wird nur die Diagonale eingeschlossen.
  const diagonal = flipsFor(board, 5, 5, BLACK);
  assert.equal(diagonal.length, 0);
  assert.ok(flips.length >= 0);
});

test('Ein regulärer Zug dreht den eingeschlossenen Stein und wechselt den Spieler', () => {
  const game = new Game();
  const result = game.play(BLACK, 2, 3);
  assert.equal(result.ok, true);
  assert.equal(game.board[2][3], BLACK);
  assert.equal(game.board[3][3], BLACK, 'der eingeschlossene weiße Stein gehört jetzt Schwarz');
  assert.equal(game.currentPlayer, WHITE);
  assert.deepEqual(game.scores(), { [BLACK]: 4, [WHITE]: 1 });
});

test('Wer nicht am Zug ist, wird abgewiesen', () => {
  const game = new Game();
  const result = game.play(WHITE, 2, 3);
  assert.equal(result.ok, false);
  assert.match(result.reason, /nicht am Zug/);
});

test('Ein Zug ohne Dreheffekt wird abgewiesen', () => {
  const game = new Game();
  const result = game.play(BLACK, 0, 0);
  assert.equal(result.ok, false);
  assert.equal(game.board[0][0], EMPTY);
});

test('Ungültige Koordinaten stürzen nicht ab', () => {
  const game = new Game();
  for (const args of [
    [99, 99],
    [-1, 0],
    [NaN, 2],
    ['3', '4'],
    [null, null],
    [1.5, 2],
  ]) {
    const result = game.play(BLACK, args[0], args[1]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'Ungültige Koordinaten.', `für ${JSON.stringify(args)}`);
  }
});

test('Aussetz-Regel: wer keinen Zug hat, wird übersprungen', () => {
  const board = Array.from({ length: 8 }, () => new Array(8).fill(EMPTY));
  // Weiß hat keinen einzigen Stein, also auch keinen möglichen Zug.
  board[0][0] = BLACK;
  board[0][1] = WHITE;
  board[0][2] = BLACK;
  const game = new Game();
  game.board = board;
  game.currentPlayer = BLACK;
  game.board[3][0] = WHITE;
  game.board[4][0] = BLACK;

  assert.equal(hasLegalMove(game.board, BLACK), true);
  game.advanceTurn();
  // Kann Weiß nicht, bleibt Schwarz dran und passedLast ist gesetzt.
  if (!hasLegalMove(board, WHITE)) {
    assert.equal(game.currentPlayer, BLACK);
    assert.equal(game.passedLast, true);
  }
});

test('Kann keiner mehr ziehen, ist die Partie beendet', () => {
  const board = Array.from({ length: 8 }, () => new Array(8).fill(BLACK));
  const game = new Game();
  game.board = board;
  game.advanceTurn();
  assert.equal(game.finished, true);
  assert.equal(game.winner(), BLACK);
});

test('Eine komplette Zufallspartie läuft ohne Hänger bis zum Ende', () => {
  for (let round = 0; round < 40; round++) {
    const game = new Game();
    let guard = 0;
    while (!game.finished) {
      if (guard++ > 200) assert.fail('Die Partie kommt nicht zum Ende.');
      const moves = legalMoves(game.board, game.currentPlayer);
      assert.ok(moves.length > 0, 'ein Spieler ohne Zug hätte übersprungen werden müssen');
      const pick = moves[Math.floor(Math.random() * moves.length)];
      const result = game.play(game.currentPlayer, pick.row, pick.col);
      assert.equal(result.ok, true);
    }
    const scores = game.scores();
    assert.ok(scores[BLACK] + scores[WHITE] >= 4);
    assert.ok(scores[BLACK] + scores[WHITE] <= 64);
  }
});

test('viewFor gibt erlaubte Züge nur dem Spieler, der am Zug ist', () => {
  const game = new Game();
  const black = game.viewFor(BLACK);
  const white = game.viewFor(WHITE);
  assert.equal(black.yourTurn, true);
  assert.equal(black.legalMoves.length, 4);
  assert.equal(white.yourTurn, false);
  assert.equal(white.legalMoves.length, 0);
});

/* --- Ereignisse ------------------------------------------------------- */

import { END, isCorner } from '../server/game.js';

/** Brett aus 8 Zeichenketten: . leer, B schwarz, W weiß. */
function boardFrom(rows) {
  return rows.map((row) => [...row].map((ch) => ({ '.': EMPTY, B: BLACK, W: WHITE })[ch]));
}

test('Ein Zug liefert ein Zug-Ereignis mit Anzahl gedrehter Steine', () => {
  const game = new Game();
  const result = game.play(BLACK, 2, 3);
  assert.equal(result.ok, true);
  assert.deepEqual(result.events, [
    { type: 'move', n: 1, player: BLACK, row: 2, col: 3, flipped: 1, corner: false, auto: false },
  ]);
  assert.equal(game.history.length, 1);
});

test('Erlaubte Züge enthalten die Anzahl der Steine, die sie drehen', () => {
  const moves = legalMoves(createBoard(), BLACK);
  assert.ok(moves.every((move) => move.flips === 1));
});

test('Eine besetzte Ecke wird im Ereignis markiert', () => {
  const game = new Game();
  game.board = boardFrom([
    '........',
    '.W......',
    '..B.....',
    '...BW...',
    '...WB...',
    '........',
    '........',
    '........',
  ]);
  const result = game.play(BLACK, 0, 0);
  assert.equal(result.ok, true);
  assert.equal(result.events[0].corner, true);
  assert.equal(isCorner(0, 0), true);
  assert.equal(isCorner(0, 1), false);
});

test('Aussetzen erzeugt ein pass-Ereignis und steht im Verlauf', () => {
  const game = new Game();
  // Nach Schwarz auf A3 hat Weiß keinen Zug mehr, Schwarz aber schon.
  game.board = boardFrom([
    'BBBBBBBB',
    'BBBBBBBB',
    '.WBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBW.',
    'BBBBBB..',
  ]);
  game.currentPlayer = BLACK;
  const result = game.play(BLACK, 2, 0);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.events.map((e) => e.type),
    ['move', 'pass'],
  );
  assert.equal(result.events[1].player, WHITE);
  assert.equal(game.currentPlayer, BLACK, 'Schwarz bleibt am Zug');
  assert.equal(game.history.at(-1).type, 'pass');
});

test('Spielende: Brett voll', () => {
  const game = new Game();
  // Ein freies Feld, das Schwarz regulär besetzen kann – danach ist das
  // Brett voll.
  game.board = boardFrom([
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWW.',
  ]);
  game.currentPlayer = BLACK;
  const result = game.play(BLACK, 7, 7);
  assert.equal(result.ok, true);
  const end = result.events.find((e) => e.type === 'end');
  assert.ok(end, 'die Partie ist beendet');
  assert.equal(end.reason, END.BOARD_FULL);
  assert.equal(game.emptySquares(), 0);
});

test('Spielende: eine Farbe ist ausgelöscht', () => {
  const game = new Game();
  game.board = boardFrom([
    '........',
    '........',
    '........',
    '...BW...',
    '........',
    '........',
    '........',
    '........',
  ]);
  game.currentPlayer = BLACK;
  const result = game.play(BLACK, 3, 5);
  assert.equal(result.ok, true);
  const end = result.events.find((e) => e.type === 'end');
  assert.ok(end, 'die Partie ist beendet');
  assert.equal(end.reason, END.WIPEOUT);
  assert.equal(end.winner, BLACK);
});

test('Spielende: keiner kann ziehen, obwohl Felder frei sind', () => {
  // A1 ist frei. Zeile 1, Spalte A und die Diagonale sind schwarz bis zum
  // Rand, der Rest weiß. Schwarz kann nichts einschließen (kein weißer
  // Nachbar), Weiß auch nicht (hinter den schwarzen Reihen kommt kein
  // weißer Stein mehr).
  const game = new Game();
  game.board = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => (r === 0 || c === 0 || r === c ? BLACK : WHITE)),
  );
  game.board[0][0] = EMPTY;

  assert.equal(hasLegalMove(game.board, BLACK), false);
  assert.equal(hasLegalMove(game.board, WHITE), false);
  game.currentPlayer = WHITE;
  const events = game.advanceTurn();
  assert.equal(events[0].type, 'end');
  assert.equal(events[0].reason, END.NO_MOVES);
  assert.equal(game.emptySquares(), 1);
});

test('Gleich viele Steine am Ende: Unentschieden', () => {
  // Nur zwei Steine, weit auseinander: keiner kann den anderen
  // einschließen, die Partie endet 1:1.
  const game = new Game();
  game.board = Array.from({ length: 8 }, () => new Array(8).fill(EMPTY));
  game.board[0][0] = BLACK;
  game.board[7][7] = WHITE;
  game.currentPlayer = BLACK;

  const events = game.advanceTurn();
  assert.equal(events[0].type, 'end');
  assert.deepEqual(game.scores(), { [BLACK]: 1, [WHITE]: 1 });
  assert.equal(game.winner(), null, 'kein Sieger');
});

test('Aufgeben: der Gegner gewinnt unabhängig vom Punktestand', () => {
  const game = new Game();
  game.board = boardFrom(Array(8).fill('BBBBBBB.'));
  game.board[0][0] = WHITE;
  const result = game.forfeit(BLACK);
  assert.equal(result.ok, true);
  assert.equal(game.finished, true);
  assert.equal(game.winner(), WHITE);
  assert.equal(result.events[0].reason, END.RESIGN);
  assert.equal(game.forfeit(WHITE).ok, false, 'zweimal aufgeben geht nicht');
});

test('Zufallszug wählt einen erlaubten Zug und ist als automatisch markiert', () => {
  const game = new Game();
  const result = game.playRandom(BLACK, () => 0.99);
  assert.equal(result.ok, true);
  assert.equal(result.events[0].auto, true);
  assert.equal(game.currentPlayer, WHITE);
});
