/**
 * Hilfen für die Netzwerktests: echter Server mit echtem Port und echte
 * Socket.io-Clients, aber im selben Prozess wie der Test. Dadurch zählt
 * der Server auch in der Testabdeckung (siehe server/app.js).
 */
import { io as ioClient } from 'socket.io-client';

import { createGameServer } from '../../server/app.js';

const silent = { log() {}, warn() {}, error() {} };

/**
 * Startet einen Spielserver auf einem freien Port.
 * @param {Parameters<typeof createGameServer>[0]} [options]
 * @returns {Promise<{url: string, game: ReturnType<typeof createGameServer>}>}
 */
export async function startServer(options = {}) {
  const game = createGameServer({ logger: silent, ...options });
  await new Promise((resolve) => game.server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${game.server.address().port}`, game };
}

/** Wartet auf ein einzelnes Ereignis eines Sockets. */
export function once(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout bei "${event}"`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Wartet, bis der Socket verbunden ist. Ein einfaches once('connect')
 * reicht nicht: ist die Verbindung schon aufgebaut, wenn der Listener
 * gesetzt wird, kommt das Ereignis nie wieder.
 */
export function connected(socket) {
  if (socket.connected) return Promise.resolve();
  return once(socket, 'connect');
}

/** Wartet auf einen Zustand, der die Bedingung erfüllt. */
export function stateWhere(socket, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout: kein passender Zustand')), timeout);
    const listener = (state) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('state', listener);
      resolve(state);
    };
    socket.on('state', listener);
  });
}

export function newClient(url, options = {}) {
  return ioClient(url, { transports: ['websocket'], forceNew: true, ...options });
}

/**
 * Baut eine laufende Partie auf und liefert beide Sockets samt
 * Startzustand. Schwarz ist der Spieler, der zuerst gewartet hat.
 */
export async function startMatch(t, url, nameA = 'Anna', nameB = 'Bruno') {
  const black = newClient(url);
  const white = newClient(url);
  t.after(() => {
    black.disconnect();
    white.disconnect();
  });

  await connected(black);
  black.emit('join', { name: nameA });
  await once(black, 'waiting');

  await connected(white);
  const startBlack = once(black, 'gameStart');
  white.emit('join', { name: nameB });
  const whiteStart = await once(white, 'gameStart');
  const blackStart = await startBlack;

  return { black, white, blackStart, whiteStart };
}
