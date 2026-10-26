/**
 * Einstellungen (public/js/settings.js): Laden, Prüfen, Speichern und die
 * Steinfarben des gewählten Bretts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom } from './helpers/dom.js';

const window = setupDom('<p id="stone-warning" hidden></p>', {
  css: `
    :root { --c-ink: oklch(0.23 0.008 153.3); --c-bone: oklch(0.952 0.012 91.5); --c-felt: #33463c; }
    [data-board='wood'] { --c-ink: #241c14; --c-bone: #faf5e9; --c-felt: #b98b57; }
  `,
});
const { Settings, DEFAULTS } = await import('../public/js/settings.js');

const KEY = 'reversi.settings.v2';

test.beforeEach(() => window.localStorage.clear());

test('Ein Fremdschlüssel wie "toString" kostet nur sich selbst', () => {
  window.localStorage.setItem(KEY, JSON.stringify({ board: 'wood', coords: true, toString: 'x' }));
  const settings = new Settings();
  assert.equal(settings.get('board'), 'wood');
  assert.equal(settings.get('coords'), true);
  assert.equal(settings.values.toString, Object.prototype.toString, 'kein eigener Eintrag');
});

test('Ungültige Werte werden einzeln verworfen', () => {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ board: 'lava', symbols: 'ja', lastMove: false }),
  );
  const settings = new Settings();
  assert.equal(settings.get('board'), DEFAULTS.board);
  assert.equal(settings.get('symbols'), DEFAULTS.symbols);
  assert.equal(settings.get('lastMove'), false);
});

test('Kaputter Speicher: Vorgaben und eine Warnung', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  window.localStorage.setItem(KEY, '{kein json');
  const settings = new Settings();
  assert.deepEqual(settings.values, { ...DEFAULTS });
  assert.equal(warn.mock.callCount(), 1);
});

test('Gespeichert wird kein Objekt: Vorgaben', () => {
  window.localStorage.setItem(KEY, JSON.stringify(['wood']));
  assert.deepEqual(new Settings().values, { ...DEFAULTS });
});

test('set speichert gültige Werte, meldet sie und ignoriert ungültige', () => {
  const settings = new Settings();
  const seen = [];
  settings.onChange((key, value) => seen.push([key, value]));
  settings.set('board', 'marine');
  settings.set('board', 'lava');
  settings.set('toString', 'x');
  assert.deepEqual(seen, [['board', 'marine']]);
  assert.equal(JSON.parse(window.localStorage.getItem(KEY)).board, 'marine');
  assert.equal(document.documentElement.dataset.board, 'marine');
});

test('reset stellt alle Vorgaben wieder her', () => {
  const settings = new Settings();
  settings.set('coords', true);
  settings.reset();
  assert.equal(settings.get('coords'), DEFAULTS.coords);
  assert.equal(document.documentElement.dataset.coords, 'off');
});

test('Die Seitenfarben kommen aus dem CSS des gewählten Bretts', () => {
  const settings = new Settings();
  settings.set('board', 'felt');
  assert.deepEqual(settings.boardSides(), { black: '#1a1e1b', white: '#f2efe6' });
  settings.set('board', 'wood');
  assert.deepEqual(settings.boardSides(), { black: '#241c14', white: '#faf5e9' });
});

test('Eigene Steinfarbe, die im Brett verschwimmt, bekommt einen passenden Rand', () => {
  const settings = new Settings();
  const style = document.documentElement.style;
  settings.set('board', 'wood');
  settings.set('stoneMine', 'orange');
  assert.equal(style.getPropertyValue('--user-edge-b'), '#241c14', 'dunkler Rand auf Holz');
  settings.set('board', 'felt');
  assert.equal(style.getPropertyValue('--user-edge-b'), '', 'Orange auf Filz braucht keinen');
  settings.set('board', 'wood');
  settings.set('stoneMine', 'standard');
  assert.equal(style.getPropertyValue('--user-edge-b'), '', 'Standardfarbe: Rand aus tokens.css');
});

test('Gleiche Farbe für beide Seiten: Warnhinweis mit der Ersatzfarbe', () => {
  const settings = new Settings();
  settings.set('stoneMine', 'blue');
  settings.set('stoneOpponent', 'blue');
  const warning = document.getElementById('stone-warning');
  assert.equal(warning.hidden, false);
  assert.match(warning.textContent, /in Weiß angezeigt/);
  assert.ok(document.documentElement.style.getPropertyValue('--user-stone-b'));
});

test('Formularfelder werden gebunden und bleiben synchron', () => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<input type="checkbox" data-setting="coords" id="c1">
     <input type="checkbox" data-setting="coords" id="c2">
     <input type="checkbox" data-setting="toString" id="foreign">`,
  );
  const settings = new Settings();
  settings.bind();
  const first = document.getElementById('c1');
  first.checked = true;
  first.dispatchEvent(new window.Event('change'));
  assert.equal(settings.get('coords'), true);
  assert.equal(document.getElementById('c2').checked, true);
  assert.equal(settings.controls.length, 2, 'unbekannte Einstellung wird nicht gebunden');
});

test('Ohne Speicher (privates Fenster) gelten die Einstellungen bis zum Neuladen', (t) => {
  t.mock.method(window.localStorage.__proto__, 'setItem', () => {
    throw new Error('QuotaExceededError');
  });
  const settings = new Settings();
  settings.set('coords', true);
  assert.equal(settings.get('coords'), true);
});

test('Perspektive: Vorschau zeigt meine und die Gegnerseite, schwacher Kontrast warnt', () => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<span data-stone-preview="mine"></span><span data-stone-preview="opponent"></span>
     <select data-options="stones" data-setting="stoneMine"></select>`,
  );
  const settings = new Settings();
  settings.bind();
  assert.ok(document.querySelector('select[data-options] option[value="orange"]'));
  settings.setPerspective('white');
  assert.equal(document.querySelector('[data-stone-preview="mine"]').dataset.side, 'white');
  assert.equal(document.querySelector('[data-stone-preview="opponent"]').dataset.side, 'black');
  settings.set('stoneMine', 'orange');
  settings.set('stoneOpponent', 'sky-blue');
  assert.match(document.getElementById('stone-warning').textContent, /kaum in der Helligkeit/);
  settings.set('symbols', true);
  assert.equal(document.getElementById('stone-warning').hidden, true, 'mit Symbolen keine Warnung');
  settings.set('stoneMine', 'black');
  settings.set('stoneOpponent', 'black');
  assert.match(document.getElementById('stone-warning').textContent, /in Weiß angezeigt/);
  settings.setPerspective('black');
  settings.set('stoneMine', 'white');
  settings.set('stoneOpponent', 'white');
  assert.match(document.getElementById('stone-warning').textContent, /in Schwarz angezeigt/);
});

test('Jede Einstellung, die kein Schalter ist, hat eine Liste erlaubter Werte', () => {
  // isValid() verlässt sich darauf; eine neue Einstellung ohne Liste
  // fiele sonst erst beim Laden auf.
  const settings = new Settings();
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (typeof value === 'boolean') continue;
    settings.set(key, value);
    assert.equal(settings.get(key), value, key);
  }
});

test('reset meldet allen Zuhörern die Änderung; abgemeldete hören nichts mehr', () => {
  const settings = new Settings();
  const heard = [];
  const stop = settings.onChange((key, value) => heard.push([key, value]));
  settings.reset();
  assert.deepEqual(heard, [['*', null]]);
  stop();
  settings.set('coords', true);
  assert.deepEqual(heard, [['*', null]]);
});

test('Auswahlfelder, Optionsknöpfe und Schalter schreiben ihren Wert', () => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="form">
       <select data-setting="notices">
         <option value="all">alle</option><option value="important">wichtig</option>
       </select>
       <input type="radio" name="hints" value="rings" data-setting="moveHints">
       <input type="radio" name="hints" value="off" data-setting="moveHints">
       <input type="checkbox" data-setting="reduceMotion">
       <input type="checkbox" data-setting="lastMove">
     </div>`,
  );
  const form = document.getElementById('form');
  const settings = new Settings();
  settings.bind(form);
  const [rings, off] = form.querySelectorAll('[type=radio]');
  assert.equal(rings.checked, true, 'sync setzt den passenden Optionsknopf');

  const select = form.querySelector('select');
  select.value = 'important';
  select.dispatchEvent(new window.Event('change'));
  assert.equal(settings.get('notices'), 'important');

  // Ein Optionsknopf, der gerade abgewählt wurde, ändert nichts.
  rings.checked = false;
  rings.dispatchEvent(new window.Event('change'));
  assert.equal(settings.get('moveHints'), 'rings');
  off.checked = true;
  off.dispatchEvent(new window.Event('change'));
  assert.equal(settings.get('moveHints'), 'off');

  const [motion, lastMove] = form.querySelectorAll('[type=checkbox]');
  motion.checked = true;
  motion.dispatchEvent(new window.Event('change'));
  lastMove.checked = false;
  lastMove.dispatchEvent(new window.Event('change'));
  assert.equal(document.documentElement.dataset.motion, 'reduced');
  assert.equal(document.documentElement.dataset.lastMove, 'off');
  form.remove();
});

test('Ohne Farben im CSS gelten Schwarz und Weiß als Seitenfarben', () => {
  const style = document.querySelector('style');
  const css = style.textContent;
  style.textContent = '';
  try {
    const settings = new Settings();
    assert.deepEqual(settings.boardSides(), { black: '#000000', white: '#ffffff' });
    assert.equal(settings.boardColor(), null);
  } finally {
    style.textContent = css;
  }
});

test('Ohne Warnfeld auf der Seite gibt es keinen Fehler', () => {
  const warning = document.getElementById('stone-warning');
  warning.remove();
  try {
    const settings = new Settings();
    settings.set('stoneMine', 'blue');
    settings.set('stoneOpponent', 'blue');
    assert.ok(document.documentElement.style.getPropertyValue('--user-stone-b'));
  } finally {
    document.body.prepend(warning);
  }
});
