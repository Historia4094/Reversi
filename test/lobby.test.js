/**
 * Lobby: Paarbildung, Verlassen und Sonderfälle, ohne Netzwerk.
 *
 * Die Partien bekommen eine sehr lange Bedenkzeit und werden nach jedem
 * Test über close() bzw. leave() abgeräumt, damit keine Zeitgeber
 * übrig bleiben.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { Match } from '../server/match.js';
import { BLACK, WHITE } from '../server/game.js';

function newLobby() {
  return new Lobby({
    createMatch: (id, players) => new Match({ id, players, turnMs: 60_000 }),
  });
}

test('Der Erste wartet, der Zweite startet die Partie und spielt Weiß', () => {
  const lobby = newLobby();
  assert.deepEqual(lobby.join('a', 'Anna'), { status: 'waiting' });

  const result = lobby.join('b', 'Bruno');
  assert.equal(result.status, 'matched');
  assert.equal(result.match.players[BLACK].name, 'Anna');
  assert.equal(result.match.players[WHITE].name, 'Bruno');
  assert.deepEqual(lobby.stats(), { waiting: 0, matches: 1, players: 2 });

  lobby.close(result.match.id);
});

test('Die Suchnummer jedes Spielers wird gemerkt, nicht ausgewertet', () => {
  const lobby = newLobby();
  lobby.join('a', 'Anna', 5);
  lobby.join('a', 'Anna', 6); // erneut gesucht: neue Nummer gilt
  const { match } = lobby.join('b', 'Bruno', 1);
  assert.equal(match.players[BLACK].ticket, 6);
  assert.equal(match.players[WHITE].ticket, 1);
  lobby.close(match.id);
});

test('Wer schon spielt, wird bei einer zweiten Anmeldung abgewiesen', () => {
  const lobby = newLobby();
  lobby.join('a', 'Anna');
  const { match } = lobby.join('b', 'Bruno');

  // Doppelklick auf "Spiel suchen": die laufende Partie bleibt bestehen.
  assert.deepEqual(lobby.join('b', 'Bruno'), { status: 'busy' });
  assert.equal(lobby.matchOf('b'), match);
  assert.equal(lobby.waiting, null, 'niemand wurde in die Warteschlange gesetzt');

  lobby.close(match.id);
});

test('Doppelte Anmeldung beim Warten bleibt ein einziger Wartender', () => {
  const lobby = newLobby();
  lobby.join('a', 'Anna');
  assert.deepEqual(lobby.join('a', 'Anni'), { status: 'waiting' });
  assert.deepEqual(lobby.stats(), { waiting: 1, matches: 0, players: 0 });
  assert.equal(lobby.waiting.name, 'Anni', 'der neue Name gilt');
});

test('Verlassen während des Wartens räumt die Warteschlange', () => {
  const lobby = newLobby();
  lobby.join('a', 'Anna');
  assert.deepEqual(lobby.leave('a'), { opponent: null, matchId: null });
  assert.equal(lobby.waiting, null);

  // Der Nächste wartet jetzt selbst, statt mit einem Geist verbunden zu werden.
  assert.deepEqual(lobby.join('b', 'Bruno'), { status: 'waiting' });
});

test('Verlassen während der Partie beendet sie und nennt den Gegner', () => {
  const lobby = newLobby();
  lobby.join('a', 'Anna');
  const { match } = lobby.join('b', 'Bruno');

  const { opponent, matchId } = lobby.leave('a');
  assert.equal(opponent.id, 'b');
  assert.equal(matchId, match.id);
  assert.equal(match.timer, null, 'die Uhr der Partie ist abgeräumt');
  assert.deepEqual(lobby.stats(), { waiting: 0, matches: 0, players: 0 });

  // Der Gegner ist danach frei für eine neue Partie.
  assert.deepEqual(lobby.join('b', 'Bruno'), { status: 'waiting' });
});

test('close() darf mehrfach aufgerufen werden', () => {
  const lobby = newLobby();
  lobby.join('a', 'Anna');
  const { match } = lobby.join('b', 'Bruno');
  lobby.close(match.id);
  assert.doesNotThrow(() => lobby.close(match.id));
  assert.doesNotThrow(() => lobby.leave('a'), 'Verlassen nach dem Ende ist harmlos');
});

test('Mehrere Paare bekommen getrennte Partien', () => {
  const lobby = newLobby();
  lobby.join('a', 'A');
  const first = lobby.join('b', 'B').match;
  lobby.join('c', 'C');
  const second = lobby.join('d', 'D').match;

  assert.notEqual(first.id, second.id);
  assert.equal(lobby.matchOf('a'), first);
  assert.equal(lobby.matchOf('d'), second);
  assert.equal(lobby.opponentIn(first, 'a').id, 'b');
  assert.equal(lobby.colorOf(second, 'x'), null, 'Fremde haben keine Farbe');

  lobby.close(first.id);
  lobby.close(second.id);
});
