/**
 * Statuskarte über bzw. neben dem Brett: Punktestand, Kräfteverhältnis,
 * wer am Zug ist, der Merker darunter (abgelehnter Zug, Aussetzen) und
 * die Zeitüberschreitungen. Die Uhr hat ihre eigene Anzeige (clock.js).
 *
 * render() gibt die Texte von Zuganzeige und Zeitüberschreitungen zurück.
 * main.js entscheidet, ob sie angesagt werden; diese Datei zeigt nur an.
 */
import { BLACK, WHITE, opponentOf } from '../shared/constants.js';

const $ = (id) => document.getElementById(id);

export class ScoreView {
  constructor() {
    this.el = {
      score: { [BLACK]: $('score-black'), [WHITE]: $('score-white') },
      value: { [BLACK]: $('score-black-value'), [WHITE]: $('score-white-value') },
      name: { [BLACK]: $('score-black-name'), [WHITE]: $('score-white-name') },
      tally: $('tally'),
      turn: $('turn-indicator'),
      hint: $('hint'),
      strikes: $('strikes'),
    };
    this.opponentName = 'Dein Gegner';
  }

  /** Bei Spielbeginn: wer welche Farbe spielt. */
  setPlayers({ me, myName, opponentName }) {
    this.opponentName = opponentName;
    this.el.name[me].textContent = `${myName} (du)`;
    this.el.name[opponentOf(me)].textContent = opponentName;
  }

  /**
   * @param {object} state Sicht des Servers (Match#viewFor).
   * @param {{playing: boolean, rejection: string}} context playing = die
   *   Partie läuft noch; rejection = Grund des letzten abgelehnten Zugs.
   * @returns {{turn: string, strikes: string}}
   */
  render(state, { playing, rejection }) {
    const black = state.scores[BLACK];
    const white = state.scores[WHITE];
    this.el.value[BLACK].textContent = String(black);
    this.el.value[WHITE].textContent = String(white);
    // Anteil von Schwarz an den gesetzten Steinen: zeigt das Verhältnis der
    // beiden Farben zueinander, nicht die Füllung des Bretts. Die Breite
    // rechnet das CSS aus --share aus.
    this.el.tally.style.setProperty('--share', String((black / (black + white)) * 100));

    const running = playing && !state.finished;
    for (const color of [BLACK, WHITE]) {
      this.el.score[color].dataset.active = String(running && state.currentPlayer === color);
    }

    this.el.turn.textContent = this.turnText(state, running);
    this.el.hint.textContent = running ? this.hintText(state, rejection) : '';
    const strikes = this.strikesText(state);
    this.el.strikes.textContent = strikes;
    this.el.strikes.hidden = strikes === '';

    return { turn: this.el.turn.textContent, strikes };
  }

  turnText(state, running) {
    if (!running) return 'Partie beendet.';
    return state.yourTurn ? 'Du bist am Zug.' : `${this.opponentName} ist am Zug.`;
  }

  /** Bleibt stehen, bis der nächste Zug kommt – anders als eine Einblendung. */
  hintText(state, rejection) {
    if (rejection) return rejection;
    if (!state.passedLast) return '';
    const opponent = this.opponentName;
    return state.yourTurn
      ? `${opponent} hat keinen erlaubten Zug und setzt aus. Du bist noch einmal dran.`
      : `Du hast keinen erlaubten Zug und setzt aus. ${opponent} ist noch einmal dran.`;
  }

  strikesText(state) {
    const { mine, opponent } = state.timeouts ?? { mine: 0, opponent: 0 };
    const lines = [];
    if (mine > 0) {
      lines.push(`Du hast ${mine} von ${state.maxTimeouts} Zeitüberschreitungen in Folge.`);
    }
    if (opponent > 0) {
      lines.push(
        `${this.opponentName}: ${opponent} von ${state.maxTimeouts} Zeitüberschreitungen in Folge.`,
      );
    }
    return lines.join(' ');
  }
}
