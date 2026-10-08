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

export const STONE_COLORS = [
  { id: 'standard', name: 'Standard' },
  { id: 'black', name: 'Schwarz', hex: '#1a1e1b' },
  { id: 'white', name: 'Weiß', hex: '#f2efe6' },
  { id: 'orange', name: 'Orange', hex: '#e69f00' },
  { id: 'sky-blue', name: 'Himmelblau', hex: '#56b4e9' },
  { id: 'bluish-green', name: 'Blaugrün', hex: '#009e73' },
  { id: 'yellow', name: 'Gelb', hex: '#f0e442' },
  { id: 'blue', name: 'Blau', hex: '#0072b2' },
  { id: 'vermillion', name: 'Zinnoberrot', hex: '#d55e00' },
  { id: 'reddish-purple', name: 'Rosaviolett', hex: '#cc79a7' },
];

/**
 * Näherungswerte der Standardsteine für die Kontrastprüfung. Müssen zu
 * --c-ink und --c-bone in tokens.css passen; das CSS kann JavaScript
 * keine Werte liefern, ohne die Seite erst zu rendern.
 */
export const DEFAULT_STONE = {
  black: '#1a1e1b',
  white: '#f2efe6',
};

export function colorById(id) {
  return STONE_COLORS.find((color) => color.id === id) ?? STONE_COLORS[0];
}

/** Relative Leuchtdichte nach WCAG 2.x. */
export function relativeLuminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
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
 * @param {{mine: string, opponent: string, myColor: 'black'|'white'}} options
 * @returns {{black: string|null, white: string|null, adjusted: boolean, ratio: number}}
 *   null bedeutet: Standardfarbe des Bretts verwenden.
 */
export function resolveStones({ mine, opponent, myColor }) {
  const theirColor = myColor === 'black' ? 'white' : 'black';
  const mineHex = colorById(mine).hex ?? null;
  let theirHex = colorById(opponent).hex ?? null;

  const effectiveMine = mineHex ?? DEFAULT_STONE[myColor];
  let effectiveTheirs = theirHex ?? DEFAULT_STONE[theirColor];

  // Beide Steine gleich? Dann bekommt der Gegner Schwarz oder Weiß –
  // je nachdem, was sich stärker von meiner Farbe abhebt.
  let adjusted = false;
  if (colorDistance(effectiveMine, effectiveTheirs) < SAME_COLOR_DISTANCE) {
    const blackRatio = contrastRatio(effectiveMine, DEFAULT_STONE.black);
    const whiteRatio = contrastRatio(effectiveMine, DEFAULT_STONE.white);
    theirHex = blackRatio >= whiteRatio ? DEFAULT_STONE.black : DEFAULT_STONE.white;
    effectiveTheirs = theirHex;
    adjusted = true;
  }

  const result = { adjusted, ratio: contrastRatio(effectiveMine, effectiveTheirs) };
  result[myColor] = mineHex;
  result[theirColor] = theirHex;
  return result;
}
