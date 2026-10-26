/**
 * Regeln für den Anzeigenamen. Client und Server verwenden dieselbe
 * Funktion: Der Client zeigt so schon vor dem Senden einen Fehler, und
 * der Server verlässt sich trotzdem nicht darauf, weil ein manipulierter
 * Client alles schicken kann.
 */

export const MAX_NAME_LENGTH = 20;
export const MIN_NAME_LETTERS = 2;
export const FALLBACK_NAME = 'Spieler';

/** Beispiele für das Namensfeld. Jeder erfüllt die Namensregel unten. */
export const EXAMPLE_NAMES = [
  'Anna',
  'Michael',
  'Voldemort',
  'Gandalf',
  'Hermine',
  'Merlin',
  'Sherlock',
  'Frodo',
  'Luna',
  'Zorro',
  'Momo',
  'Pumuckl',
];

/**
 * Ein zufälliger Beispielname für den Platzhalter im Namensfeld.
 * @param {() => number} [random] Zufallsquelle, in Tests austauschbar.
 */
export function exampleName(random = Math.random) {
  const index = Math.min(EXAMPLE_NAMES.length - 1, Math.floor(random() * EXAMPLE_NAMES.length));
  return EXAMPLE_NAMES[index];
}

/** Steuerzeichen (Cc) und unsichtbare Formatzeichen (Cf), z. B. Richtungsumkehr. */
const CONTROL = /[\p{Cc}\p{Cf}]/gu;
/**
 * Zeichen, die als Buchstabe oder Symbol gelten, aber leer dargestellt
 * werden: Hangul-Füller (U+115F, U+1160, U+3164, U+FFA0) und das leere
 * Braille-Muster (U+2800).
 */
const BLANK_LOOKING = /[ᅟᅠㅤﾠ⠀]/gu;
/**
 * Buchstaben in jeder Schrift, auch Umlaute und ß. Ziffern, Satzzeichen
 * und Symbole zählen nicht: Ein Name wie ".", "-" oder "42" sagt dem
 * Gegner nicht, gegen wen er spielt.
 */
const LETTER = /\p{L}/gu;

/**
 * Säubert einen Anzeigenamen.
 * @param {unknown} raw Eingabe, ungeprüft.
 * @returns {string} Der Name, oder '', wenn weniger als
 *   MIN_NAME_LETTERS Buchstaben bleiben.
 */
export function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  const collapsed = raw.replace(CONTROL, '').replace(BLANK_LOOKING, '').replace(/\s+/g, ' ').trim();
  // Erst kürzen, dann den Rand säubern: Andersherum bliebe ein
  // Leerzeichen stehen, das genau an der Schnittstelle liegt.
  // Array.from zählt Zeichen statt UTF-16-Einheiten, damit ein Emoji am
  // Ende nicht halbiert wird.
  const name = Array.from(collapsed).slice(0, MAX_NAME_LENGTH).join('').trim();
  return (name.match(LETTER)?.length ?? 0) >= MIN_NAME_LETTERS ? name : '';
}
