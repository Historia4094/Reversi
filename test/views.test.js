/**
 * Kleine Anzeigen: Punktestand (score.js), Zugverlauf (log.js),
 * Ergebnisfenster (result.js) und die Hülle um Socket.io (net.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom, fakeDialog } from './helpers/dom.js';

setupDom(`
  <div id="score-black"><span id="score-black-value"></span><span id="score-black-name"></span></div>
  <div id="score-white"><span id="score-white-value"></span><span id="score-white-name"></span></div>
  <div id="tally"></div><p id="turn-indicator"></p><p id="hint"></p><p id="strikes" hidden></p>
  <ol id="log"></ol><p id="log-empty"></p>
  <dialog id="result"><h2 id="result-title"></h2><p id="result-reason"></p><p id="result-detail"></p>
    <button id="view-board"></button><button id="play-again"></button></dialog>
`);
const { ScoreView } = await import('../public/js/score.js');
const { MoveLog } = await import('../public/js/log.js');
const { ResultView } = await import('../public/js/result.js');
const { connect } = await import('../public/js/net.js');

const BLACK = 1;
const WHITE = 2;
const $ = (id) => document.getElementById(id);

const running = (overrides = {}) => ({
  scores: { [BLACK]: 3, [WHITE]: 1 },
  currentPlayer: BLACK,
  yourTurn: true,
  finished: false,
  passedLast: false,
  timeouts: { mine: 0, opponent: 0 },
  maxTimeouts: 3,
  ...overrides,
});

test('Punktestand: Namen, Zahlen, Anteil und wer am Zug ist', () => {
  const score = new ScoreView();
  score.setPlayers({ me: WHITE, myName: 'Anna', opponentName: 'Bruno' });
  const shown = score.render(running({ yourTurn: false }), { playing: true, rejection: '' });
  assert.equal($('score-white-name').textContent, 'Anna (du)');
  assert.equal($('score-black-name').textContent, 'Bruno');
  assert.equal($('score-black-value').textContent, '3');
  assert.equal($('tally').style.getPropertyValue('--share'), '75');
  assert.equal($('score-black').dataset.active, 'true');
  assert.equal(shown.turn, 'Bruno ist am Zug.');
});

test('Punktestand: Merker für Ablehnung und Aussetzen, Zeitüberschreitungen', () => {
  const score = new ScoreView();
  score.setPlayers({ me: BLACK, myName: 'Anna', opponentName: 'Bruno' });
  score.render(running(), { playing: true, rejection: 'Dieses Feld ist besetzt.' });
  assert.equal($('hint').textContent, 'Dieses Feld ist besetzt.');
  score.render(running({ passedLast: true }), { playing: true, rejection: '' });
  assert.match($('hint').textContent, /Bruno hat keinen erlaubten Zug/);
  score.render(running({ passedLast: true, yourTurn: false }), { playing: true, rejection: '' });
  assert.match($('hint').textContent, /^Du hast keinen erlaubten Zug/);
  const shown = score.render(running({ timeouts: { mine: 1, opponent: 2 } }), {
    playing: true,
    rejection: '',
  });
  assert.equal(
    shown.strikes,
    'Du hast 1 von 3 Zeitüberschreitungen in Folge. Bruno: 2 von 3 Zeitüberschreitungen in Folge.',
  );
  assert.equal($('strikes').hidden, false);
});

test('Punktestand nach dem Ende: niemand am Zug, kein Merker', () => {
  const score = new ScoreView();
  const shown = score.render(running(), { playing: false, rejection: 'alt' });
  assert.equal(shown.turn, 'Partie beendet.');
  assert.equal($('hint').textContent, '');
  assert.equal($('score-black').dataset.active, 'false');
});

test('Zugverlauf: neuester Eintrag oben, Aussetzen und Markierungen', () => {
  const log = new MoveLog($('log'), $('log-empty'));
  const names = { [BLACK]: 'Anna', [WHITE]: 'Bruno' };
  log.render(
    [
      { type: 'move', n: 1, player: BLACK, row: 2, col: 3, flipped: 1 },
      { type: 'pass', player: WHITE },
      { type: 'move', n: 2, player: BLACK, row: 0, col: 0, flipped: 2, corner: true, auto: true },
    ],
    { me: BLACK, names },
  );
  const items = [...$('log').children].map((li) => li.textContent);
  assert.deepEqual(items, [
    '2Du · A1 · 2 gedrehtEckeZeit abgelaufen',
    'Bruno setzt aus – kein erlaubter Zug',
    '1Du · D3 · 1 gedreht',
  ]);
  assert.equal($('log-empty').hidden, true);
  log.render([], { me: BLACK, names }); // neue Partie: kürzerer Verlauf
  assert.equal($('log').children.length, 0);
  assert.equal($('log-empty').hidden, false);
});

test('Ergebnisfenster: Texte, leerer Grund ausgeblendet, Knöpfe', () => {
  const dialog = fakeDialog($('result'));
  let again = 0;
  const result = new ResultView(dialog, {
    open: (d) => d.showModal(),
    onPlayAgain: () => (again += 1),
  });
  result.show({ title: 'Du gewinnst', detail: '40 zu 24 Steine.' });
  assert.equal(result.isOpen, true);
  assert.equal($('result-title').textContent, 'Du gewinnst');
  assert.equal($('result-reason').hidden, true);
  assert.equal(document.activeElement, $('play-again'));
  $('view-board').click();
  assert.equal(result.isOpen, false);
  $('play-again').click();
  assert.equal(again, 1);
  result.close(); // schon zu: kein Fehler
});

test('net.js: Ereignisse an die Handler, Absichten an den Server', () => {
  const listeners = {};
  const sent = [];
  let options;
  window.io = (opts) => {
    options = opts;
    return {
      on: (event, fn) => (listeners[event] = fn),
      emit: (...args) => sent.push(args),
    };
  };
  const calls = [];
  const net = connect({
    state: (payload) => calls.push(['state', payload]),
    connected: () => calls.push(['connected']),
    connectionLost: () => calls.push(['lost']),
  });
  listeners.state({ a: 1 });
  listeners.waiting({}); // ohne Handler: nichts
  listeners.connect();
  listeners.disconnect();
  listeners.connect_error();
  assert.deepEqual(calls, [['state', { a: 1 }], ['connected'], ['lost'], ['lost']]);
  assert.equal(options.path, '/socket.io', 'Pfad relativ zur Seite');
  net.join('Anna', 2);
  net.move(1, 2);
  net.resign();
  net.leave();
  assert.deepEqual(sent, [
    ['join', { name: 'Anna', ticket: 2 }],
    ['move', { row: 1, col: 2 }],
    ['resign'],
    ['leave'],
  ]);
});
