/**
 * Lobby und Partienverwaltung.
 *
 * Der Server hält keinen einzelnen globalen Spielzustand, sondern eine
 * Sammlung unabhängiger Partien. Nur so können mehrere Paare
 * gleichzeitig spielen, wie es die Aufgabenstellung verlangt.
 *
 * Auch dieses Modul kennt keine Sockets. Es arbeitet mit frei gewählten
 * Spieler-IDs. Wie eine Partie konkret aussieht (Bedenkzeit, Rückrufe),
 * legt index.js über die Fabrikfunktion createMatch fest.
 */

import { BLACK, WHITE, opponentOf } from './game.js';
import { Match } from './match.js';

let nextMatchId = 1;

export class Lobby {
  /**
   * @param {{createMatch?: (id: string, players: object) => Match}} [options]
   */
  constructor({ createMatch } = {}) {
    this.createMatch = createMatch ?? ((id, players) => new Match({ id, players }));
    /** @type {{id: string, name: string, ticket: number | null} | null} Wartender Spieler. */
    this.waiting = null;
    /** @type {Map<string, Match>} matchId -> Partie. */
    this.matches = new Map();
    /** @type {Map<string, string>} playerId -> matchId. */
    this.playerMatch = new Map();
  }

  /**
   * Meldet einen Spieler an.
   *
   * Wartet bereits jemand, werden beide sofort verbunden und die Partie
   * startet. Sonst wird der Spieler zum Wartenden.
   *
   * Wer schon in einer laufenden Partie ist, wird abgewiesen ('busy').
   * Sonst würde ein doppelter Klick auf "Spiel suchen" die gerade
   * gestartete Partie sofort wieder beenden.
   *
   * ticket ist die Suchnummer des Clients. Die Lobby wertet sie nicht
   * aus, sondern merkt sie sich nur, damit index.js sie in gameStart
   * zurückschicken kann (siehe public/js/flow.js).
   *
   * @param {string} playerId
   * @param {string} name
   * @param {number | null} [ticket]
   * @returns {{status: 'waiting'} | {status: 'busy'} | {status: 'matched', match: Match}}
   */
  join(playerId, name, ticket = null) {
    if (this.playerMatch.has(playerId)) return { status: 'busy' };

    if (this.waiting && this.waiting.id === playerId) {
      this.waiting.name = name;
      this.waiting.ticket = ticket;
      return { status: 'waiting' };
    }

    if (!this.waiting) {
      this.waiting = { id: playerId, name, ticket };
      return { status: 'waiting' };
    }

    const first = this.waiting;
    this.waiting = null;

    // Wer zuerst gewartet hat, spielt Schwarz und beginnt.
    const players = {
      [BLACK]: { ...first },
      [WHITE]: { id: playerId, name, ticket },
    };
    const match = this.createMatch(`m${nextMatchId++}`, players);

    this.matches.set(match.id, match);
    this.playerMatch.set(first.id, match.id);
    this.playerMatch.set(playerId, match.id);

    return { status: 'matched', match };
  }

  matchOf(playerId) {
    const matchId = this.playerMatch.get(playerId);
    return matchId ? (this.matches.get(matchId) ?? null) : null;
  }

  colorOf(match, playerId) {
    if (match.players[BLACK].id === playerId) return BLACK;
    if (match.players[WHITE].id === playerId) return WHITE;
    return null;
  }

  opponentIn(match, playerId) {
    const color = this.colorOf(match, playerId);
    if (color === null) return null;
    return match.players[opponentOf(color)];
  }

  /**
   * Entfernt eine Partie vollständig: Zeitgeber aus, beide Spieler frei.
   * Wird nach regulärem Spielende und nach Abbruch aufgerufen.
   */
  close(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return;
    match.dispose();
    for (const color of [BLACK, WHITE]) {
      const player = match.players[color];
      if (this.playerMatch.get(player.id) === matchId) this.playerMatch.delete(player.id);
    }
    this.matches.delete(matchId);
  }

  /**
   * Entfernt einen Spieler aus Warteschlange und Partie.
   *
   * Wird sowohl beim Verbindungsabbruch als auch beim freiwilligen
   * Verlassen aufgerufen. Laut Aufgabe wird die Partie in dem Fall
   * einfach beendet.
   *
   * @returns {{opponent: object | null, matchId: string | null}}
   */
  leave(playerId) {
    if (this.waiting && this.waiting.id === playerId) {
      this.waiting = null;
    }

    const match = this.matchOf(playerId);
    if (!match) return { opponent: null, matchId: null };

    const opponent = this.opponentIn(match, playerId);
    this.close(match.id);
    return { opponent, matchId: match.id };
  }

  /** Momentaufnahme für Tests: wie viele warten, spielen, Partien laufen. */
  stats() {
    return {
      waiting: this.waiting ? 1 : 0,
      matches: this.matches.size,
      players: this.playerMatch.size,
    };
  }
}
