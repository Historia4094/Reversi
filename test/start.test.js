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

/**
 * Startet den Server und wartet auf die Startmeldung.
 * @param {string[]} args Argumente für index.js (Port).
 * @param {object} [env] Zusätzliche Umgebungsvariablen.
 * @param {string[]} [nodeArgs] Optionen für Node selbst, z. B. --import.
 */
function start(args, env = {}, nodeArgs = []) {
  const child = spawn(process.execPath, [...nodeArgs, 'server/index.js', ...args], {
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

test('Ohne HOST: auf allen Adressen, Startmeldung mit localhost', async () => {
  const server = start(['4393'], { HOST: '' });
  await server.ready;
  assert.match(server.output(), /läuft auf http:\/\/localhost:4393/);
  assert.doesNotMatch(server.output(), /Nur unter/);
  const response = await fetch('http://127.0.0.1:4393/');
  assert.equal(response.status, 200);
  server.child.kill('SIGTERM');
  assert.equal(await server.exited, 0);
});

test('IPv6-Adresse als HOST steht in der Startmeldung in Klammern', async () => {
  const server = start(['4394'], { HOST: '::1' });
  await server.ready;
  assert.match(server.output(), /läuft auf http:\/\/\[::1\]:4394/);
  assert.match(server.output(), /Nur unter ::1 erreichbar/);
  server.child.kill('SIGTERM');
  assert.equal(await server.exited, 0);
});

test('Ein anderer Startfehler als ein belegter Port beendet mit Code 1', async () => {
  // .invalid ist als Domain reserviert und wird nie aufgelöst.
  const server = start(['4395'], { HOST: 'gibt-es-nicht.invalid' });
  server.ready.catch(() => {}); // kommt nie
  assert.equal(await server.exited, 1);
  assert.match(server.output(), /Server konnte nicht starten/);
});

test('Ein unbehandelter Fehler wird geloggt, der Server läuft weiter', async () => {
  // Löst kurz nach dem Start je einen Fehler und eine abgelehnte Promise
  // aus, die niemand abfängt – so wie ein Fehler in einem Zeitgeber.
  const trouble =
    'data:text/javascript,setTimeout(()=>{throw new Error("Testfehler")},300);' +
    'setTimeout(()=>Promise.reject(new Error("Testablehnung")),300);';
  const server = start(['4396'], { HOST: '127.0.0.1' }, ['--import', trouble]);
  await server.ready;
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.match(server.output(), /Unbehandelter Fehler:.*Testfehler/s);
  assert.match(server.output(), /Unbehandelte Rejection:.*Testablehnung/s);
  const response = await fetch('http://127.0.0.1:4396/');
  assert.equal(response.status, 200, 'Server läuft nach dem Fehler weiter');
  server.child.kill('SIGTERM');
  assert.equal(await server.exited, 0);
});
