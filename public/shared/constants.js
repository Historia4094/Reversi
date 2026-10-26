/**
 * Konstanten und kleine Hilfen, die Server und Client gleichermaßen
 * brauchen. Sie stehen nur hier.
 *
 * Warum unter public/? Der Browser lädt die Datei unter /shared/, der
 * Server importiert sie direkt von der Festplatte. Weil der Ordner neben
 * public/js/ liegt, funktioniert derselbe relative Pfad '../shared/…'
 * im Browser und unter Node (Tests). Läge er neben server/, bräuchte
 * der Client einen anderen Pfad als die Tests.
 *
 * Die Datei darf deshalb weder Node- noch Browser-APIs verwenden.
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const SIZE = 8;

export function opponentOf(color) {
  return color === BLACK ? WHITE : BLACK;
}

/** Schreibweise der Seite für data-Attribute und CSS: 'black' oder 'white'. */
export function sideName(color) {
  return color === BLACK ? 'black' : 'white';
}

/** Gegenseite in der Schreibweise von sideName(). */
export function otherSide(side) {
  return side === 'black' ? 'white' : 'black';
}

/** Feldname in der üblichen Reversi-Schreibweise: Spalte A–H, Zeile 1–8. */
export function squareName(row, col) {
  return `${'ABCDEFGH'[col]}${row + 1}`;
}
