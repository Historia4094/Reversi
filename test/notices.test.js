/**
 * Hinweise und Ansagen (public/js/notices.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setupDom } from './helpers/dom.js';

const window = setupDom(`
  <div id="banner" hidden><p class="banner__text"></p><button class="banner__close"></button></div>
  <div id="toasts"></div>
  <div id="announcer"></div>
  <dialog id="dialog"></dialog>
`);
const { Notifier } = await import('../public/js/notices.js');

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const $ = (id) => document.getElementById(id);
  const notifier = new Notifier({
    toastRoot: $('toasts'),
    banner: $('banner'),
    announcer: $('announcer'),
  });
  t.after(() => notifier.clear());
  return { notifier, $ };
}

test('Was gleichzeitig angesagt wird, kommt als eine Ansage', (t) => {
  const { notifier, $ } = setup(t);
  notifier.show({ text: 'Bruno setzt aus.', prominent: true });
  notifier.say('Du bist am Zug.');
  assert.equal($('announcer').textContent, '', 'erst leeren, dann füllen');
  t.mock.timers.tick(60);
  assert.equal($('announcer').textContent, 'Bruno setzt aus. Du bist am Zug.');
});

test('Leere Texte werden nicht angesagt', (t) => {
  const { notifier } = setup(t);
  notifier.say('');
  assert.equal(notifier.announceTimer, null);
});

test('Wichtige Ereignisse über dem Brett, Schließen-Knopf behält seinen Platz', (t) => {
  const { notifier, $ } = setup(t);
  notifier.show({ text: 'Eins', prominent: true, tone: 'warn' });
  notifier.show({ text: 'Zwei', prominent: true });
  assert.equal($('banner').hidden, false);
  assert.equal($('banner').querySelector('.banner__text').textContent, 'Eins');
  assert.ok($('banner').querySelector('.banner__close'), 'Knopf noch da');
  $('banner').querySelector('.banner__close').click();
  assert.equal($('banner').querySelector('.banner__text').textContent, 'Zwei');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal($('banner').hidden, true);
});

test('Höchstens zwei Toasts, sie verschwinden von selbst', (t) => {
  const { notifier, $ } = setup(t);
  for (const text of ['a', 'b', 'c']) notifier.show({ text });
  assert.deepEqual(
    [...$('toasts').children].map((n) => n.textContent),
    ['b', 'c'],
  );
  t.mock.timers.tick(5000);
  assert.equal($('toasts').children.length, 0);
});

test('Bei offenem Fenster liegen Toasts und Ansage im Fenster, Einblendungen werden Toasts', (t) => {
  const { notifier, $ } = setup(t);
  const dialog = $('dialog');
  notifier.attach(dialog);
  assert.equal($('toasts').parentElement, dialog);
  assert.equal($('announcer').parentElement, dialog);
  notifier.show({ text: 'Deine Zeit ist abgelaufen.', prominent: true });
  assert.equal($('banner').hidden, true);
  assert.equal($('toasts').textContent, 'Deine Zeit ist abgelaufen.');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  notifier.detach(document.createElement('dialog')); // anderes Fenster: nichts
  assert.equal($('toasts').parentElement, dialog);
  notifier.detach(dialog);
  assert.equal($('toasts').parentElement, document.body);
});
