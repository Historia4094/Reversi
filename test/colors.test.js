/**
 * Steinfarben: Zuordnung von "meine Farbe" zu Schwarz/Weiß und
 * Schutz davor, dass beide Seiten gleich aussehen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STONE_BOARD_RATIO,
  STONE_COLORS,
  contrastRatio,
  edgeColorFor,
  markColorFor,
  resolveStones,
  toHex,
} from '../public/js/colors.js';

/** Seitenfarben des Filzbretts, wie sie settings.js aus tokens.css liest. */
const SIDES = { black: '#1a1e1b', white: '#f2efe6' };

test('Kontrastverhältnis nach WCAG: Schwarz auf Weiß ist 21', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
});

test('Standard bedeutet: keine eigene Farbe, das Brett bestimmt', () => {
  const stones = resolveStones({
    mine: 'standard',
    opponent: 'standard',
    myColor: 'black',
    sides: SIDES,
  });
  assert.equal(stones.black, null);
  assert.equal(stones.white, null);
  assert.equal(stones.adjusted, false);
});

test('Meine Farbe landet auf meiner Seite – auch wenn ich Weiß spiele', () => {
  const stones = resolveStones({
    mine: 'orange',
    opponent: 'standard',
    myColor: 'white',
    sides: SIDES,
  });
  assert.equal(stones.white, '#e69f00');
  assert.equal(stones.black, null);
});

test('Gleiche Farbe für beide wird verhindert', () => {
  const stones = resolveStones({ mine: 'blue', opponent: 'blue', myColor: 'black', sides: SIDES });
  assert.equal(stones.adjusted, true);
  assert.equal(stones.black, '#0072b2');
  // Blau ist dunkel -> der Gegner wird hell dargestellt.
  assert.equal(stones.white, SIDES.white);
});

test('Auch "Weiß" gegen die Standard-Weiß-Seite wird erkannt', () => {
  // Ich spiele Schwarz, wähle aber Weiß; der Gegner (weiße Seite) steht auf Standard.
  const stones = resolveStones({
    mine: 'white',
    opponent: 'standard',
    myColor: 'black',
    sides: SIDES,
  });
  assert.equal(stones.adjusted, true);
  assert.equal(stones.white, SIDES.black);
});

test('Symbolfarbe: hell auf dunklem Stein, dunkel auf hellem', () => {
  assert.equal(markColorFor('#1a1e1b'), '#ffffff');
  assert.equal(markColorFor('#f0e442'), '#111111');
});

test('Gleich hell, aber verschiedene Farben: keine Korrektur, nur schwacher Kontrast', () => {
  const stones = resolveStones({
    mine: 'orange',
    opponent: 'sky-blue',
    myColor: 'black',
    sides: SIDES,
  });
  assert.equal(stones.adjusted, false);
  assert.equal(stones.white, '#56b4e9');
  assert.ok(stones.ratio < 2, 'Helligkeit fast gleich – dafür gibt es die Warnung');
});

test('"Schwarz" und "Weiß" nehmen die Seitenfarben des Bretts', () => {
  const wood = { black: '#241c14', white: '#faf5e9' };
  const stones = resolveStones({
    mine: 'standard',
    opponent: 'black',
    myColor: 'black',
    sides: wood,
  });
  // Gegner wählt Schwarz wie ich: wird erkannt, Gegner bekommt Weiß des Holzbretts.
  assert.equal(stones.adjusted, true);
  assert.equal(stones.white, wood.white);
});

test('oklch aus tokens.css wird für die Kontrastrechnung zu Hex', () => {
  assert.equal(toHex('oklch(1 0 0)'), '#ffffff');
  assert.equal(toHex('oklch(0 0 0)'), '#000000');
  assert.equal(toHex(' oklch(0.375 0.03 161.6) '), '#33463c');
  assert.equal(toHex('oklch(37.5% 0.03 161.6deg)'), '#33463c');
  assert.equal(toHex('#ABC'), '#aabbcc');
  assert.equal(toHex('#33463c'), '#33463c');
  assert.equal(toHex('rebeccapurple'), null);
});

/**
 * Spielfläche und Seitenfarben der vier Bretter, abgeschrieben aus
 * tokens.css (--c-felt, --c-ink, --c-bone).
 */
const BOARDS = {
  felt: ['oklch(0.375 0.03 161.6)', 'oklch(0.23 0.008 153.3)', 'oklch(0.952 0.012 91.5)'],
  wood: ['oklch(0.67 0.089 68.7)', 'oklch(0.233 0.019 66.6)', 'oklch(0.971 0.017 88)'],
  marine: ['oklch(0.401 0.062 230.3)', 'oklch(0.212 0.015 235.9)', 'oklch(0.959 0.01 87.5)'],
  contrast: ['oklch(0.439 0.011 243)', 'oklch(0 0 0)', 'oklch(1 0 0)'],
};

test('Rand: Hebt sich der Stein selbst ab, bleibt der Rand aus tokens.css', () => {
  const [board, black, white] = BOARDS.felt.map(toHex);
  assert.equal(edgeColorFor('#e69f00', board, { black, white }), null);
  assert.equal(edgeColorFor(white, board, { black, white }), null);
});

test('Rand: Oranger Stein auf Holz bekommt den dunklen Rand des Bretts', () => {
  const [board, black, white] = BOARDS.wood.map(toHex);
  assert.ok(contrastRatio('#e69f00', board) < STONE_BOARD_RATIO, 'ohne Rand zu schwach');
  assert.equal(edgeColorFor('#e69f00', board, { black, white }), black);
});

test('Rand: Ohne bekannte Brettfarbe wird nichts geändert', () => {
  assert.equal(edgeColorFor('#e69f00', null, SIDES), null);
});

test('Jede eigene Steinfarbe hebt sich auf jedem Brett mit mindestens 3:1 ab', () => {
  // "Standard" fehlt hier: Dafür gilt der Rand aus tokens.css.
  const custom = STONE_COLORS.filter((color) => color.id !== 'standard');
  for (const [name, values] of Object.entries(BOARDS)) {
    const [board, black, white] = values.map(toHex);
    const sides = { black, white };
    for (const color of custom) {
      const stone = color.hex ?? sides[color.side];
      const edge = edgeColorFor(stone, board, sides);
      const ratio = contrastRatio(edge ?? stone, board);
      assert.ok(ratio >= STONE_BOARD_RATIO, `${color.name} auf ${name}: ${ratio.toFixed(2)}:1`);
    }
  }
});
