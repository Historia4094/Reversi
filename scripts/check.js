/**
 * "Build" für dieses Projekt.
 *
 * Es gibt nichts zu bündeln: der Client läuft als ES-Module direkt im
 * Browser. Dieser Schritt prüft deshalb nur, dass jede JavaScript-Datei
 * in server/ und public/js/ syntaktisch in Ordnung ist – ein Tippfehler
 * fällt so vor dem Start auf und nicht erst am Spieltag.
 */
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const folders = ['server', 'public/js', 'scripts'];
let count = 0;

for (const folder of folders) {
  for (const file of readdirSync(folder)) {
    if (!file.endsWith('.js')) continue;
    execFileSync(process.execPath, ['--check', path.join(folder, file)], { stdio: 'inherit' });
    count += 1;
  }
}

console.log(
  `Build ok – ${count} Dateien geprüft. Kein Bündeln nötig, der Client läuft als ES-Module direkt im Browser.`,
);
