/**
 * Anzeige der Bedenkzeit (public/js/clock.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom } from './helpers/dom.js';

setupDom(
  '<div id="clock" hidden><span id="label"></span><span id="time"></span><span id="fill"></span></div>',
);
const { ClockView, WARN_MS } = await import('../public/js/clock.js');

function setup(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  const warnings = [];
  const el = {
    root: document.getElementById('clock'),
    time: document.getElementById('time'),
    fill: document.getElementById('fill'),
    label: document.getElementById('label'),
  };
  const clock = new ClockView(el, { onWarn: (seconds) => warnings.push(seconds) });
  return { clock, el, warnings };
}

test('Zeigt die Restzeit und den Anteil als --remaining', (t) => {
  const { clock, el } = setup(t);
  clock.start(30_000, 60_000, true, 'Deine Bedenkzeit');
  assert.equal(el.time.textContent, '0:30');
  assert.equal(el.fill.style.getPropertyValue('--remaining'), '0.5');
  assert.equal(el.root.hidden, false);
  assert.equal(el.label.textContent, 'Deine Bedenkzeit');
  t.mock.timers.tick(10_000);
  assert.equal(el.time.textContent, '0:20');
  clock.stop();
});

test('Warnung genau einmal, nur bei der eigenen Uhr', (t) => {
  const { clock, el, warnings } = setup(t);
  clock.start(WARN_MS + 2000, 60_000, true, 'Deine Bedenkzeit');
  for (let i = 0; i < 24; i++) t.mock.timers.tick(250);
  assert.deepEqual(warnings, [15]);
  assert.equal(el.root.dataset.state, 'warn');
  for (let i = 0; i < 40; i++) t.mock.timers.tick(250);
  assert.equal(el.root.dataset.state, 'critical');
  clock.stop();

  clock.start(WARN_MS + 2000, 60_000, false, 'Bedenkzeit von Bruno');
  t.mock.timers.tick(5000);
  assert.deepEqual(warnings, [15], 'keine Warnung für die Uhr des Gegners');
  clock.stop();
});

test('Neu gestartet unterhalb der Warnschwelle: keine zweite Warnung', (t) => {
  const { clock, warnings } = setup(t);
  clock.start(10_000, 60_000, true, 'Deine Bedenkzeit');
  t.mock.timers.tick(2000);
  assert.deepEqual(warnings, []);
  clock.stop();
});

test('Kurze Bedenkzeit (8 s): Warnung zur Hälfte, Farben verschieben mit', (t) => {
  const { clock, el, warnings } = setup(t);
  clock.start(8000, 8000, true, 'Deine Bedenkzeit');
  assert.equal(el.root.dataset.state, 'normal', 'zu Beginn noch nicht auffällig');
  t.mock.timers.tick(3750);
  assert.deepEqual(warnings, [], 'vor der Hälfte noch keine Warnung');
  t.mock.timers.tick(250);
  assert.deepEqual(warnings, [4]);
  assert.equal(el.root.dataset.state, 'warn');
  t.mock.timers.tick(3000);
  assert.equal(el.root.dataset.state, 'critical');
  assert.deepEqual(warnings, [4], 'genau einmal');
  clock.stop();
});

test('Warnschwelle: 15 s ab 16 s Bedenkzeit, darunter die Hälfte', async () => {
  const { warnAt } = await import('../public/js/clock.js');
  assert.equal(warnAt(60_000), WARN_MS);
  assert.equal(warnAt(16_000), WARN_MS);
  assert.equal(warnAt(15_000), 7500);
  assert.equal(warnAt(200), 100);
});

test('Bei 0 bleibt die Anzeige stehen; stop blendet aus', (t) => {
  const { clock, el } = setup(t);
  clock.start(500, 60_000, false, 'Bedenkzeit von Bruno');
  t.mock.timers.tick(1000);
  assert.equal(el.time.textContent, '0:00');
  assert.equal(clock.interval, null);
  clock.stop();
  assert.equal(el.root.hidden, true);
});
