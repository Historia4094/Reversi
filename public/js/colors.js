/**
 * Steinfarben und Kontrastprüfung.
 *
 * Reine Funktionen ohne DOM, deshalb auch unter Node testbar.
 *
 * Die bunten Farben sind die Palette von Masataka Okabe und Kei Ito
 * (Color Universal Design, https://jfly.uni-koeln.de/color/). Sie wurde
 * dafür entworfen, dass die Farben auch bei den häufigen Formen der
 * Farbsehschwäche unterscheidbar bleiben. Schwarz und Weiß sind eigene
 * Werte und ohnehin unproblematisch, weil sie sich in der Helligkeit
 * unterscheiden, nicht im Farbton.
 */

import { otherSide } from '../shared/constants.js';

export const STONE_COLORS = [
  { id: 'standard', name: 'Standard' },
  // Schwarz und Weiß sind die Seitenfarben des gewählten Bretts. Sie
  // stehen nur in tokens.css (--c-ink, --c-bone) und werden dort gelesen.
  { id: 'black', name: 'Schwarz', side: 'black' },
  { id: 'white', name: 'Weiß', side: 'white' },
  { id: 'orange', name: 'Orange', hex: '#e69f00' },
  { id: 'sky-blue', name: 'Himmelblau', hex: '#56b4e9' },
  { id: 'bluish-green', name: 'Blaugrün', hex: '#009e73' },
  { id: 'yellow', name: 'Gelb', hex: '#f0e442' },
  { id: 'blue', name: 'Blau', hex: '#0072b2' },
  { id: 'vermillion', name: 'Zinnoberrot', hex: '#d55e00' },
  { id: 'reddish-purple', name: 'Rosaviolett', hex: '#cc79a7' },
];

export function colorById(id) {
  return STONE_COLORS.find((color) => color.id === id) ?? STONE_COLORS[0];
}

/**
 * Hex-Wert eines Eintrags. Schwarz und Weiß nehmen die Seitenfarben des
 * Bretts (sides), alle anderen ihren festen Wert. null = Standard.
 */
function hexOf(color, sides) {
  if (color.hex) return color.hex;
  return color.side ? sides[color.side] : null;
}

/**
 * Wandelt eine CSS-Farbe in Hex, für die Kontrastrechnung. Versteht die
 * beiden Schreibweisen aus tokens.css: #rgb/#rrggbb und oklch(L C H).
 * @param {string} value
 * @returns {string | null} null, wenn die Schreibweise unbekannt ist.
 */
export function toHex(value) {
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((c) => c + c).join('')}`;
  const match = text.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/);
  if (!match) return null;
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  return oklchToHex(lightness, Number(match[3]), Number(match[4]));
}

/** oklch → sRGB, nach Björn Ottosson (https://bottosson.github.io/posts/oklab/). */
function oklchToHex(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const channel = (c) => {
    const v = Math.min(1, Math.max(0, c));
    const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${linear.map(channel).join('')}`;
}

/** Relative Leuchtdichte nach WCAG 2.x. */
export function relativeLuminance(hex) {
  const channels = rgb(hex).map((c) => c / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhältnis nach WCAG: 1 (gleich) bis 21 (Schwarz auf Weiß). */
export function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Farbe für das Symbol auf einem Stein: hell auf dunklem, dunkel auf hellem Stein. */
export function markColorFor(hex) {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#111111') ? '#ffffff' : '#111111';
}

/** Mindestkontrast eines Steins zum Brett (WCAG 1.4.11, Grafiken). */
export const STONE_BOARD_RATIO = 3;

/**
 * Rand für einen Stein in eigener Farbe.
 *
 * Die Ränder in tokens.css (--stone-edge-b/-w) passen nur zu den
 * Standardfarben: Auf Holz etwa braucht ein schwarzer Stein keinen hellen
 * Rand. Ein oranger Stein auf der schwarzen Seite aber schon, sonst
 * verschwimmt er mit dem Brett. Hebt sich der Stein selbst nicht genug ab,
 * bekommt er deshalb die Seitenfarbe des Bretts als Rand, die sich
 * stärker vom Brett abhebt – auf allen vier Brettern mindestens 5,5:1.
 * @param {string} stone Steinfarbe als Hex.
 * @param {string | null} board Spielfläche als Hex; null = unbekannt.
 * @param {{black: string, white: string}} sides Seitenfarben des Bretts.
 * @returns {string | null} null = Rand aus tokens.css behalten.
 */
export function edgeColorFor(stone, board, sides) {
  if (!board || contrastRatio(stone, board) >= STONE_BOARD_RATIO) return null;
  return contrastRatio(sides.white, board) >= contrastRatio(sides.black, board)
    ? sides.white
    : sides.black;
}

/**
 * Abstand im RGB-Raum, unter dem zwei Steinfarben als praktisch gleich
 * gelten. Bewusst nicht über die Helligkeit geprüft: Orange und
 * Himmelblau sind fast gleich hell, aber klar verschiedene Farben.
 */
export const SAME_COLOR_DISTANCE = 60;

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

/** Euklidischer Abstand zweier Farben im RGB-Raum (0 bis ca. 441). */
export function colorDistance(a, b) {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
/** Unter diesem Verhältnis sind Steine nur über den Farbton unterscheidbar. */
export const WEAK_CONTRAST_RATIO = 2;

/**
 * Löst "meine Farbe" und "Gegnerfarbe" in Farben für die schwarze und die
 * weiße Seite auf.
 *
 * Die Einstellungen beziehen sich auf Personen (ich / Gegner), das Brett
 * aber auf Seiten (Schwarz / Weiß). Welche Seite ich bin, steht erst fest,
 * wenn die Partie beginnt – deshalb passiert die Zuordnung hier.
 *
 * @param {{mine: string, opponent: string, myColor: 'black'|'white',
 *   sides: {black: string, white: string}}} options sides = Standardfarben
 *   der beiden Seiten auf dem aktuellen Brett, als Hex (aus tokens.css).
 * @returns {{black: string|null, white: string|null, adjusted: boolean, ratio: number}}
 *   null bedeutet: Standardfarbe des Bretts verwenden.
 */
export function resolveStones({ mine, opponent, myColor, sides }) {
  const theirColor = otherSide(myColor);
  const mineHex = hexOf(colorById(mine), sides);
  let theirHex = hexOf(colorById(opponent), sides);

  const effectiveMine = mineHex ?? sides[myColor];
  let effectiveTheirs = theirHex ?? sides[theirColor];

  // Beide Steine gleich? Dann bekommt der Gegner Schwarz oder Weiß –
  // je nachdem, was sich stärker von meiner Farbe abhebt.
  let adjusted = false;
  if (colorDistance(effectiveMine, effectiveTheirs) < SAME_COLOR_DISTANCE) {
    const blackRatio = contrastRatio(effectiveMine, sides.black);
    const whiteRatio = contrastRatio(effectiveMine, sides.white);
    theirHex = blackRatio >= whiteRatio ? sides.black : sides.white;
    effectiveTheirs = theirHex;
    adjusted = true;
  }

  const result = { adjusted, ratio: contrastRatio(effectiveMine, effectiveTheirs) };
  result[myColor] = mineHex;
  result[theirColor] = theirHex;
  return result;
}
