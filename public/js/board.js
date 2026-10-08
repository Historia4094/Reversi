/**
 * Darstellung des Bretts.
 *
 * Diese Datei enthält keine Spielregeln. Sie zeigt nur an, was der
 * Server geschickt hat, und meldet Klicks nach oben weiter. Ob ein Zug
 * erlaubt ist, entscheidet der Server.
 */
import { EMPTY, BLACK, SIZE, squareName } from './constants.js';

export class BoardView {
  /**
   * @param {HTMLElement} root Container des Bretts.
   * @param {(row: number, col: number) => void} onCellClick
   */
  constructor(root, onCellClick) {
    this.root = root;
    this.cells = [];
    this.previous = null;
    this.me = BLACK;
    this.names = {};
    // Fokussierbar per Skript, aber kein eigener Tab-Stopp.
    this.root.tabIndex = -1;

    // Die 64 Felder werden einmal gebaut und danach nur aktualisiert.
    // Bei jedem Zug das DOM neu zu erzeugen würde die Dreh-Animation
    // abbrechen, weil die Elemente ausgetauscht würden.
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.addEventListener('click', () => onCellClick(row, col));

        const disc = document.createElement('span');
        disc.className = 'disc';
        disc.hidden = true;
        disc.innerHTML =
          '<span class="disc__face disc__face--black"></span>' +
          '<span class="disc__face disc__face--white"></span>';
        cell.append(disc);

        this.root.append(cell);
        this.cells.push({ cell, disc, row, col });
      }
    }
  }

  /** Wer ich bin und wie die Spieler heißen – für die Feldbeschriftungen. */
  setPerspective(me, names) {
    this.me = me;
    this.names = names;
  }

  /**
   * Setzt die Anzeige auf den Anfangszustand zurück. Die Steine werden
   * ganz geleert – sonst würden Steine der vorigen Partie beim ersten
   * Zustand der neuen Partie sichtbar umdrehen.
   */
  reset() {
    this.previous = null;
    for (const { disc } of this.cells) {
      disc.hidden = true;
      disc.removeAttribute('data-color');
    }
  }

  /**
   * Übernimmt eine Server-Sicht.
   * @param {object} state Ergebnis von Match#viewFor.
   * @param {{allowAny?: boolean}} [options] allowAny = Zugmarkierung aus:
   *   dann darf jedes freie Feld angeklickt werden, und der Server lehnt
   *   ungültige Züge ab. So bleibt das Spiel auch ohne Hilfen spielbar.
   */
  render(state, { allowAny = false } = {}) {
    const legal = new Map(state.legalMoves.map((move) => [`${move.row},${move.col}`, move.flips]));
    const last = state.lastMove;
    const hadFocus = this.root.contains(document.activeElement);

    for (const { cell, disc, row, col } of this.cells) {
      const value = state.board[row][col];
      const key = `${row},${col}`;
      const before = this.previous ? this.previous[row][col] : EMPTY;
      const flips = legal.get(key);
      const isLegal = flips !== undefined;

      if (value === EMPTY) {
        disc.hidden = true;
        disc.removeAttribute('data-color');
      } else {
        disc.hidden = false;
        const isNew = before === EMPTY;
        // Neu gesetzt heißt legen, nicht drehen. Gedrehte Steine kippen
        // nach Abstand zum gesetzten Stein nacheinander, dadurch läuft die
        // Drehung sichtbar vom Zug nach außen.
        const distance =
          last && !isNew ? Math.max(Math.abs(row - last.row), Math.abs(col - last.col)) : 0;
        disc.style.setProperty('--flip-index', String(distance));
        disc.dataset.placed = String(isNew && this.previous !== null);
        disc.dataset.color = value === BLACK ? 'black' : 'white';
      }

      cell.dataset.legal = String(isLegal);
      if (isLegal) cell.dataset.flips = String(flips);
      else delete cell.dataset.flips;
      cell.dataset.last = String(Boolean(last && last.row === row && last.col === col));

      const clickable = isLegal || (allowAny && state.yourTurn && value === EMPTY);
      cell.disabled = !clickable;
      cell.setAttribute('aria-label', this.describe(row, col, value, flips));
    }

    this.previous = state.board.map((rowCells) => [...rowCells]);

    // Ein Feld, das gerade den Fokus hatte (Tastatur), ist nach dem Zug
    // gesperrt. Ohne Eingriff fiele der Fokus auf <body> zurück und man
    // müsste sich neu zum Brett tabben. Das Brett selbst übernimmt ihn.
    const focused = document.activeElement;
    if (hadFocus && (!this.root.contains(focused) || focused.disabled)) {
      this.root.focus({ preventScroll: true });
    }
  }

  /** Feldbeschreibung für Screenreader, z. B. "D4, Stein von Christa". */
  describe(row, col, value, flips) {
    const name = squareName(row, col);
    if (value !== EMPTY) {
      return value === this.me
        ? `${name}, dein Stein`
        : `${name}, Stein von ${this.names[value] ?? 'Gegner'}`;
    }
    if (flips !== undefined) {
      return `${name}, möglicher Zug, dreht ${flips} ${flips === 1 ? 'Stein' : 'Steine'}`;
    }
    return `${name}, leer`;
  }
}
