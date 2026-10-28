/**
 * Startdatei: liest die Einstellungen, startet den Spielserver und kümmert
 * sich um alles, was den ganzen Prozess betrifft (Port, Fehler, Beenden).
 *
 * Der Server selbst steht in app.js und hat keine Seiteneffekte. Was hier
 * steht, gehört bewusst nicht dorthin: Ein Test, der app.js importiert,
 * soll weder einen Port belegen noch den Prozess beenden können.
 */

import os from 'node:os';

import { createGameServer } from './app.js';
import {
  resolveAllowedOrigins,
  resolveHost,
  resolveMaxConnectionsPerIp,
  resolvePort,
  resolveTurnMs,
} from './config.js';

const PORT = resolvePort({ arg: process.argv[2], env: process.env.PORT });
const TURN_MS = resolveTurnMs(process.env.TURN_SECONDS);
const HOST = resolveHost(process.env.HOST);
const MAX_CONNECTIONS_PER_IP = resolveMaxConnectionsPerIp(process.env.MAX_CONNECTIONS_PER_IP);
const ALLOWED_ORIGINS = resolveAllowedOrigins(process.env.ALLOWED_ORIGINS);

const game = createGameServer({
  turnMs: TURN_MS,
  maxConnectionsPerIp: MAX_CONNECTIONS_PER_IP,
  allowedOrigins: ALLOWED_ORIGINS,
});

// Letzte Absicherung. Normalerweise beendet Node sich bei einem
// unbehandelten Fehler. Die Aufgabe verlangt aber ausdrücklich, dass der
// Server nicht abstürzt – laufende Partien anderer Paare sollen
// weiterlaufen. Alle Socket-Handler fangen ihre Fehler schon selbst
// (guarded in app.js); hier landet nur, was trotzdem durchrutscht, etwa
// aus einem Zeitgeber. Der Fehler wird vollständig geloggt, damit er
// auffällt.
process.on('uncaughtException', (error) => {
  console.error('Unbehandelter Fehler:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelte Rejection:', reason);
});

// Sauber beenden bei Strg+C oder kill: Verbindungen schließen, dann mit
// Code 0 enden. Ein hart beendeter Prozess hinterließe außerdem keine
// Daten für die Testabdeckung.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await game.close();
    process.exit(0);
  });
}

/** IPv4-Adressen im lokalen Netz – dort erreichen Handy und Tablet das Spiel. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

// Startfehler (Port belegt, keine Berechtigung) sind dagegen fatal: ohne
// Port kann der Server nichts tun. Exit-Code 1, damit es auffällt.
game.server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist schon belegt. Läuft der Server noch in einem anderen Fenster?`);
  } else {
    console.error('Server konnte nicht starten:', error);
  }
  process.exit(1);
});

/** Adresse für die Startmeldung; IPv6-Adressen stehen in einer URL in Klammern. */
function shownHost() {
  if (HOST === undefined) return 'localhost';
  return HOST.includes(':') ? `[${HOST}]` : HOST;
}

game.server.listen(PORT, HOST, () => {
  console.log(`Reversi läuft auf http://${shownHost()}:${PORT}`);
  if (HOST === undefined) {
    const addresses = lanAddresses();
    if (addresses.length > 0) {
      console.log('Im selben Netzwerk (Handy, Tablet) erreichbar unter:');
      for (const address of addresses) console.log(`  http://${address}:${PORT}`);
    }
  } else {
    console.log(`Nur unter ${HOST} erreichbar (HOST).`);
  }
  console.log(`Bedenkzeit pro Zug: ${TURN_MS / 1000} Sekunden`);
});
