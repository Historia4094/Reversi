/**
 * Start über server/index.js, so wie mit "npm start".
 *
 * Der Prozess wird mit SIGTERM beendet und muss sich mit Code 0
 * verabschieden. Erst dann schreibt Node die Daten für die
 * Testabdeckung; ein hart beendeter Prozess fehlte im Bericht.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Startet den Server und wartet auf die Startmeldung. */
function start(args, env = {}) {
  const child = spawn(process.execPath, ['server/index.js', ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startet nicht:\n${output}`)), 8000);
    const onData = (chunk) => {
      output += chunk;
      if (output.includes('Bedenkzeit pro Zug')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, ready, exited, output: () => output };
}

test('Start mit Port als Argument und Ende mit Code 0', async () => {
  const server = start(['4391'], { HOST: '127.0.0.1', TURN_SECONDS: '8' });
  await server.ready;
  assert.match(server.output(), /läuft auf http:\/\/127\.0\.0\.1:4391/);
  assert.match(server.output(), /Bedenkzeit pro Zug: 8 Sekunden/);

  const response = await fetch('http://127.0.0.1:4391/');
  assert.equal(response.status, 200);

  server.child.kill('SIGTERM');
  assert.equal(await server.exited, 0);
});

test('Ungültige Einstellungen führen zu Warnung und Standardwert', async () => {
  const server = start([], { PORT: 'abc', HOST: '127.0.0.1', TURN_SECONDS: '9999' });
  await server.ready;
  assert.match(server.output(), /Ungültiger Port/);
  assert.match(server.output(), /Ungültige TURN_SECONDS/);
  assert.match(server.output(), /:3000/);
  server.child.kill('SIGTERM');
  assert.equal(await server.exited, 0);
});

test('Ein belegter Port beendet den Start mit Code 1', async () => {
  const first = start(['4392'], { HOST: '127.0.0.1' });
  await first.ready;
  const second = start(['4392'], { HOST: '127.0.0.1' });
  second.ready.catch(() => {}); // kommt nie: Der zweite Server startet nicht.
  assert.equal(await second.exited, 1);
  assert.match(second.output(), /schon belegt/);
  first.child.kill('SIGTERM');
  await first.exited;
});
