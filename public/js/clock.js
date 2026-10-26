/**
 * Anzeige der Bedenkzeit.
 *
 * Die Uhr, die zählt, läuft auf dem Server – nur dort wird entschieden,
 * wann die Zeit abgelaufen ist. Diese Anzeige zählt lediglich lokal
 * herunter, was der Server als Restzeit gemeldet hat. Geht die lokale
 * Uhr ein paar Millisekunden falsch, hat das keine Folgen.
 */

const TICK_MS = 250;
/** Ab hier wird die Anzeige auffällig und es kommt eine Warnung. */
export const WARN_MS = 15_000;
const CRITICAL_MS = 5_000;

/**
 * Warnschwelle für eine Bedenkzeit. Ist der ganze Zug nicht länger als
 * WARN_MS (TURN_SECONDS=8), läge die Restzeit schon beim Start unter der
 * Schwelle, und die Warnung käme nie. Dann warnt die Uhr zur Hälfte.
 */
export function warnAt(totalMs) {
  return totalMs > WARN_MS ? WARN_MS : totalMs / 2;
}

export class ClockView {
  /**
   * @param {{root: HTMLElement, time: HTMLElement, fill: HTMLElement, label: HTMLElement}} elements
   * @param {{onWarn?: (seconds: number) => void}} [callbacks] onWarn bekommt
   *   die verbleibenden Sekunden, einmal pro Zug.
   */
  constructor(elements, { onWarn } = {}) {
    this.el = elements;
    this.onWarn = onWarn ?? (() => {});
    this.interval = null;
    this.deadline = 0;
    this.total = 1;
    this.warnMs = WARN_MS;
    this.criticalMs = CRITICAL_MS;
    this.mine = false;
    this.warned = false;
  }

  /**
   * @param {number} remainingMs Restzeit laut Server.
   * @param {number} totalMs Bedenkzeit pro Zug.
   * @param {boolean} mine Ob ich am Zug bin (nur dann gibt es eine Warnung).
   * @param {string} label Wessen Zeit läuft.
   */
  start(remainingMs, totalMs, mine, label) {
    this.stop();
    this.deadline = Date.now() + remainingMs;
    this.total = Math.max(1, totalMs);
    this.mine = mine;
    this.warnMs = warnAt(this.total);
    this.criticalMs = Math.min(CRITICAL_MS, this.warnMs / 3);
    // Neu gestartet unterhalb der Schwelle (Einstellung geändert): Die
    // Warnung kam schon, sie soll nicht doppelt kommen.
    this.warned = remainingMs <= this.warnMs;
    this.el.label.textContent = label;
    this.el.root.hidden = false;
    this.el.root.dataset.mine = String(mine);
    this.tick();
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    const left = Math.max(0, this.deadline - Date.now());
    const seconds = Math.ceil(left / 1000);
    this.el.time.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    this.el.fill.style.setProperty('--remaining', String(left / this.total));

    let state = 'normal';
    if (left <= this.criticalMs) state = 'critical';
    else if (left <= this.warnMs) state = 'warn';
    this.el.root.dataset.state = state;

    if (this.mine && !this.warned && left <= this.warnMs && left > 0) {
      this.warned = true;
      this.onWarn(seconds);
    }
    if (left === 0) this.stopInterval();
  }

  stopInterval() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  /** Anhalten und ausblenden, z. B. am Spielende. */
  stop() {
    this.stopInterval();
    this.el.root.hidden = true;
  }
}
