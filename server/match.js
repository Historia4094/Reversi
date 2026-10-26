/**
 * Eine Partie zwischen zwei Spielern – Regeln plus Bedenkzeit.
 *
 * game.js kennt nur die Regeln. Hier kommt die Zeit dazu: Jeder Spieler
 * hat pro Zug eine feste Bedenkzeit. Läuft sie ab, passiert Folgendes:
 *
 *   1. Der Server setzt für den untätigen Spieler einen zufälligen
 *      erlaubten Zug. Danach ist regulär der Gegner dran.
 *   2. Das wird mitgezählt. Wer MAX_TIMEOUTS-mal hintereinander nicht
 *      selbst zieht, verliert durch Aufgabe.
 *   3. Ein eigener Zug setzt den Zähler zurück.
 *
 * Warum nicht einfach "der Andere ist dran"? Weil das die Regeln bricht:
 * Aussetzen ist bei Reversi nur erlaubt, wenn man keinen gültigen Zug hat.
 * Wer untätig ist, hat aber einen – sonst hätte die Aussetz-Regel schon
 * gegriffen. Der Zufallszug hält die Partie regelkonform, die Obergrenze
 * verhindert, dass jemand eine Partie endlos blockiert.
 *
 * Auch dieses Modul kennt keine Sockets. Es meldet Änderungen über zwei
 * Rückrufe; index.js verteilt sie an die Clients.
 */

import { Game, BLACK, WHITE, END, opponentOf } from './game.js';

export const DEFAULT_TURN_MS = 60_000;
export const MAX_TIMEOUTS = 3;

export class Match {
  /**
   * @param {object} options
   * @param {string} options.id
   * @param {{[BLACK]: {id, name}, [WHITE]: {id, name}}} options.players
   * @param {number} [options.turnMs] Bedenkzeit pro Zug.
   * @param {number} [options.maxTimeouts]
   * @param {() => number} [options.random] Zufallsquelle für den Ersatzzug.
   * @param {(match: Match, events: object[]) => void} [options.onChange]
   * @param {(match: Match) => void} [options.onEnd]
   */
  constructor({
    id,
    players,
    turnMs = DEFAULT_TURN_MS,
    maxTimeouts = MAX_TIMEOUTS,
    random = Math.random,
    onChange = () => {},
    onEnd = () => {},
  }) {
    this.id = id;
    this.players = players;
    this.turnMs = turnMs;
    this.maxTimeouts = maxTimeouts;
    this.random = random;
    this.onChange = onChange;
    this.onEnd = onEnd;

    this.game = new Game();
    this.timeouts = { [BLACK]: 0, [WHITE]: 0 };
    this.deadline = 0;
    this.timer = null;
    this.over = false;
  }

  /** Startet die Uhr für den ersten Zug. */
  start() {
    this.armClock();
  }

  /** Ein Zug, den ein Spieler selbst gemacht hat. */
  move(color, row, col) {
    if (this.over) return { ok: false, reason: 'Die Partie ist beendet.' };
    const result = this.game.play(color, row, col);
    if (!result.ok) return result;

    this.timeouts[color] = 0;
    this.afterTurn(result.events);
    return { ok: true };
  }

  /** Aufgeben per Klick. */
  resign(color) {
    if (this.over) return { ok: false, reason: 'Die Partie ist beendet.' };
    const result = this.game.forfeit(color, END.RESIGN);
    if (result.ok) this.afterTurn(result.events);
    return result;
  }

  /**
   * Die Bedenkzeit des Spielers am Zug ist abgelaufen.
   * Öffentlich, damit Tests es ohne Warten auslösen können.
   */
  expire() {
    if (this.over) return;
    const color = this.game.currentPlayer;
    this.timeouts[color] += 1;
    const count = this.timeouts[color];

    if (count >= this.maxTimeouts) {
      const result = this.game.forfeit(color, END.INACTIVE);
      this.afterTurn([
        { type: 'timeout', player: color, count, max: this.maxTimeouts, square: null },
        ...result.events,
      ]);
      return;
    }

    const result = this.game.playRandom(color, this.random);
    if (!result.ok) {
      // Kann nach den Regeln nicht passieren: Am Zug ist immer nur, wer
      // einen erlaubten Zug hat (game.js lässt sonst aussetzen). Der Zweig
      // ist eine Absicherung, damit ein Fehler dort den Server nicht
      // anhält; test/match.test.js löst ihn mit einer Attrappe aus.
      console.error(`Partie ${this.id}: kein Ersatzzug möglich.`);
      this.armClock();
      return;
    }

    const auto = result.events.find((event) => event.type === 'move');
    this.afterTurn([
      {
        type: 'timeout',
        player: color,
        count,
        max: this.maxTimeouts,
        square: { row: auto.row, col: auto.col },
      },
      ...result.events,
    ]);
  }

  /** Nach jedem Zustandswechsel: Uhr neu stellen oder Partie abschließen. */
  afterTurn(events) {
    this.stopClock();
    if (this.game.finished) {
      this.over = true;
      this.onChange(this, events);
      this.onEnd(this);
      return;
    }
    this.armClock();
    this.onChange(this, events);
  }

  armClock() {
    this.stopClock();
    this.deadline = Date.now() + this.turnMs;
    this.timer = setTimeout(() => {
      try {
        this.expire();
      } catch (error) {
        console.error(`Partie ${this.id}: Zeitablauf fehlgeschlagen:`, error);
      }
    }, this.turnMs);
    // Der Zeitgeber allein soll den Prozess nicht am Leben halten.
    this.timer.unref?.();
  }

  stopClock() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  remainingMs(now = Date.now()) {
    if (this.over) return 0;
    return Math.max(0, this.deadline - now);
  }

  /**
   * Beendet die Partie ohne Ergebnis (Verbindungsabbruch) und räumt den
   * Zeitgeber ab. Ohne das liefe der Timer weiter und würde eine längst
   * vergessene Partie weiterspielen.
   */
  dispose() {
    this.stopClock();
    this.over = true;
  }

  /** Sicht eines Spielers: Brett aus game.js plus Uhr und Zähler. */
  viewFor(color) {
    const opponent = opponentOf(color);
    return {
      ...this.game.viewFor(color),
      turnMs: this.turnMs,
      remainingMs: this.remainingMs(),
      timeouts: { mine: this.timeouts[color], opponent: this.timeouts[opponent] },
      maxTimeouts: this.maxTimeouts,
    };
  }

  /** Ergebnis für den Spieler mit der Farbe color. */
  resultFor(color) {
    const scores = this.game.scores();
    const winner = this.game.winner();
    return {
      reason: 'finished',
      endReason: this.game.endReason,
      scores: { black: scores[BLACK], white: scores[WHITE] },
      winner,
      youWon: winner !== null && winner === color,
      draw: winner === null,
      forfeitedBy: this.game.forfeitedBy,
      emptySquares: this.game.emptySquares(),
      maxTimeouts: this.maxTimeouts,
    };
  }
}
