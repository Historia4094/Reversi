/**
 * Schutz vor fremden Seiten und vor Überlastung.
 *
 * Node.js arbeitet alle Nachrichten in einer einzigen Event-Loop ab. Wer
 * den Server mit Nachrichten oder Verbindungen flutet, bremst damit alle
 * anderen Partien. Die Grenzen hier sind so gewählt, dass ein Mensch sie
 * beim Spielen nie erreicht.
 */

/** Größte erlaubte Nachricht. Ein Zug ist wenige Dutzend Byte groß. */
export const MAX_MESSAGE_BYTES = 4_096;

/** Nachrichten pro Sekunde und Socket, kurzzeitig auch so viele am Stück. */
export const MESSAGES_PER_SECOND = 20;

/**
 * Kommt die Anfrage von der eigenen Seite?
 *
 * WebSocket-Verbindungen unterliegen nicht der Same-Origin-Policy des
 * Browsers. Ohne diese Prüfung könnte jede fremde Webseite, die jemand im
 * selben Netz öffnet, im Hintergrund eine Verbindung aufbauen, den
 * Warteplatz belegen oder Partien abbrechen (Cross-Site WebSocket
 * Hijacking).
 *
 * Verglichen wird die Origin mit dem Host, unter dem die Seite gerade
 * aufgerufen wurde. Eine feste Liste ginge nicht, weil der Server unter
 * localhost, der LAN-Adresse und der Adresse des Kursservers erreichbar
 * ist. Fehlt die Origin, ist das kein Cross-Site-Fall: Browser senden sie
 * bei WebSocket immer, nur Node-Clients (Tests) lassen sie weg.
 *
 * Läuft der Server hinter einem Proxy (z. B. nginx auf dem Kursserver),
 * kommt oft ein anderer Host an, etwa "localhost:3000". Der Proxy nennt
 * den ursprünglichen dann in X-Forwarded-Host; der zählt ebenfalls. Das
 * schwächt den Schutz nicht: Eine fremde Webseite kann im Browser keine
 * eigenen Header an eine WebSocket-Verbindung hängen. Für alles andere
 * gibt es ALLOWED_ORIGINS (allowed).
 * @param {import('node:http').IncomingMessage} req
 * @param {string[]} [allowed] zusätzlich erlaubte Origins, z. B. "https://spiel.example"
 */
export function isSameOrigin(req, allowed = []) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (allowed.includes(url.origin)) return true;
  const hosts = [req.headers.host, ...String(req.headers['x-forwarded-host'] ?? '').split(',')]
    .map((host) => host?.trim().toLowerCase())
    .filter(Boolean);
  return hosts.includes(url.host);
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Adresse des Spielers, für die Grenze je Adresse.
 *
 * Kommt die Verbindung von diesem Rechner selbst, ist das meist ein Proxy.
 * Dann stünden alle Spieler unter derselben Adresse 127.0.0.1, und die
 * Grenze träfe alle gemeinsam. Nennt der Proxy die echte Adresse in
 * X-Forwarded-For, zählt diese. Von außen wird der Header nicht beachtet,
 * weil ihn jeder Client selbst setzen könnte.
 * @param {import('node:http').IncomingMessage} req
 */
export function clientAddress(req) {
  const peer = req.socket?.remoteAddress ?? 'unbekannt';
  if (!LOOPBACK.has(peer)) return peer;
  const forwarded = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim();
  return forwarded || peer;
}

/**
 * Ist das die erste Anfrage einer neuen Verbindung? Socket.io prüft auch
 * den späteren Wechsel von Polling auf WebSocket. Der gehört zu einer
 * schon gezählten Verbindung und trägt deren Kennung (sid).
 * @param {import('node:http').IncomingMessage} req
 */
export function isHandshake(req) {
  return !new URL(req.url ?? '/', 'http://localhost').searchParams.has('sid');
}

/** Zählt offene Verbindungen je IP-Adresse. */
export class ConnectionCounter {
  constructor(maxPerAddress) {
    this.max = maxPerAddress;
    this.counts = new Map();
  }

  canConnect(address) {
    return (this.counts.get(address) ?? 0) < this.max;
  }

  add(address) {
    this.counts.set(address, (this.counts.get(address) ?? 0) + 1);
  }

  remove(address) {
    const count = (this.counts.get(address) ?? 0) - 1;
    if (count > 0) this.counts.set(address, count);
    else this.counts.delete(address);
  }
}

/**
 * Token-Bucket: Jede Nachricht kostet ein Token, pro Sekunde kommen
 * MESSAGES_PER_SECOND neue hinzu, höchstens so viele liegen bereit. Ein
 * kurzer Schub (Doppelklick, schnelles Tippen) geht also durch, eine
 * Dauerflut nicht.
 */
export class RateLimiter {
  /**
   * @param {{perSecond?: number, now?: () => number}} [options] now ist
   *   austauschbar, damit Tests die Zeit vorgeben können.
   */
  constructor({ perSecond = MESSAGES_PER_SECOND, now = Date.now } = {}) {
    this.perSecond = perSecond;
    this.now = now;
    this.tokens = perSecond;
    this.updated = now();
  }

  /** @returns {boolean} true = Nachricht verarbeiten, false = verwerfen. */
  take() {
    const time = this.now();
    const refill = ((time - this.updated) / 1000) * this.perSecond;
    this.tokens = Math.min(this.perSecond, this.tokens + refill);
    this.updated = time;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
