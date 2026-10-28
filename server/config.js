/**
 * Einstellungen des Servers aus Kommandozeile und Umgebung.
 *
 * Reine Funktionen: Sie bekommen die Rohwerte übergeben, statt selbst
 * process.argv und process.env zu lesen. Dadurch lassen sie sich direkt
 * testen (test/config.test.js). Ungültige Werte führen nie zum Abbruch,
 * sondern zu einer Warnung und dem Standardwert.
 *
 * Alle Variablen mit Beispielwerten stehen in .env.example.
 */

import { DEFAULT_TURN_MS } from './match.js';

export const DEFAULT_PORT = 3000;
export const DEFAULT_MAX_CONNECTIONS_PER_IP = 200;

/**
 * Port: erstes CLI-Argument, sonst PORT, sonst 3000.
 * @param {{arg?: string, env?: string}} sources
 * @param {(message: string) => void} [warn]
 */
export function resolvePort({ arg, env }, warn = console.warn) {
  for (const [source, candidate] of [
    ['Argument', arg],
    ['PORT', env],
  ]) {
    if (candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isInteger(value) && value > 0 && value < 65536) return value;
    warn(`Ungültiger Port aus ${source}: "${candidate}" – wird ignoriert.`);
  }
  return DEFAULT_PORT;
}

/**
 * Bedenkzeit pro Zug aus TURN_SECONDS, in Millisekunden.
 * @param {string | undefined} raw
 * @param {(message: string) => void} [warn]
 */
export function resolveTurnMs(raw, warn = console.warn) {
  if (raw === undefined || raw === '') return DEFAULT_TURN_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0.2 && seconds <= 600) {
    return Math.round(seconds * 1000);
  }
  warn(`Ungültige TURN_SECONDS "${raw}" (erlaubt: 0.2 bis 600) – nehme ${DEFAULT_TURN_MS / 1000}.`);
  return DEFAULT_TURN_MS;
}

/**
 * Adresse, auf der der Server lauscht (HOST).
 *
 * Ohne Angabe lauscht Node auf "::" im Dual-Stack-Modus und nimmt damit
 * IPv4 und IPv6 an. Das ist für den Kursserver gewollt, der per IPv6
 * erreichbar ist; auf einem reinen IPv4-Rechner fällt Node auf 0.0.0.0
 * zurück. Beim Entwickeln in einem fremden WLAN ist das Spiel damit aber
 * für alle im Netz erreichbar. Dann HOST=127.0.0.1 setzen.
 * @param {string | undefined} raw
 * @returns {string | undefined} undefined = alle Adressen.
 */
export function resolveHost(raw) {
  const host = raw?.trim();
  return host ? host : undefined;
}

/**
 * Zusätzlich erlaubte Seiten für Socket-Verbindungen (ALLOWED_ORIGINS),
 * durch Kommas getrennt, z. B. "https://reversi.example.org". Nötig nur,
 * wenn das Spiel unter einer Adresse aufgerufen wird, die beim Server
 * weder als Host noch als X-Forwarded-Host ankommt (siehe limits.js).
 * @param {string | undefined} raw
 * @param {(message: string) => void} [warn]
 * @returns {string[]}
 */
export function resolveAllowedOrigins(raw, warn = console.warn) {
  if (!raw) return [];
  const origins = [];
  for (const entry of raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    try {
      origins.push(new URL(entry).origin);
    } catch {
      warn(`Ungültiger Eintrag in ALLOWED_ORIGINS: "${entry}" – wird ignoriert.`);
    }
  }
  return origins;
}

/**
 * Höchstzahl gleichzeitiger Verbindungen von einer IP-Adresse
 * (MAX_CONNECTIONS_PER_IP).
 *
 * Großzügig gewählt: Am Spieltag öffnet eine Person womöglich viele Tabs,
 * und hinter einem gemeinsamen Router teilen sich mehrere Geräte eine
 * Adresse. Die Grenze soll nur verhindern, dass ein einzelnes Skript den
 * Server mit Verbindungen füllt.
 * @param {string | undefined} raw
 * @param {(message: string) => void} [warn]
 */
export function resolveMaxConnectionsPerIp(raw, warn = console.warn) {
  if (raw === undefined || raw === '') return DEFAULT_MAX_CONNECTIONS_PER_IP;
  const value = Number(raw);
  if (Number.isInteger(value) && value >= 2 && value <= 10_000) return value;
  warn(
    `Ungültige MAX_CONNECTIONS_PER_IP "${raw}" (erlaubt: 2 bis 10000) – nehme ${DEFAULT_MAX_CONNECTIONS_PER_IP}.`,
  );
  return DEFAULT_MAX_CONNECTIONS_PER_IP;
}
