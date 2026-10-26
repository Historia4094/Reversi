/**
 * Darstellung des Bretts.
 *
 * Diese Datei enthält keine Spielregeln. Sie zeigt nur an, was der
 * Server geschickt hat, und meldet Klicks nach oben weiter. Ob ein Zug
 * erlaubt ist, entscheidet der Server.
 *
 * Tastatur: Das Brett ist ein ARIA-Grid mit einem einzigen Tab-Stopp
 * ("roving tabindex"). Innerhalb des Bretts bewegen die Pfeiltasten den
 * Fokus in alle vier Richtungen, Pos1/Ende springen an den Rand der
 * Zeile, Strg+Pos1/Ende in die Ecken. Gesperrte Felder bleiben dabei
 * erreichbar (aria-disabled statt disabled), damit man über sie hinweg
 * navigieren und sie sich vorlesen lassen kann.
 */
import { EMPTY, BLACK, SIZE, sideName, squareName } from '../shared/constants.js';

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
    /** Feld, das den einen Tab-Stopp des Bretts trägt (Index 0–63). */
    this.active = 27; // D4, mitten auf dem Brett
    /** Zugmarkierung aus: Feldbeschreibung ohne "möglicher Zug". */
    this.hintsOff = false;

    // Die 64 Felder werden einmal gebaut und danach nur aktualisiert.
    // Bei jedem Zug das DOM neu zu erzeugen würde die Dreh-Animation
    // abbrechen, weil die Elemente ausgetauscht würden.
    for (let row = 0; row < SIZE; row++) {
      const line = document.createElement('div');
      line.className = 'board__row';
      line.setAttribute('role', 'row');
      for (let col = 0; col < SIZE; col++) {
        // Ein <div> statt <button>: Die Rolle gridcell ist an einem Button
        // nicht erlaubt. Enter und Leertaste übernimmt deshalb onKeydown.
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.tabIndex = -1;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.addEventListener('click', () => this.activate(row, col));
        // Wer mit der Maus klickt, setzt damit auch den Tab-Stopp.
        cell.addEventListener('focus', () => this.setActive(row * SIZE + col));

        const disc = document.createElement('span');
        disc.className = 'disc';
        disc.hidden = true;
        disc.innerHTML =
          '<span class="disc__face disc__face--black"></span>' +
          '<span class="disc__face disc__face--white"></span>';
        cell.append(disc);

        line.append(cell);
        this.cells.push({ cell, disc, row, col });
      }
      this.root.append(line);
    }
    this.onCellClick = onCellClick;
    this.setActive(this.active);
    this.root.addEventListener('keydown', (event) => this.onKeydown(event));
  }

  /** Klick, Enter oder Leertaste auf einem Feld. */
  activate(row, col) {
    const { cell } = this.cells[row * SIZE + col];
    if (cell.getAttribute('aria-disabled') === 'true') return;
    this.onCellClick(row, col);
  }

  /** Verlegt den einen Tab-Stopp auf ein anderes Feld. */
  setActive(index) {
    this.cells[this.active].cell.tabIndex = -1;
    this.active = index;
    this.cells[index].cell.tabIndex = 0;
  }

  /** Fokus auf das Brett, z. B. beim Spielstart. */
  focus() {
    this.cells[this.active].cell.focus({ preventScroll: true });
  }

  onKeydown(event) {
    const row = Math.floor(this.active / SIZE);
    const col = this.active % SIZE;
    const last = SIZE - 1;
    const targets = {
      ArrowUp: [Math.max(0, row - 1), col],
      ArrowDown: [Math.min(last, row + 1), col],
      ArrowLeft: [row, Math.max(0, col - 1)],
      ArrowRight: [row, Math.min(last, col + 1)],
      Home: event.ctrlKey ? [0, 0] : [row, 0],
      End: event.ctrlKey ? [last, last] : [row, last],
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Leertaste würde sonst die Seite scrollen.
      this.activate(row, col);
      return;
    }
    const target = targets[event.key];
    if (!target) return;
    event.preventDefault();
    this.setActive(target[0] * SIZE + target[1]);
    this.focus();
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
    this.hintsOff = allowAny;

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
        disc.dataset.color = sideName(value);
      }

      cell.dataset.legal = String(isLegal);
      if (isLegal) cell.dataset.flips = String(flips);
      else delete cell.dataset.flips;
      cell.dataset.last = String(Boolean(last && last.row === row && last.col === col));

      const clickable = isLegal || (allowAny && state.yourTurn && value === EMPTY);
      // aria-disabled statt disabled: Das Feld bleibt fokussierbar. Ein
      // gesperrtes Feld verlöre sonst nach dem eigenen Zug den Fokus.
      cell.setAttribute('aria-disabled', String(!clickable));
      cell.setAttribute('aria-label', this.describe(row, col, value, flips));
    }

    this.previous = state.board.map((rowCells) => [...rowCells]);
  }

  /** Feldbeschreibung für Screenreader, z. B. "D4, Stein von Christa". */
  describe(row, col, value, flips) {
    const name = squareName(row, col);
    if (value !== EMPTY) {
      return value === this.me
        ? `${name}, dein Stein`
        : `${name}, Stein von ${this.names[value] ?? 'Gegner'}`;
    }
    // Bei "Erlaubte Züge: Aus" gilt die Einstellung auch fürs Vorlesen.
    if (flips !== undefined && !this.hintsOff) {
      return `${name}, möglicher Zug, dreht ${flips} ${flips === 1 ? 'Stein' : 'Steine'}`;
    }
    return `${name}, leer`;
  }
}
