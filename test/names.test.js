/**
 * Namensregeln (public/shared/names.js), die Client und Server teilen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanName, MAX_NAME_LENGTH } from '../public/shared/names.js';

test('Ein normaler Name bleibt unverändert', () => {
  assert.equal(cleanName('Christa'), 'Christa');
});

test('Leerraum wird zusammengefasst und am Rand entfernt', () => {
  assert.equal(cleanName('  Anna   Lena  '), 'Anna Lena');
});

test('Erst kürzen, dann den Rand säubern: kein Leerzeichen am Ende', () => {
  const name = cleanName('AAAAAAAAAAAAAAAAAAA Bob');
  assert.equal(name, 'AAAAAAAAAAAAAAAAAAA');
  assert.ok(name.length <= MAX_NAME_LENGTH);
});

test('Gekürzt wird nach Zeichen, ein Emoji wird nicht halbiert', () => {
  const name = cleanName(`Ab${'😀'.repeat(25)}`);
  assert.equal(Array.from(name).length, MAX_NAME_LENGTH);
  assert.equal(name, `Ab${'😀'.repeat(MAX_NAME_LENGTH - 2)}`);
});

test('Steuer- und Formatzeichen werden entfernt', () => {
  assert.equal(cleanName('An‮na\u0007'), 'Anna');
});

test('Leer wirkende Zeichen ergeben keinen Namen', () => {
  for (const blank of ['ㅤ', '⠀⠀', 'ᅟᅠ', 'ﾠ', '   ', '​']) {
    assert.equal(cleanName(blank), '', `U+${blank.codePointAt(0).toString(16)}`);
  }
});

test('Leer wirkende Zeichen innerhalb eines Namens fallen weg', () => {
  assert.equal(cleanName('Boㅤb'), 'Bob');
});

test('Nur ein kombinierendes Zeichen ist kein sichtbarer Name', () => {
  assert.equal(cleanName('́'), '');
});

test('Weniger als zwei Buchstaben ergeben keinen Namen', () => {
  for (const name of ['.', '-', '*', '...', '!!', '.-*', '😀😀', 'A', 'A.', '1', '42', 'A 1']) {
    assert.equal(cleanName(name), '', JSON.stringify(name));
  }
});

test('Zwei Buchstaben genügen, auch mit Satzzeichen, Ziffern und Umlauten', () => {
  for (const name of ['Al', 'Jo-Anne', 'Öz.', 'ßü', 'R2D2', 'Аня', '李明']) {
    assert.equal(cleanName(name), name, JSON.stringify(name));
  }
});

test('Buchstaben zählen erst nach dem Säubern', () => {
  // Ein entferntes Formatzeichen oder ein Hangul-Füller zählt nicht mit.
  assert.equal(cleanName('A‮'), '');
  assert.equal(cleanName('Aㅤ'), '');
});

test('Beispielnamen: alle erfüllen die Namensregel, Auswahl über die Zufallsquelle', async () => {
  const { EXAMPLE_NAMES, exampleName } = await import('../public/shared/names.js');
  for (const name of EXAMPLE_NAMES) assert.equal(cleanName(name), name, name);
  assert.equal(
    exampleName(() => 0),
    EXAMPLE_NAMES[0],
  );
  assert.equal(
    exampleName(() => 0.999999),
    EXAMPLE_NAMES.at(-1),
  );
  assert.ok(!EXAMPLE_NAMES.includes('Christa'));
});

test('Keine Zeichenkette ergibt keinen Namen', () => {
  for (const value of [undefined, null, 42, ['Anna'], { name: 'Anna' }]) {
    assert.equal(cleanName(value), '');
  }
});

test('Gemeinsame Konstanten: Gegenseite und Schreibweisen', async () => {
  const { BLACK, WHITE, opponentOf, sideName, otherSide, squareName } =
    await import('../public/shared/constants.js');
  assert.equal(opponentOf(BLACK), WHITE);
  assert.equal(opponentOf(WHITE), BLACK);
  assert.equal(sideName(BLACK), 'black');
  assert.equal(sideName(WHITE), 'white');
  assert.equal(otherSide('black'), 'white');
  assert.equal(otherSide('white'), 'black');
  assert.equal(squareName(0, 0), 'A1');
  assert.equal(squareName(7, 7), 'H8');
});
