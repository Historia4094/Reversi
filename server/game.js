/**
 * Reversi-Regeln.
 *
 * Dieses Modul kennt kein Netzwerk, keine Sockets und keine Zeit. Es
 * beantwortet nur Fragen über ein Spielbrett und führt Züge aus. Dadurch
 * lässt es sich isoliert testen und der Server bleibt frei von Regellogik.
 *
 * Jeder Zug liefert eine Liste von Ereignissen zurück (Zug, Aussetzen,
 * Spielende). Aus diesen Ereignissen baut der Client seine Hinweise –
 * er muss die Regeln dafür nicht selbst kennen.
 *
 * Brett: 8x8 Array of Array, jede Zelle EMPTY | BLACK | WHITE.
 */

import { EMPTY, BLACK, WHITE, SIZE, opponentOf } from '../public/shared/constants.js';

// Die Konstanten stehen in public/shared/constants.js, damit Server und
// Client dieselben Werte verwenden. Hier nur weitergereicht, damit die
// übrigen Server-Module sie wie bisher aus game.js beziehen.
export { EMPTY, BLACK, WHITE, SIZE, opponentOf };

/** Die acht Richtungen als [dRow, dCol]. */
const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** Gründe, aus denen eine Partie enden kann. */
export const END = Object.freeze({
  NO_MOVES: 'noMoves', // keiner kann mehr ziehen, Brett nicht voll
  BOARD_FULL: 'boardFull', // alle 64 Felder belegt
  WIPEOUT: 'wipeout', // eine Farbe hat keinen Stein mehr
  RESIGN: 'resign', // ein Spieler hat aufgegeben
  INACTIVE: 'inactive', // ein Spieler hat zu oft nicht gezogen
});

export function isCorner(row, col) {
  return (row === 0 || row === SIZE - 1) && (col === 0 || col === SIZE - 1);
}

/** Startaufstellung: vier Steine über Kreuz in der Mitte. Schwarz beginnt. */
export function createBoard() {
  const board = Array.from({ length: SIZE }, () => new Array(SIZE).fill(EMPTY));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  return board;
}

function isInside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * Sammelt alle Steine, die ein Zug auf (row, col) umdrehen würde.
 *
 * Das ist der Kern des Spiels. Von der gesetzten Zelle aus läuft die
 * Funktion in jede der acht Richtungen. Gegnerische Steine werden
 * eingesammelt. Trifft sie danach auf einen eigenen Stein, ist die Kette
 * eingeschlossen und wird umgedreht. Trifft sie auf eine Lücke oder den
 * Rand, wird diese Richtung verworfen.
 *
 * Dieselbe Funktion beantwortet auch die Frage nach der Gültigkeit:
 * ein Zug ist genau dann erlaubt, wenn er mindestens einen Stein dreht.
 *
 * @returns {Array<[number, number]>} Koordinaten der zu drehenden Steine.
 */
export function flipsFor(board, row, col, player) {
  if (!isInside(row, col) || board[row][col] !== EMPTY) return [];

  const enemy = opponentOf(player);
  const flips = [];

  for (const [dRow, dCol] of DIRECTIONS) {
    const candidates = [];
    let r = row + dRow;
    let c = col + dCol;

    while (isInside(r, c) && board[r][c] === enemy) {
      candidates.push([r, c]);
      r += dRow;
      c += dCol;
    }

    // Nur wenn die Kette von einem eigenen Stein abgeschlossen wird.
    if (candidates.length > 0 && isInside(r, c) && board[r][c] === player) {
      flips.push(...candidates);
    }
  }

  return flips;
}

/**
 * Alle Felder, auf die der Spieler legen darf – jeweils mit der Anzahl der
 * Steine, die dieser Zug umdrehen würde.
 */
export function legalMoves(board, player) {
  const moves = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const flips = flipsFor(board, row, col, player).length;
      if (flips > 0) moves.push({ row, col, flips });
    }
  }
  return moves;
}

export function hasLegalMove(board, player) {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (flipsFor(board, row, col, player).length > 0) return true;
    }
  }
  return false;
}

export function countStones(board) {
  const scores = { [BLACK]: 0, [WHITE]: 0 };
  for (const rowCells of board) {
    for (const cell of rowCells) {
      if (cell !== EMPTY) scores[cell]++;
    }
  }
  return scores;
}

/**
 * Eine laufende Partie. Hält den vollständigen Zustand.
 * Der Client bekommt hiervon immer nur eine abgeleitete Sicht.
 */
export class Game {
  constructor() {
    this.board = createBoard();
    this.currentPlayer = BLACK;
    this.finished = false;
    this.endReason = null;
    /** Wer aufgegeben hat (durch Klick oder durch Untätigkeit). */
    this.forfeitedBy = null;
    this.lastMove = null;
    this.lastFlips = [];
    this.passedLast = false;
    /** Zugverlauf: Züge und Aussetzer in zeitlicher Reihenfolge. */
    this.history = [];
    this.moveCount = 0;
  }

