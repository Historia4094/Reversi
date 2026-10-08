/**
 * Zugverlauf: alle Züge und Aussetzer der Partie, neuester oben.
 *
 * Der Server schickt mit jedem Zustand den vollständigen Verlauf. Hier
 * werden nur die Einträge ergänzt, die noch fehlen – bei bis zu 60 Zügen
 * wäre auch ein kompletter Neuaufbau billig, aber so bleibt die
 * Scrollposition erhalten.
 */

import { BLACK, squareName } from './constants.js';

export class MoveLog {
  /**
   * @param {HTMLOListElement} list
   * @param {HTMLElement} empty Hinweis "noch keine Züge".
   */
  constructor(list, empty) {
    this.list = list;
    this.empty = empty;
    this.rendered = 0;
  }

  reset() {
    this.list.replaceChildren();
    this.rendered = 0;
    this.empty.hidden = false;
  }

  /**
   * @param {object[]} history Verlauf aus dem Zustand.
   * @param {{me: number, names: object}} ctx
   */
  render(history, ctx) {
    if (history.length < this.rendered) this.reset();

    for (const entry of history.slice(this.rendered)) {
      this.list.prepend(this.item(entry, ctx));
    }
    this.rendered = history.length;
    this.empty.hidden = history.length > 0;
  }

  item(entry, { me, names }) {
    const li = document.createElement('li');
    li.className = 'log__item';
    li.dataset.type = entry.type;

    const stone = document.createElement('span');
    stone.className = 'stone-badge stone-badge--small';
    stone.dataset.side = entry.player === BLACK ? 'black' : 'white';
    stone.setAttribute('aria-hidden', 'true');

    const who = entry.player === me ? 'Du' : names[entry.player];
    const text = document.createElement('span');
    text.className = 'log__text';

    if (entry.type === 'pass') {
      text.textContent = `${who} setzt aus – kein erlaubter Zug`;
      li.append(stone, text);
      return li;
    }

    const number = document.createElement('span');
    number.className = 'log__n';
    number.textContent = String(entry.n);

    const square = document.createElement('strong');
    square.textContent = squareName(entry.row, entry.col);

    text.append(`${who} · `, square, ` · ${entry.flipped} gedreht`);

    li.append(number, stone, text);

    if (entry.corner) li.append(tag('Ecke'));
    if (entry.auto) li.append(tag('Zeit abgelaufen'));
    return li;
  }
}

function tag(label) {
  const node = document.createElement('span');
  node.className = 'log__tag';
  node.textContent = label;
  return node;
}
