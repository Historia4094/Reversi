/**
 * Steinfarben: Zuordnung von "meine Farbe" zu Schwarz/Weiß und
 * Schutz davor, dass beide Seiten gleich aussehen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStones, contrastRatio, markColorFor, DEFAULT_STONE } from '../public/js/colors.js';

test('Kontrastverhältnis nach WCAG: Schwarz auf Weiß ist 21', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
});

test('Standard bedeutet: keine eigene Farbe, das Brett bestimmt', () => {
  const stones = resolveStones({ mine: 'standard', opponent: 'standard', myColor: 'black' });
  assert.equal(stones.black, null);
  assert.equal(stones.white, null);
  assert.equal(stones.adjusted, false);
});

test('Meine Farbe landet auf meiner Seite – auch wenn ich Weiß spiele', () => {
  const stones = resolveStones({ mine: 'orange', opponent: 'standard', myColor: 'white' });
  assert.equal(stones.white, '#e69f00');
  assert.equal(stones.black, null);
});

test('Gleiche Farbe für beide wird verhindert', () => {
  const stones = resolveStones({ mine: 'blue', opponent: 'blue', myColor: 'black' });
  assert.equal(stones.adjusted, true);
  assert.equal(stones.black, '#0072b2');
  // Blau ist dunkel -> der Gegner wird hell dargestellt.
  assert.equal(stones.white, DEFAULT_STONE.white);
});

test('Auch "Weiß" gegen die Standard-Weiß-Seite wird erkannt', () => {
  // Ich spiele Schwarz, wähle aber Weiß; der Gegner (weiße Seite) steht auf Standard.
  const stones = resolveStones({ mine: 'white', opponent: 'standard', myColor: 'black' });
  assert.equal(stones.adjusted, true);
  assert.equal(stones.white, DEFAULT_STONE.black);
});

test('Symbolfarbe: hell auf dunklem Stein, dunkel auf hellem', () => {
  assert.equal(markColorFor('#1a1e1b'), '#ffffff');
  assert.equal(markColorFor('#f0e442'), '#111111');
});

test('Gleich hell, aber verschiedene Farben: keine Korrektur, nur schwacher Kontrast', () => {
  const stones = resolveStones({ mine: 'orange', opponent: 'sky-blue', myColor: 'black' });
  assert.equal(stones.adjusted, false);
  assert.equal(stones.white, '#56b4e9');
  assert.ok(stones.ratio < 2, 'Helligkeit fast gleich – dafür gibt es die Warnung');
});
