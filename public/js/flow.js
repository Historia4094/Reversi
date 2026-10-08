/**
 * Ablauf aus Sicht eines Browserfensters: suchen, spielen, fertig.
 *
 * Reine Logik ohne DOM, deshalb unter Node testbar (test/flow.test.js).
 *
 * Phasen:
 *   idle       Anmeldung oder Brettwahl, keine Anfrage beim Server
 *   searching  "Spiel suchen" gedrückt, Antwort steht aus oder wartet
 *   playing    Partie läuft
 *   over       Partie vorbei, Brett bleibt zum Anschauen stehen
 *
 * Warum eine Suchnummer (ticket)? Nachrichten des Servers können eine
 * Aktion überholen. Beispiel: Man bricht die Suche ab und startet sofort
 * eine neue. Kurz vorher hatte sich ein Gegner angemeldet, und dessen
 * gameStart ist noch unterwegs. Ohne Nummer würde der Client diese
 * Partie annehmen, obwohl der Server sie beim Abbrechen schon beendet
 * hat. Jede Suche bekommt deshalb eine neue Nummer, der Server schickt
 * sie in waiting, gameStart und joinRejected zurück, und nur Antworten
 * zur aktuellen Suche zählen.
 */
export class Flow {
  constructor() {
    this.phase = 'idle';
    this.ticket = 0;
  }

  /**
   * Beginnt eine neue Suche.
   * @returns {number | null} Suchnummer für den Server, oder null, wenn
   *   gerade schon gesucht oder gespielt wird (z. B. Doppelklick).
   */
  startSearch() {
    if (this.phase !== 'idle') return null;
    this.phase = 'searching';
    this.ticket += 1;
    return this.ticket;
  }

  /** Gehört eine Antwort des Servers zur laufenden Suche? */
  isCurrentSearch(ticket) {
    return this.phase === 'searching' && ticket === this.ticket;
  }

  /**
   * Der Server meldet den Spielbeginn.
   * @returns {boolean} false = veraltet, Nachricht ignorieren.
   */
  beginGame(ticket) {
    if (!this.isCurrentSearch(ticket)) return false;
    this.phase = 'playing';
    return true;
  }

  /**
   * Die Partie ist zu Ende (regulär, Aufgabe, Abbruch, Verbindung weg).
   * @returns {boolean} false, wenn gar keine Partie lief.
   */
  endGame() {
    if (this.phase !== 'playing') return false;
    this.phase = 'over';
    return true;
  }

  /** Zurück zur Brettwahl: nach Abbrechen, Ablehnung oder "Neue Partie". */
  reset() {
    this.phase = 'idle';
  }

  get playing() {
    return this.phase === 'playing';
  }

  get searching() {
    return this.phase === 'searching';
  }
}
