/**
 * Brett (public/js/board.js): Darstellung, Feldbeschreibungen und
 * Bedienung per Tastatur.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom } from './helpers/dom.js';

const window = setupDom('<div id="board"></div>');
const { BoardView } = await import('../public/js/board.js');

const BLACK = 1;
const WHITE = 2;

function startBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(0));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  return board;
}

function state(overrides = {}) {
  return {
    board: startBoard(),
    legalMoves: [
      { row: 2, col: 3, flips: 1 },
      { row: 3, col: 2, flips: 1 },
    ],
    lastMove: null,
    yourTurn: true,
    ...overrides,
  };
}

function setup() {
  const root = document.getElementById('board');
  root.replaceChildren();
  const clicks = [];
  const view = new BoardView(root, (row, col) => clicks.push(`${row},${col}`));
  view.setPerspective(BLACK, { [BLACK]: 'Anna', [WHITE]: 'Bruno' });
  return {
    root,
    view,
    clicks,
    cell: (r, c) => root.querySelector(`[data-row="${r}"][data-col="${c}"]`),
  };
}

const key = (target, name, extra = {}) =>
  target.dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, ...extra }));

test('Aufbau: ARIA-Grid aus 8 Zeilen mit je 8 Zellen und einem Tab-Stopp', () => {
  const { root } = setup();
  assert.equal(root.querySelectorAll(':scope > [role=row]').length, 8);
  assert.equal(root.querySelectorAll('[role=row] > [role=gridcell]').length, 64);
  assert.equal(root.querySelectorAll('[tabindex="0"]').length, 1);
});

test('Erlaubte Felder sind bedienbar, alle anderen gesperrt', () => {
  const { view, cell } = setup();
  view.render(state());
  assert.equal(cell(2, 3).getAttribute('aria-disabled'), 'false');
  assert.equal(cell(0, 0).getAttribute('aria-disabled'), 'true');
  assert.equal(cell(3, 3).getAttribute('aria-disabled'), 'true', 'besetztes Feld');
});

test('Beschriftungen nennen Stein, Besitzer und möglichen Zug', () => {
  const { view, cell } = setup();
  view.render(state());
  assert.equal(cell(3, 4).getAttribute('aria-label'), 'E4, dein Stein');
  assert.equal(cell(3, 3).getAttribute('aria-label'), 'D4, Stein von Bruno');
  assert.equal(cell(2, 3).getAttribute('aria-label'), 'D3, möglicher Zug, dreht 1 Stein');
  assert.equal(cell(0, 0).getAttribute('aria-label'), 'A1, leer');
});

test('Zugmarkierung aus: kein "möglicher Zug", jedes freie Feld anklickbar', () => {
  const { view, cell } = setup();
  view.render(state(), { allowAny: true });
  assert.equal(cell(2, 3).getAttribute('aria-label'), 'D3, leer');
  assert.equal(cell(0, 0).getAttribute('aria-disabled'), 'false');
  assert.equal(cell(3, 3).getAttribute('aria-disabled'), 'true', 'besetzt bleibt gesperrt');
});

test('Klick auf ein gesperrtes Feld wird nicht gemeldet', () => {
  const { view, cell, clicks } = setup();
  view.render(state());
  cell(0, 0).click();
  cell(2, 3).click();
  assert.deepEqual(clicks, ['2,3']);
});

test('Pfeiltasten bewegen den Tab-Stopp, Strg+Pos1/Ende springen in die Ecken', () => {
  const { root, view } = setup();
  view.render(state());
  view.focus();
  const at = () => `${document.activeElement.dataset.row},${document.activeElement.dataset.col}`;
  assert.equal(at(), '3,3');
  key(document.activeElement, 'ArrowUp');
  key(document.activeElement, 'ArrowLeft');
  assert.equal(at(), '2,2');
  key(document.activeElement, 'Home');
  assert.equal(at(), '2,0');
  key(document.activeElement, 'ArrowLeft');
  assert.equal(at(), '2,0', 'am Rand bleibt der Fokus stehen');
  key(document.activeElement, 'End', { ctrlKey: true });
  assert.equal(at(), '7,7');
  key(document.activeElement, 'ArrowDown');
  assert.equal(at(), '7,7');
  key(document.activeElement, 'Home', { ctrlKey: true });
  key(document.activeElement, 'End');
  assert.equal(at(), '0,7');
  assert.equal(root.querySelectorAll('[tabindex="0"]').length, 1);
});

test('Enter und Leertaste setzen auf erlaubten Feldern, andere Tasten nichts', () => {
  const { view, clicks } = setup();
  view.render(state());
  view.focus();
  key(document.activeElement, 'ArrowUp'); // D3, erlaubt
  key(document.activeElement, 'Enter');
  key(document.activeElement, ' ');
  key(document.activeElement, 'a');
  key(document.activeElement, 'ArrowUp'); // D2, gesperrt
  key(document.activeElement, 'Enter');
  assert.deepEqual(clicks, ['2,3', '2,3']);
});

test('Gesetzte und gedrehte Steine: Farbe, neu gelegt und Abstand zum Zug', () => {
  const { view, cell } = setup();
  view.render(state());
  const next = startBoard();
  next[2][3] = BLACK;
  next[3][3] = BLACK;
  view.render(state({ board: next, lastMove: { row: 2, col: 3 }, legalMoves: [] }));
  const placed = cell(2, 3).querySelector('.disc');
  const flipped = cell(3, 3).querySelector('.disc');
  assert.equal(placed.dataset.color, 'black');
  assert.equal(placed.dataset.placed, 'true');
  assert.equal(flipped.dataset.placed, 'false');
  assert.equal(flipped.style.getPropertyValue('--flip-index'), '1');
  assert.equal(cell(2, 3).dataset.last, 'true');
});

test('reset leert alle Steine', () => {
  const { view, root } = setup();
  view.render(state());
  view.reset();
  assert.equal(root.querySelectorAll('.disc:not([hidden])').length, 0);
});
