/* Die Zahlenwerte müssen mit server/game.js übereinstimmen.
   Die Datei ist absichtlich getrennt: der Server läuft unter Node, der
   Client im Browser, und server/ wird nicht ausgeliefert. */
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const SIZE = 8;

export function opponentOf(color) {
  return color === BLACK ? WHITE : BLACK;
}

/** Feldname in der üblichen Reversi-Schreibweise: Spalte A–H, Zeile 1–8. */
export function squareName(row, col) {
  return `${'ABCDEFGH'[col]}${row + 1}`;
}
