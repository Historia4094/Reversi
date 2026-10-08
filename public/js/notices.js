/**
 * Zeigt Hinweise an – als kurze Meldung am Rand (Toast) oder, bei
 * wichtigen Ereignissen, als Einblendung direkt über dem Brett.
 *
 * Warum zwei Formen? Aussetzen oder ein Zeitablauf verändern, wer dran
 * ist. Das muss man sehen, wo man gerade hinschaut: auf dem Brett.
 * Eine gesicherte Ecke ist dagegen eine Randbemerkung.
 */

const TOAST_MS = 4500;
const BANNER_MS = 3200;
const MAX_TOASTS = 2;

export class Notifier {
  /**
   * @param {{toastRoot: HTMLElement, banner: HTMLElement}} elements
   */
  constructor({ toastRoot, banner }) {
    this.toastRoot = toastRoot;
    this.banner = banner;
    this.bannerQueue = [];
    this.bannerTimer = null;
    this.toastTimers = new Set();

    // Antippen, Klicken oder Escape schließt die Einblendung sofort.
    // Sie verschwindet ohnehin nach ein paar Sekunden von selbst.
    this.banner.addEventListener('click', () => this.nextBanner());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.banner.hidden) this.nextBanner();
    });
  }

  show({ text, tone = 'info', prominent = false }) {
    if (prominent) this.queueBanner({ text, tone });
    else this.toast({ text, tone });
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
    this.banner.textContent = notice.text;
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
