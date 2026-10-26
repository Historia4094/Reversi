/**
 * Ergebnisfenster am Ende einer Partie.
 *
 * Es liegt über dem Spiel, damit das Endbrett dahinter erkennbar bleibt.
 * "Brett ansehen" oder Escape schließt es, "Erneut anmelden" führt zurück
 * zur Brettwahl.
 */
export class ResultView {
  /**
   * @param {HTMLDialogElement} dialog
   * @param {{open: (dialog: HTMLDialogElement) => void, onPlayAgain: () => void}} options
   *   open öffnet das Fenster (main.js zieht dabei die Hinweise mit hinein).
   */
  constructor(dialog, { open, onPlayAgain }) {
    this.dialog = dialog;
    this.open = open;
    this.title = dialog.querySelector('#result-title');
    this.reason = dialog.querySelector('#result-reason');
    this.detail = dialog.querySelector('#result-detail');
    this.playAgain = dialog.querySelector('#play-again');

    this.playAgain.addEventListener('click', onPlayAgain);
    dialog.querySelector('#view-board').addEventListener('click', () => this.close());
  }

  show({ title, reason = '', detail = '' }) {
    this.title.textContent = title;
    this.reason.textContent = reason;
    this.reason.hidden = reason === '';
    this.detail.textContent = detail;
    this.open(this.dialog);
    this.playAgain.focus();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  get isOpen() {
    return this.dialog.open;
  }
}
