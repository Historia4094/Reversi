/**
 * Bausteine des Schutzes vor Überlastung und fremden Seiten (server/limits.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RateLimiter,
  ConnectionCounter,
  isSameOrigin,
  isHandshake,
  clientAddress,
} from '../server/limits.js';

const request = (headers, url = '/socket.io/?EIO=4&transport=websocket') => ({ headers, url });

test('Token-Bucket: ein Schub bis zur Grenze geht durch, danach nicht', () => {
  const now = 0;
  const limiter = new RateLimiter({ perSecond: 5, now: () => now });
  for (let i = 0; i < 5; i++) assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
});

test('Token-Bucket: mit der Zeit kommen neue Token hinzu, höchstens bis zur Grenze', () => {
  let now = 0;
  const limiter = new RateLimiter({ perSecond: 5, now: () => now });
  for (let i = 0; i < 5; i++) limiter.take();
  now = 200; // 0,2 s = ein Token
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
  now = 60_000; // lange Pause füllt nur bis zur Grenze auf
  for (let i = 0; i < 5; i++) assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
});

test('Verbindungszähler: Grenze je Adresse, Abmelden gibt frei', () => {
  const counter = new ConnectionCounter(2);
  counter.add('a');
  counter.add('a');
  assert.equal(counter.canConnect('a'), false);
  assert.equal(counter.canConnect('b'), true);
  counter.remove('a');
  assert.equal(counter.canConnect('a'), true);
  counter.remove('a');
  assert.equal(counter.counts.has('a'), false, 'leere Einträge werden entfernt');
});

test('Herkunft: gleiche Seite und fehlende Origin erlaubt, fremde Seite nicht', () => {
  assert.equal(isSameOrigin(request({ host: 'localhost:3000' })), true);
  assert.equal(
    isSameOrigin(request({ host: 'localhost:3000', origin: 'http://localhost:3000' })),
    true,
  );
  assert.equal(
    isSameOrigin(request({ host: '[::1]:3000', origin: 'http://[::1]:3000' })),
    true,
    'IPv6',
  );
  assert.equal(
    isSameOrigin(request({ host: 'localhost:3000', origin: 'https://evil.example' })),
    false,
  );
  assert.equal(
    isSameOrigin(request({ host: 'localhost:3000', origin: 'http://localhost:4000' })),
    false,
    'anderer Port',
  );
  assert.equal(isSameOrigin(request({ host: 'localhost:3000', origin: 'null' })), false);
});

test('Handshake: nur die erste Anfrage zählt als neue Verbindung', () => {
  assert.equal(isHandshake(request({})), true);
  assert.equal(isHandshake(request({}, '/socket.io/?EIO=4&transport=websocket&sid=abc')), false);
  assert.equal(isHandshake({ headers: {} }), true);
});

test('Herkunft hinter einem Proxy: X-Forwarded-Host zählt, Groß- und Kleinschreibung egal', () => {
  const viaProxy = { host: 'localhost:3000', 'x-forwarded-host': 'Kurs.Example.org' };
  assert.equal(isSameOrigin(request({ ...viaProxy, origin: 'https://kurs.example.org' })), true);
  assert.equal(isSameOrigin(request({ ...viaProxy, origin: 'https://evil.example' })), false);
  assert.equal(
    isSameOrigin(request({ host: 'localhost:3000', origin: 'https://kurs.example.org' }), [
      'https://kurs.example.org',
    ]),
    true,
    'ALLOWED_ORIGINS',
  );
});

test('Adresse: X-Forwarded-For nur, wenn die Verbindung vom eigenen Rechner kommt', () => {
  const req = (peer, forwarded) => ({
    socket: { remoteAddress: peer },
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
  });
  assert.equal(clientAddress(req('10.1.2.3', '1.1.1.1')), '10.1.2.3', 'von außen gefälscht');
  assert.equal(clientAddress(req('127.0.0.1', '10.9.9.9, 127.0.0.1')), '10.9.9.9');
  assert.equal(clientAddress(req('::1')), '::1');
  assert.equal(clientAddress({ headers: {} }), 'unbekannt');
});
