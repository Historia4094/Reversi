/**
 * Einstellungen aus Kommandozeile und Umgebung (server/config.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePort,
  resolveTurnMs,
  resolveHost,
  resolveMaxConnectionsPerIp,
  resolveAllowedOrigins,
  DEFAULT_PORT,
  DEFAULT_MAX_CONNECTIONS_PER_IP,
} from '../server/config.js';
import { DEFAULT_TURN_MS } from '../server/match.js';

/** Sammelt Warnungen, statt sie auszugeben. */
function warnings() {
  const list = [];
  const warn = (message) => list.push(message);
  return { list, warn };
}

test('Port: Argument vor PORT vor Standard', () => {
  assert.equal(resolvePort({ arg: '4000', env: '5000' }), 4000);
  assert.equal(resolvePort({ arg: undefined, env: '5000' }), 5000);
  assert.equal(resolvePort({ arg: '', env: '' }), DEFAULT_PORT);
});

test('Port: ungültige Werte werden mit Warnung übersprungen', () => {
  const { list, warn } = warnings();
  assert.equal(resolvePort({ arg: 'abc', env: '70000' }, warn), DEFAULT_PORT);
  assert.equal(list.length, 2);
  assert.equal(resolvePort({ arg: '0', env: '3001' }, warn), 3001);
});

test('Bedenkzeit: Sekunden werden zu Millisekunden', () => {
  assert.equal(resolveTurnMs(undefined), DEFAULT_TURN_MS);
  assert.equal(resolveTurnMs('8'), 8000);
  assert.equal(resolveTurnMs('0.4'), 400);
});

test('Bedenkzeit: außerhalb von 0,2 bis 600 Sekunden gilt der Standard', () => {
  const { list, warn } = warnings();
  for (const raw of ['0.1', '601', 'abc', 'Infinity']) {
    assert.equal(resolveTurnMs(raw, warn), DEFAULT_TURN_MS, raw);
  }
  assert.equal(list.length, 4);
});

test('HOST: leer heißt alle Adressen', () => {
  assert.equal(resolveHost(undefined), undefined);
  assert.equal(resolveHost('  '), undefined);
  assert.equal(resolveHost(' 127.0.0.1 '), '127.0.0.1');
});

test('Verbindungen je IP: Standard, gültige und ungültige Werte', () => {
  const { list, warn } = warnings();
  assert.equal(resolveMaxConnectionsPerIp(undefined), DEFAULT_MAX_CONNECTIONS_PER_IP);
  assert.equal(resolveMaxConnectionsPerIp('8'), 8);
  assert.equal(resolveMaxConnectionsPerIp('1', warn), DEFAULT_MAX_CONNECTIONS_PER_IP);
  assert.equal(resolveMaxConnectionsPerIp('2.5', warn), DEFAULT_MAX_CONNECTIONS_PER_IP);
  assert.equal(list.length, 2);
});

test('ALLOWED_ORIGINS: Liste von Seiten, ungültige Einträge mit Warnung', () => {
  const { list, warn } = warnings();
  assert.deepEqual(resolveAllowedOrigins(undefined), []);
  assert.deepEqual(
    resolveAllowedOrigins(' https://Reversi.Example.org/spiel , http://10.0.0.5:3000,kaputt', warn),
    ['https://reversi.example.org', 'http://10.0.0.5:3000'],
  );
  assert.equal(list.length, 1);
});
