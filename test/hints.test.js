/**
 * Hinweistexte aus Ereignissen – reine Funktionen aus dem Client,
 * hier ohne Browser geprüft.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  noticesFor,
  stateNotices,
  endReasonText,
  visibleAt,
  BIG_FLIP,
} from '../public/js/hints.js';

const BLACK = 1;
const WHITE = 2;
const ctx = { me: BLACK, names: { [BLACK]: 'Christa', [WHITE]: 'Bruno' } };

test('Aussetzen des Gegners: wichtiger Hinweis, über dem Brett', () => {
  const [notice] = noticesFor([{ type: 'pass', player: WHITE }], ctx);
  assert.match(notice.text, /Bruno hat keinen erlaubten Zug/);
  assert.equal(notice.prominent, true);
  assert.equal(notice.importance, 'important');
});

test('Eigenes Aussetzen wird aus der eigenen Sicht formuliert', () => {
  const [notice] = noticesFor([{ type: 'pass', player: BLACK }], ctx);
  assert.match(notice.text, /^Du hast keinen erlaubten Zug/);
});

test('Eigener Zeitablauf: kritisch, mit Feld und verbleibenden Versuchen', () => {
  const [notice] = noticesFor(
    [{ type: 'timeout', player: BLACK, count: 1, max: 3, square: { row: 2, col: 3 } }],
    ctx,
  );
  assert.equal(notice.importance, 'critical');
  assert.match(notice.text, /D3/);
  assert.match(notice.text, /Noch zweimal/);
});

test('Beim vorletzten Zeitablauf die letzte Warnung', () => {
  const [notice] = noticesFor(
    [{ type: 'timeout', player: BLACK, count: 2, max: 3, square: { row: 0, col: 0 } }],
    ctx,
  );
  assert.match(notice.text, /Beim nächsten Mal gilt die Partie als aufgegeben/);
});

test('Ersatzzug nach Zeitablauf erzeugt keinen doppelten Hinweis', () => {
  const notices = noticesFor(
    [
      { type: 'timeout', player: WHITE, count: 1, max: 3, square: { row: 0, col: 0 } },
      { type: 'move', player: WHITE, row: 0, col: 0, flipped: 7, corner: true, auto: true },
    ],
    ctx,
  );
  assert.equal(notices.length, 1);
});

test('Ecke und großer Zug sind Zusatzhinweise', () => {
  const notices = noticesFor(
    [{ type: 'move', player: WHITE, row: 7, col: 7, flipped: BIG_FLIP, corner: true, auto: false }],
    ctx,
  );
  assert.equal(notices.length, 2);
  assert.ok(notices.every((n) => n.importance === 'extra'));
  assert.match(notices[0].text, /Bruno hat die Ecke H8 besetzt/);
});

test('Stufen: "Nur wichtige" blendet Zusatzhinweise aus, kritische kommen immer', () => {
  assert.equal(visibleAt('important', { importance: 'extra' }), false);
  assert.equal(visibleAt('important', { importance: 'important' }), true);
  assert.equal(visibleAt('warnings', { importance: 'important' }), false);
  assert.equal(visibleAt('warnings', { importance: 'critical' }), true);
  assert.equal(visibleAt('all', { importance: 'extra' }), true);
});

test('Nur ein erlaubter Zug wird angesagt – aber nur, wenn man dran ist', () => {
  const state = { yourTurn: true, finished: false, legalMoves: [{ row: 4, col: 5, flips: 1 }] };
  assert.match(stateNotices(state)[0].text, /F5/);
  assert.equal(stateNotices({ ...state, yourTurn: false }).length, 0);
});

test('Begründungen für das Spielende', () => {
  assert.match(endReasonText({ endReason: 'noMoves', emptySquares: 3 }, ctx), /noch 3 Felder frei/);
  assert.equal(endReasonText({ endReason: 'boardFull' }, ctx), 'Das Brett ist voll.');
  assert.equal(
    endReasonText({ endReason: 'resign', forfeitedBy: BLACK }, ctx),
    'Du hast aufgegeben.',
  );
  assert.match(
    endReasonText({ endReason: 'inactive', forfeitedBy: WHITE, maxTimeouts: 3 }, ctx),
    /Bruno hat dreimal hintereinander nicht rechtzeitig gezogen/,
  );
});

test('Begründungen: alle Gründe aus beiden Blickwinkeln, unbekannter Grund leer', () => {
  assert.equal(
    endReasonText({ endReason: 'wipeout' }, ctx),
    'Eine Farbe hat keinen Stein mehr auf dem Brett.',
  );
  assert.match(endReasonText({ endReason: 'noMoves', emptySquares: 1 }, ctx), /noch ein Feld frei/);
  assert.equal(
    endReasonText({ endReason: 'resign', forfeitedBy: WHITE }, ctx),
    'Bruno hat aufgegeben.',
  );
  assert.match(
    endReasonText({ endReason: 'inactive', forfeitedBy: BLACK, maxTimeouts: 7 }, ctx),
    /^Du hast 7-mal hintereinander/,
  );
  assert.equal(
    endReasonText({ endReason: 'resign', forfeitedBy: 9 }, ctx),
    'Dein Gegner hat aufgegeben.',
  );
  assert.equal(endReasonText({ endReason: 'neu' }, ctx), '');
});

test('Unbekannte Ereignisse ergeben keinen Hinweis; Aufgabe durch Zeitablauf auch nicht', () => {
  assert.deepEqual(noticesFor([{ type: 'gameOver', player: BLACK }], ctx), []);
  assert.deepEqual(noticesFor([{ type: 'timeout', player: BLACK, square: null }], ctx), []);
  assert.deepEqual(
    noticesFor([{ type: 'move', player: BLACK, auto: true, row: 0, col: 0 }], ctx),
    [],
  );
});

test('Zeitablauf mit vielen erlaubten Fehlern: Zahl statt Wort', () => {
  const [notice] = noticesFor(
    [{ type: 'timeout', player: BLACK, count: 1, max: 9, square: { row: 0, col: 0 } }],
    ctx,
  );
  assert.match(notice.text, /Noch 8-mal/);
});

test('Hinweisstufe: unbekannte Stufe zeigt alles', () => {
  assert.equal(visibleAt('unbekannt', { importance: 'extra' }), true);
});

test('Ein Zustand ohne Zug für mich bringt keinen Hinweis', () => {
  assert.deepEqual(
    stateNotices({ yourTurn: true, finished: true, legalMoves: [{ row: 0, col: 0 }] }),
    [],
  );
  assert.deepEqual(stateNotices({ yourTurn: true, finished: false, legalMoves: [{}, {}] }), []);
});

test('Eigene Ecke und eigener großer Zug: aus eigener Sicht, positiver Ton', () => {
  const notices = noticesFor(
    [{ type: 'move', player: BLACK, row: 0, col: 0, flipped: BIG_FLIP, corner: true, auto: false }],
    ctx,
  );
  assert.equal(notices.length, 2);
  assert.match(notices[0].text, /^Ecke A1 gesichert/);
  assert.match(notices[1].text, new RegExp(`^Starker Zug: ${BIG_FLIP} Steine`));
  assert.ok(notices.every((n) => n.tone === 'good'));
});

test('Großer Zug des Gegners: neutraler Ton, mit Namen', () => {
  const [notice] = noticesFor(
    [{ type: 'move', player: WHITE, row: 2, col: 3, flipped: BIG_FLIP + 1, corner: false }],
    ctx,
  );
  assert.equal(notice.text, `Bruno dreht ${BIG_FLIP + 1} Steine auf einmal.`);
  assert.equal(notice.tone, 'info');
});

test('Unbekannter Name des Gegners: "Dein Gegner"', () => {
  const [notice] = noticesFor([{ type: 'pass', player: WHITE }], { me: BLACK, names: {} });
  assert.match(notice.text, /^Dein Gegner /);
});
