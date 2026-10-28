/**
 * Schutz vor fremden Seiten und vor Überlastung, über das echte Netzwerk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { startServer, newClient, once, connected, startMatch } from './helpers/net.js';

/** Sammelt Ereignisse eines Sockets für eine feste Zeit. */
function collect(socket, events, ms) {
  const seen = Object.fromEntries(events.map((event) => [event, []]));
  for (const event of events) socket.on(event, (payload) => seen[event].push(payload));
  return new Promise((resolve) => setTimeout(() => resolve(seen), ms));
}

test('Eine fremde Seite bekommt keine Verbindung', async (t) => {
  const { url, game } = await startServer();
  t.after(() => game.close());
  const socket = newClient(url, {
    extraHeaders: { origin: 'https://evil.example' },
    reconnection: false,
  });
  t.after(() => socket.disconnect());
  await once(socket, 'connect_error');
  assert.equal(socket.connected, false);
});

test('Die eigene Seite und Clients ohne Origin werden angenommen', async (t) => {
  const { url, game } = await startServer();
  t.after(() => game.close());
  const own = newClient(url, { extraHeaders: { origin: url } });
  const plain = newClient(url);
  t.after(() => {
    own.disconnect();
    plain.disconnect();
  });
  await Promise.all([connected(own), connected(plain)]);
});

test('Zu große Nachrichten beenden die Verbindung', async (t) => {
  const { url, game } = await startServer();
  t.after(() => game.close());
  const socket = newClient(url, { reconnection: false });
  t.after(() => socket.disconnect());
  await connected(socket);
  const gone = once(socket, 'disconnect');
  socket.emit('join', { name: 'x'.repeat(10_000) });
  await gone;
});

test('Eine Flut von Nachrichten wird verworfen und nur einmal gemeldet', async (t) => {
  const { url, game } = await startServer({ messagesPerSecond: 10 });
  t.after(() => game.close());
  const socket = newClient(url);
  t.after(() => socket.disconnect());
  await connected(socket);

  const seen = collect(socket, ['errorMessage'], 500);
  for (let i = 0; i < 200; i++) socket.emit('move', { row: 0, col: 0 });
  const { errorMessage } = await seen;

  const throttled = errorMessage.filter((m) => m.message.startsWith('Zu viele'));
  const handled = errorMessage.length - throttled.length;
  assert.equal(throttled.length, 1, 'genau eine Meldung zur Flut');
  assert.ok(handled <= 11, `höchstens die erlaubten Nachrichten verarbeitet, waren ${handled}`);
});

test('Abgelehnte Züge: Ablehnung jedes Mal, das ganze Brett höchstens einmal pro Sekunde', async (t) => {
  const { url, game } = await startServer();
  t.after(() => game.close());
  const { white } = await startMatch(t, url);

  const seen = collect(white, ['rejected', 'state'], 400);
  // Weiß ist nicht am Zug: jeder Versuch wird abgelehnt.
  for (let i = 0; i < 10; i++) white.emit('move', { row: 2, col: 3 });
  const { rejected, state } = await seen;

  assert.equal(rejected.length, 10);
  assert.equal(state.length, 1);
});

test('Grenze für Verbindungen je Adresse', async (t) => {
  const { url, game } = await startServer({ maxConnectionsPerIp: 2 });
  t.after(() => game.close());
  const first = newClient(url);
  const second = newClient(url);
  const third = newClient(url, { reconnection: false });
  t.after(() => [first, second, third].forEach((socket) => socket.disconnect()));

  await Promise.all([connected(first), connected(second)]);
  await once(third, 'connect_error');

  // Wer geht, macht den Platz frei.
  first.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const fourth = newClient(url);
  t.after(() => fourth.disconnect());
  await connected(fourth);
});

test('Hinter einem Proxy: eigene Seite über X-Forwarded-Host angenommen, fremde abgelehnt', async (t) => {
  const { url, game } = await startServer();
  t.after(() => game.close());
  const own = newClient(url, {
    extraHeaders: { origin: 'https://kurs.example.org', 'x-forwarded-host': 'kurs.example.org' },
  });
  const foreign = newClient(url, {
    extraHeaders: { origin: 'https://evil.example', 'x-forwarded-host': 'kurs.example.org' },
    reconnection: false,
  });
  t.after(() => {
    own.disconnect();
    foreign.disconnect();
  });
  const rejected = once(foreign, 'connect_error');
  await connected(own);
  await rejected;
});

test('ALLOWED_ORIGINS lässt eine weitere Seite zu und warnt bei anderen einmal', async (t) => {
  const warnings = [];
  const { url, game } = await startServer({
    allowedOrigins: ['https://reversi.example.org'],
    logger: { log() {}, warn: (m) => warnings.push(m), error() {} },
  });
  t.after(() => game.close());
  const allowed = newClient(url, { extraHeaders: { origin: 'https://reversi.example.org' } });
  const other = newClient(url, {
    extraHeaders: { origin: 'https://evil.example' },
    reconnection: false,
  });
  t.after(() => {
    allowed.disconnect();
    other.disconnect();
  });
  const rejected = once(other, 'connect_error');
  await connected(allowed);
  await rejected;
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ALLOWED_ORIGINS=https:\/\/evil\.example/);
});
