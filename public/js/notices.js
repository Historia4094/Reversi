/**
 * Zeigt Hinweise an – als kurze Meldung am Rand (Toast) oder, bei
 * wichtigen Ereignissen, als Einblendung direkt über dem Brett.
 *
 * Warum zwei Formen? Aussetzen oder ein Zeitablauf verändern, wer dran
 * ist. Das muss man sehen, wo man gerade hinschaut: auf dem Brett.
 * Eine gesicherte Ecke ist dagegen eine Randbemerkung.
 *
 * Vorgelesen wird alles über eine einzige Live-Region (announcer).
 * Toasts und Einblendung sind nur die sichtbare Form. Mehrere Hinweise,
 * die gleichzeitig entstehen (Zug, Aussetzen, wer jetzt dran ist), werden
 * zu einer Ansage zusammengefasst, statt sich gegenseitig zu
 * unterbrechen.
 */

const TOAST_MS = 4500;
const BANNER_MS = 3200;
const MAX_TOASTS = 2;
/** Was innerhalb dieser Zeit angesagt werden soll, wird eine Ansage. */
const ANNOUNCE_DELAY_MS = 50;

export class Notifier {
  /**
   * @param {{toastRoot: HTMLElement, banner: HTMLElement, announcer: HTMLElement}} elements
   *   banner enthält .banner__text und den Knopf .banner__close.
   */
  constructor({ toastRoot, banner, announcer }) {
    this.toastRoot = toastRoot;
    this.banner = banner;
    this.bannerText = banner.querySelector('.banner__text');
    this.announcer = announcer;
    this.home = toastRoot.parentElement;
    /** Offenes modales Fenster, in dem Toasts und Ansagen gerade liegen. */
    this.layer = null;

    this.bannerQueue = [];
    this.bannerTimer = null;
    this.toastTimers = new Set();
    this.pending = [];
    this.announceTimer = null;

    // Die Einblendung selbst lässt Klicks durch (pointer-events: none im
    // CSS), damit ein Zug darunter ankommt. Schließen geht über den
    // eigenen Knopf oder Escape; ohnehin verschwindet sie von selbst.
    banner.querySelector('.banner__close').addEventListener('click', () => this.nextBanner());
    document.addEventListener('keydown', (event) => {
      // Ist ein Fenster offen, schließt Escape das Fenster.
      if (event.key === 'Escape' && !this.banner.hidden && !this.layer) this.nextBanner();
    });
  }

  /**
   * @param {{text: string, tone?: string, prominent?: boolean}} notice
   * @param {{speak?: boolean}} [options] speak = auch vorlesen.
   */
  show({ text, tone = 'info', prominent = false }, { speak = true } = {}) {
    // Über einem offenen Fenster wäre die Einblendung verdeckt. Dann
    // erscheint derselbe Text als Toast im Fenster.
    if (prominent && !this.layer) this.queueBanner({ text, tone });
    else this.toast({ text, tone });
    if (speak) this.say(text);
  }

  /** Nur vorlesen, ohne sichtbaren Hinweis (z. B. wer jetzt am Zug ist). */
  say(text) {
    if (!text) return;
    if (this.pending.length === 0) this.announcer.textContent = '';
    this.pending.push(text);
    if (this.announceTimer) return;
    // Erst leeren, dann kurz darauf füllen: So wird auch ein Satz, der
    // genauso schon dastand, erneut vorgelesen.
    this.announceTimer = setTimeout(() => {
      this.announceTimer = null;
      this.announcer.textContent = this.pending.join(' ');
      this.pending = [];
    }, ANNOUNCE_DELAY_MS);
  }

  /**
   * Ein modales Fenster macht den Rest der Seite inert: Was dort liegt,
   * ist abgedunkelt und wird nicht vorgelesen. Solange ein Fenster offen
   * ist, liegen Toasts und Live-Region deshalb im Fenster.
   * @param {HTMLDialogElement} dialog
   */
  attach(dialog) {
    this.layer = dialog;
    dialog.append(this.toastRoot, this.announcer);
  }

  /** Fenster geschlossen: Toasts und Live-Region zurück an ihren Platz. */
  detach(dialog) {
    if (this.layer !== dialog) return;
    this.layer = null;
    this.home.append(this.toastRoot, this.announcer);
  }

  toast({ text, tone }) {
    const item = document.createElement('p');
    item.className = 'toast';
    item.dataset.tone = tone;
    item.textContent = text;
    this.toastRoot.append(item);

    while (this.toastRoot.children.length > MAX_TOASTS) {
      this.toastRoot.firstElementChild.remove();
    }

    const timer = setTimeout(() => this.dismiss(item, timer), TOAST_MS);
    this.toastTimers.add(timer);
  }

  dismiss(item, timer) {
    if (timer) this.toastTimers.delete(timer);
    item.remove();
  }

  queueBanner(notice) {
    this.bannerQueue.push(notice);
    if (!this.bannerTimer) this.nextBanner();
  }

  nextBanner() {
    clearTimeout(this.bannerTimer);
    this.bannerTimer = null;

    const notice = this.bannerQueue.shift();
    if (!notice) {
      this.banner.hidden = true;
      return;
    }

    this.banner.dataset.tone = notice.tone;
    // Nur den Text tauschen: textContent am Banner selbst löschte auch
    // den Schließen-Knopf.
    this.bannerText.textContent = notice.text;
    this.banner.hidden = false;
    this.bannerTimer = setTimeout(() => this.nextBanner(), BANNER_MS);
  }

  /** Alles weg – beim Verlassen der Partie, damit keine Timer weiterlaufen. */
  clear() {
    for (const timer of this.toastTimers) clearTimeout(timer);
    this.toastTimers.clear();
    this.toastRoot.replaceChildren();
    this.bannerQueue = [];
    clearTimeout(this.bannerTimer);
    this.bannerTimer = null;
    this.banner.hidden = true;
  }
}