  /**
   * Führt einen Zug aus, sofern er erlaubt ist.
   *
   * Der Server ruft das auf, nachdem er geprüft hat, wer gesendet hat.
   * Die Regelprüfung passiert hier, nicht im Client.
   *
   * @param {{auto?: boolean}} [options] auto = Zug wurde nach Zeitablauf
   *   vom Server gesetzt, nicht vom Spieler selbst.
   * @returns {{ok: true, events: object[]} | {ok: false, reason: string}}
   */
  play(player, row, col, { auto = false } = {}) {
    if (this.finished) return { ok: false, reason: 'Die Partie ist beendet.' };
    if (player !== this.currentPlayer) return { ok: false, reason: 'Du bist nicht am Zug.' };
    if (!Number.isInteger(row) || !Number.isInteger(col) || !isInside(row, col)) {
      return { ok: false, reason: 'Ungültige Koordinaten.' };
    }

    const flips = flipsFor(this.board, row, col, player);
    if (flips.length === 0) return { ok: false, reason: 'Dieser Zug dreht keinen Stein um.' };

    this.board[row][col] = player;
    for (const [r, c] of flips) {
      this.board[r][c] = player;
    }

    this.lastMove = { row, col };
    this.lastFlips = flips.map(([r, c]) => ({ row: r, col: c }));
    this.moveCount += 1;

    const moveEvent = {
      type: 'move',
      n: this.moveCount,
      player,
      row,
      col,
      flipped: flips.length,
      corner: isCorner(row, col),
      auto,
    };
    this.history.push(moveEvent);

    return { ok: true, events: [moveEvent, ...this.advanceTurn()] };
  }

  /**
   * Setzt für den Spieler, der am Zug ist, einen zufälligen erlaubten Zug.
   * Wird nach Ablauf der Bedenkzeit aufgerufen.
   *
   * Zufällig statt "bester" Zug: Der Server soll für niemanden spielen,
   * sondern nur dafür sorgen, dass die Partie regelkonform weitergeht.
   *
   * @param {() => number} random Zufallsquelle, in Tests austauschbar.
   */
  playRandom(player, random = Math.random) {
    const moves = legalMoves(this.board, player);
    if (moves.length === 0) return { ok: false, reason: 'Kein erlaubter Zug vorhanden.' };
    const pick = moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))];
    return this.play(player, pick.row, pick.col, { auto: true });
  }

  /**
   * Ein Spieler gibt auf – per Klick oder weil er zu oft nicht gezogen hat.
   * Der Gegner gewinnt, unabhängig vom Punktestand.
   */
  forfeit(player, reason = END.RESIGN) {
    if (this.finished) return { ok: false, reason: 'Die Partie ist beendet.' };
    this.finished = true;
    this.forfeitedBy = player;
    this.endReason = reason;
    return { ok: true, events: [this.endEvent()] };
  }

  /**
   * Bestimmt, wer als Nächstes dran ist.
   *
   * Die Aussetz-Regel ist der Teil, den man leicht vergisst: wer keinen
   * gültigen Zug hat, setzt aus und der Gegner ist erneut dran. Ohne das
   * bleibt die Partie hängen und wartet auf einen Zug, den niemand
   * machen kann. Können beide nicht, ist Schluss – auch bei nicht
   * vollem Brett.
   *
   * @returns {object[]} Ereignisse, die dabei entstehen (Aussetzen, Ende).
   */
  advanceTurn() {
    const next = opponentOf(this.currentPlayer);

    if (hasLegalMove(this.board, next)) {
      this.currentPlayer = next;
      this.passedLast = false;
      return [];
    }

    if (hasLegalMove(this.board, this.currentPlayer)) {
      // Der Gegner setzt aus, derselbe Spieler bleibt dran.
      this.passedLast = true;
      const pass = { type: 'pass', player: next };
      this.history.push(pass);
      return [pass];
    }

    this.finished = true;
    this.passedLast = false;
    this.endReason = this.naturalEndReason();
    return [this.endEvent()];
  }

  /** Warum eine Partie endet, in der keiner mehr ziehen kann. */
  naturalEndReason() {
    const scores = this.scores();
    if (scores[BLACK] + scores[WHITE] === SIZE * SIZE) return END.BOARD_FULL;
    if (scores[BLACK] === 0 || scores[WHITE] === 0) return END.WIPEOUT;
    return END.NO_MOVES;
  }

  endEvent() {
    return {
      type: 'end',
      reason: this.endReason,
      winner: this.winner(),
      forfeitedBy: this.forfeitedBy,
    };
  }

  scores() {
    return countStones(this.board);
  }

  emptySquares() {
    const scores = this.scores();
    return SIZE * SIZE - scores[BLACK] - scores[WHITE];
  }

  /**
   * BLACK, WHITE oder null bei Gleichstand. Nur sinnvoll nach Spielende.
   * Bei Aufgabe gewinnt der Gegner, egal wie viele Steine liegen.
   */
  winner() {
    if (this.forfeitedBy !== null) return opponentOf(this.forfeitedBy);
    const scores = this.scores();
    if (scores[BLACK] === scores[WHITE]) return null;
    return scores[BLACK] > scores[WHITE] ? BLACK : WHITE;
  }

  /**
   * Die Sicht eines einzelnen Spielers auf den Zustand.
   *
   * Bei Reversi liegt alles offen, das Brett ist für beide gleich. Die
   * erlaubten Züge bekommt aber nur, wer am Zug ist – der Client soll
   * gar nicht erst Daten haben, mit denen er außerhalb der Reihe
   * herumprobieren kann.
   */
  viewFor(player) {
    const yourTurn = !this.finished && this.currentPlayer === player;
    return {
      board: this.board.map((rowCells) => [...rowCells]),
      currentPlayer: this.currentPlayer,
      yourTurn,
      legalMoves: yourTurn ? legalMoves(this.board, player) : [],
      scores: this.scores(),
      lastMove: this.lastMove,
      lastFlips: this.lastFlips,
      passedLast: this.passedLast,
      finished: this.finished,
      history: this.history.map((entry) => ({ ...entry })),
    };
  }
}
