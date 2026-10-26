/**
 * Ablauf im Client (public/js/flow.js): welche Servernachrichten gelten
 * und welche veraltet sind. Reine Logik, deshalb ohne Browser testbar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Flow } from '../public/js/flow.js';

test('Eine Suche beginnt nur aus dem Ruhezustand – Doppelklick zählt einmal', () => {
  const flow = new Flow();
  const ticket = flow.startSearch();
  assert.equal(ticket, 1);
  assert.equal(flow.startSearch(), null, 'zweiter Klick wird ignoriert');
  assert.equal(flow.phase, 'searching');
});

test('Antworten zur aktuellen Suche werden angenommen', () => {
  const flow = new Flow();
  const ticket = flow.startSearch();
  assert.equal(flow.isCurrentSearch(ticket), true);
  assert.equal(flow.beginGame(ticket), true);
  assert.equal(flow.playing, true);
});

test('Abbrechen und sofort neu suchen: der alte gameStart wird ignoriert', () => {
  const flow = new Flow();
  const old = flow.startSearch();
  flow.reset(); // "Abbrechen"
  const current = flow.startSearch(); // sofort wieder "Spiel suchen"

  // Der gameStart der abgebrochenen Suche trifft erst jetzt ein.
  assert.equal(flow.beginGame(old), false);
  assert.equal(flow.phase, 'searching', 'die neue Suche läuft weiter');

  assert.equal(flow.isCurrentSearch(current), true, 'das waiting der neuen Suche zählt');
  assert.equal(flow.beginGame(current), true);
});

test('Ohne Suche wird kein gameStart angenommen', () => {
  const flow = new Flow();
  assert.equal(flow.beginGame(0), false);
  assert.equal(flow.beginGame(undefined), false);
  assert.equal(flow.phase, 'idle');
});

test('Das Ende zählt nur, wenn eine Partie lief', () => {
  const flow = new Flow();
  assert.equal(flow.endGame(), false, 'ohne Partie kein Ergebnis');

  flow.beginGame(flow.startSearch());
  assert.equal(flow.endGame(), true);
  assert.equal(flow.phase, 'over');
  assert.equal(flow.endGame(), false, 'ein zweites Ende (z. B. Verbindungsabbruch) zählt nicht');
});

test('Nach dem Ende geht es mit "Neue Partie" in eine neue Suche', () => {
  const flow = new Flow();
  flow.beginGame(flow.startSearch());
  flow.endGame();
  assert.equal(flow.startSearch(), null, 'aus "over" heraus noch nicht');
  flow.reset();
  assert.equal(flow.startSearch(), 2);
});

test('searching gilt nur während der Suche', () => {
  const flow = new Flow();
  assert.equal(flow.searching, false);
  const ticket = flow.startSearch();
  assert.equal(flow.searching, true);
  flow.beginGame(ticket);
  assert.equal(flow.searching, false);
  assert.equal(flow.endGame(), true);
  assert.equal(flow.endGame(), false, 'zweites Ende zählt nicht');
});
