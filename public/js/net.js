/**
 * Dünne Hülle um Socket.io.
 *
 * Der Rest des Clients soll nichts über den Transport wissen. Wenn hier
 * später etwas anderes stünde, müsste main.js nicht angefasst werden.
 *
 * Der Client sendet ausschließlich Absichten. Er schickt nie ein Brett,
 * nie einen Punktestand und nie, wer gewonnen hat.
 */
export function connect(handlers) {
  // socket.io.js wird vom Server unter /socket.io/ ausgeliefert.
  const socket = window.io();

  const events = [
    'waiting',
    'gameStart',
    'state',
    'gameOver',
    'rejected',
    'joinRejected',
    'errorMessage',
  ];

  for (const event of events) {
    socket.on(event, (payload) => handlers[event]?.(payload));
  }

  socket.on('connect', () => handlers.connected?.());
  socket.on('connect_error', () => handlers.connectionLost?.());
  socket.on('disconnect', () => handlers.connectionLost?.());

  return {
    /** ticket: Nummer der Suche, kommt in der Antwort zurück (flow.js). */
    join: (name, ticket) => socket.emit('join', { name, ticket }),
    move: (row, col) => socket.emit('move', { row, col }),
    resign: () => socket.emit('resign'),
    leave: () => socket.emit('leave'),
  };
}
