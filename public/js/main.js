/**
 * Steuerung des Clients.
 *
 * Der Client kennt vier Bildschirme (Anmeldung, Brettwahl, Warten, Spiel)
 * und reagiert auf Nachrichten des Servers. Er trifft keine
 * Spielentscheidungen: welche Züge erlaubt sind, wer am Zug ist, wann die
 * Zeit abläuft und wer gewonnen hat, steht ausschließlich in den
 * Nachrichten vom Server.
 *
 * Die eigentliche Arbeit liegt in kleinen Modulen:
 *   board.js    Brett zeichnen          settings.js  Einstellungen
 *   clock.js    Bedenkzeit anzeigen     notices.js   Einblendungen
 *   log.js      Zugverlauf              hints.js     Ereignis -> Hinweistext
 *   flow.js     Suchen/Spielen/Fertig, Schutz vor veralteten Nachrichten
 */
import { BLACK, WHITE, opponentOf } from './constants.js';
import { connect } from './net.js';
import { BoardView } from './board.js';
import { Settings } from './settings.js';
import { Notifier } from './notices.js';
import { ClockView } from './clock.js';
import { MoveLog } from './log.js';
import { Flow } from './flow.js';
import { noticesFor, stateNotices, endReasonText, visibleAt } from './hints.js';

const $ = (id) => document.getElementById(id);

const screens = {
  login: $('screen-login'),
  theme: $('screen-theme'),
  waiting: $('screen-waiting'),
  game: $('screen-game'),
};

const el = {
  loginForm: $('login-form'),
  nameInput: $('name-input'),
  loginError: $('login-error'),
  backToLogin: $('back-to-login'),
  startSearch: $('start-search'),
  waitingName: $('waiting-name'),
  waitingTimer: $('waiting-timer'),
  cancelWaiting: $('cancel-waiting'),
  board: $('board'),
  scoreBlack: $('score-black'),
  scoreWhite: $('score-white'),
  scoreBlackValue: $('score-black-value'),
  scoreWhiteValue: $('score-white-value'),
  scoreBlackName: $('score-black-name'),
  scoreWhiteName: $('score-white-name'),
  tallyBlack: $('tally-black'),
  turn: $('turn-indicator'),
  hint: $('hint'),
  strikes: $('strikes'),
  resign: $('resign'),
  newGame: $('new-game'),
  settingsDialog: $('settings'),
  settingsReset: $('settings-reset'),
  result: $('result'),
  resultTitle: $('result-title'),
  resultReason: $('result-reason'),
  resultDetail: $('result-detail'),
  playAgain: $('play-again'),
};

/** In welcher Phase dieses Fenster ist – siehe flow.js. */
const flow = new Flow();

/** Anzeigezustand dieses Browserfensters. */
const session = {
  color: null,
  name: '',
  names: {},
  waitingSince: 0,
  waitTimer: null,
  lastState: null,
  /** Grund für den zuletzt abgelehnten Zug; bleibt bis zum nächsten Zug stehen. */
  rejection: '',
  resignTimer: null,
  resultTimer: null,
  offline: false,
};

const settings = new Settings();
settings.bind();

const boardView = new BoardView(el.board, (row, col) => net.move(row, col));
const notifier = new Notifier({ toastRoot: $('toasts'), banner: $('banner') });
const moveLog = new MoveLog($('move-log'), $('move-log-empty'));
const clock = new ClockView(
  { root: $('clock'), time: $('clock-time'), fill: $('clock-fill'), label: $('clock-label') },
  {
    onWarn: (seconds) =>
      notify({
        text: `Noch ${seconds} Sekunden für deinen Zug. Danach setzt der Server zufällig für dich.`,
        tone: 'warn',
        importance: 'critical',
        prominent: false,
      }),
  },
);

const net = connect({
  waiting: onWaiting,
  gameStart: onGameStart,
  state: onState,
  gameOver: onGameOver,
  rejected: onRejected,
  joinRejected: onJoinRejected,
  errorMessage: onErrorMessage,
  connectionLost: onConnectionLost,
  connected: onConnected,
});

/* --- Hilfen -------------------------------------------------------- */

function showScreen(name) {
  for (const [key, node] of Object.entries(screens)) {
    node.hidden = key !== name;
  }
  // Auf kleinen Bildschirmen scrollt man auf der Brettwahl nach unten zu
  // "Spiel suchen". Ohne das begänne der nächste Bildschirm mittendrin.
  window.scrollTo(0, 0);
}

/** Zeigt einen Hinweis – sofern die Stufe in den Einstellungen es zulässt. */
function notify(notice) {
  const full = { tone: 'info', importance: 'important', prominent: false, ...notice };
  if (visibleAt(settings.get('notices'), full)) notifier.show(full);
}

function perspective() {
  return { me: session.color, names: session.names };
}

function sideName(color) {
  return color === BLACK ? 'black' : 'white';
}

/* --- Einstellungen ------------------------------------------------- */

for (const button of document.querySelectorAll('[data-open-settings]')) {
  button.addEventListener('click', () => el.settingsDialog.showModal());
}

el.settingsReset.addEventListener('click', () => settings.reset());

// Jede Änderung wirkt sofort – auch mitten in der Partie.
settings.onChange(() => {
  if (session.lastState) renderState(session.lastState);
});

/* --- Anmeldung ----------------------------------------------------- */

el.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = el.nameInput.value.trim();

  if (name.length === 0) {
    el.loginError.textContent =
      'Trag einen Namen ein, damit dein Gegner weiß, gegen wen er spielt.';
    el.loginError.hidden = false;
    return;
  }

  el.loginError.hidden = true;
  session.name = name;
  showScreen('theme');
  el.startSearch.focus();
});

el.backToLogin.addEventListener('click', () => {
  showScreen('login');
  el.nameInput.focus();
});

// Gesperrt, bis der Server antwortet: ein Doppelklick schickt sonst
// zwei Anmeldungen.
el.startSearch.addEventListener('click', () => {
  const ticket = flow.startSearch();
  if (ticket === null) return;
  el.startSearch.disabled = true;
  net.join(session.name, ticket);
});

el.cancelWaiting.addEventListener('click', () => {
  net.leave();
  backToThemeScreen();
});

/** Zurück zur Brettwahl, bereit für eine neue Suche. */
function backToThemeScreen() {
  flow.reset();
  stopWaitingTimer();
  el.startSearch.disabled = false;
  showScreen(session.name ? 'theme' : 'login');
  (session.name ? el.startSearch : el.nameInput).focus();
}

/* --- Aufgeben: zweistufig, damit ein Fehlklick nicht die Partie kostet */

el.resign.addEventListener('click', () => {
  if (el.resign.dataset.armed === 'true') {
    disarmResign();
    net.resign();
    return;
  }
  el.resign.dataset.armed = 'true';
  el.resign.textContent = 'Wirklich aufgeben? Nochmal tippen';
  session.resignTimer = setTimeout(disarmResign, 4000);
});

function disarmResign() {
  clearTimeout(session.resignTimer);
  session.resignTimer = null;
  el.resign.dataset.armed = 'false';
  el.resign.textContent = 'Aufgeben';
}

/* --- Ergebnisfenster und neue Partie ------------------------------ */

// Das Ergebnisfenster darf man mit Escape schließen, um sich das
// Endbrett anzusehen. Der Weg zurück bleibt dann der Knopf
// "Neue Partie", der nach Spielende statt "Aufgeben" erscheint.
function startOver() {
  if (el.result.open) el.result.close();
  boardView.reset();
  session.lastState = null;
  backToThemeScreen();
}

el.playAgain.addEventListener('click', startOver);
el.newGame.addEventListener('click', startOver);

/** Aufgeben während der Partie, "Neue Partie" danach. */
function showGameActions(over) {
  el.resign.hidden = over;
  el.newGame.hidden = !over;
}

function showResult(title, reason, detail) {
  el.resultTitle.textContent = title;
  el.resultReason.textContent = reason;
  el.resultReason.hidden = reason === '';
  el.resultDetail.textContent = detail;
  if (el.settingsDialog.open) el.settingsDialog.close();
  if (!el.result.open) el.result.showModal();
  el.playAgain.focus();
}

/* --- Servernachrichten -------------------------------------------- */

function onWaiting(payload) {
  if (!flow.isCurrentSearch(payload?.ticket)) return;
  session.name = payload?.name ?? session.name;
  el.waitingName.textContent = session.name;
  startWaitingTimer();
  showScreen('waiting');
}

function onGameStart(payload) {
  // Gehört zu einer abgebrochenen Suche: der Server hat diese Partie
  // beim Eintreffen unseres "leave" bereits beendet.
  if (!flow.beginGame(payload?.ticket)) return;

  stopWaitingTimer();
  disarmResign();
  clearTimeout(session.resultTimer);

  session.color = payload.yourColor;
  session.name = payload.yourName;
  session.names = {
    [payload.yourColor]: payload.yourName,
    [opponentOf(payload.yourColor)]: payload.opponentName,
  };
  session.rejection = '';
  el.startSearch.disabled = false;
  showGameActions(false);

  settings.setPerspective(sideName(session.color));
  boardView.setPerspective(session.color, session.names);
  boardView.reset();
  moveLog.reset();
  notifier.clear();

  const youAreBlack = session.color === BLACK;
  el.scoreBlackName.textContent = youAreBlack ? `${session.name} (du)` : payload.opponentName;
  el.scoreWhiteName.textContent = youAreBlack ? payload.opponentName : `${session.name} (du)`;

  for (const node of document.querySelectorAll('[data-turn-seconds]')) {
    node.textContent = String(Math.round(payload.state.turnMs / 1000));
  }

  if (el.result.open) el.result.close();
  showScreen('game');
  onState(payload.state);

  notify({
    text: youAreBlack
      ? `Du spielst gegen ${payload.opponentName} und fängst an.`
      : `Du spielst gegen ${payload.opponentName}. ${payload.opponentName} fängt an.`,
    tone: 'info',
    importance: 'important',
  });
}

function onState(state) {
  if (!flow.playing) return;
  // Ein neuer Zug (oder Zeitablauf) löst den Hinweis zur letzten
  // Ablehnung ab. Ein Zustand ohne Ereignisse ist nur die Korrektur nach
  // einer Ablehnung – dann soll der Grund stehen bleiben.
  if ((state.events ?? []).length > 0) session.rejection = '';
  session.lastState = state;
  renderState(state);

  const ctx = perspective();
  for (const notice of [...noticesFor(state.events ?? [], ctx), ...stateNotices(state)]) {
    notify(notice);
  }
  updateTitle();
}

function renderState(state) {
  boardView.render(state, { allowAny: settings.get('moveHints') === 'off' });

  const black = state.scores[BLACK];
  const white = state.scores[WHITE];
  el.scoreBlackValue.textContent = String(black);
  el.scoreWhiteValue.textContent = String(white);
  // Anteil von Schwarz an den gesetzten Steinen: zeigt das Verhältnis der
  // beiden Farben zueinander, nicht die Füllung des Bretts.
  el.tallyBlack.style.width = `${(black / (black + white)) * 100}%`;
  el.scoreBlack.dataset.active = String(!state.finished && state.currentPlayer === BLACK);
  el.scoreWhite.dataset.active = String(!state.finished && state.currentPlayer === WHITE);

  const opponent = session.names[opponentOf(session.color)] ?? 'Dein Gegner';

  if (state.finished) {
    el.turn.textContent = 'Partie beendet.';
    el.hint.textContent = '';
    clock.stop();
  } else {
    el.turn.textContent = state.yourTurn ? 'Du bist am Zug.' : `${opponent} ist am Zug.`;
    clock.start(
      state.remainingMs,
      state.turnMs,
      state.yourTurn,
      state.yourTurn ? 'Deine Bedenkzeit' : `Bedenkzeit von ${opponent}`,
    );

    // Bleibt stehen, bis der nächste Zug kommt – anders als die
    // Einblendung, die nach ein paar Sekunden verschwindet.
    if (session.rejection) {
      el.hint.textContent = session.rejection;
    } else if (state.passedLast) {
      el.hint.textContent = state.yourTurn
        ? `${opponent} hat keinen erlaubten Zug und setzt aus. Du bist noch einmal dran.`
        : `Du hast keinen erlaubten Zug und setzt aus. ${opponent} ist noch einmal dran.`;
    } else {
      el.hint.textContent = '';
    }
  }

  renderStrikes(state, opponent);
  moveLog.render(state.history ?? [], perspective());
}

function renderStrikes(state, opponent) {
  const { mine, opponent: theirs } = state.timeouts ?? { mine: 0, opponent: 0 };
  const lines = [];
  if (mine > 0) {
    lines.push(`Du hast ${mine} von ${state.maxTimeouts} Zeitüberschreitungen in Folge.`);
  }
  if (theirs > 0) {
    lines.push(`${opponent}: ${theirs} von ${state.maxTimeouts} Zeitüberschreitungen in Folge.`);
  }
  el.strikes.textContent = lines.join(' ');
  el.strikes.hidden = lines.length === 0;
}

function onRejected(payload) {
  const text = payload?.message ?? 'Dieser Zug ist nicht erlaubt.';
  // Angezeigt wird der Grund beim Rendern des korrigierten Zustands,
  // der direkt nach der Ablehnung kommt.
  session.rejection = text;
  notify({ text, tone: 'bad', importance: 'critical' });
}

/** Der Server hat die Anmeldung abgewiesen (man spielt schon). */
function onJoinRejected(payload) {
  if (!flow.isCurrentSearch(payload?.ticket)) return;
  backToThemeScreen();
  notify({
    text: payload?.message ?? 'Die Anmeldung wurde abgelehnt.',
    tone: 'bad',
    importance: 'critical',
  });
}

function onErrorMessage(payload) {
  notify({
    text: payload?.message ?? 'Es ist ein Fehler aufgetreten.',
    tone: 'bad',
    importance: 'critical',
  });
}

function onGameOver(payload) {
  if (!flow.endGame()) return;
  clock.stop();
  disarmResign();
  showGameActions(true);
  updateTitle();

  if (payload.reason === 'opponentLeft') {
    showResult(
      'Partie abgebrochen',
      payload.message ?? 'Dein Gegner ist nicht mehr verbunden.',
      '',
    );
    return;
  }

  const ctx = perspective();
  let title = 'Unentschieden';
  if (!payload.draw) title = payload.youWon ? 'Du gewinnst' : 'Du verlierst';

  const yours = session.color === BLACK ? payload.scores.black : payload.scores.white;
  const theirs = session.color === BLACK ? payload.scores.white : payload.scores.black;
  const detail = `${yours} zu ${theirs} Steine.`;

  // Kurz warten, damit die letzten Steine sichtbar fertig drehen, bevor
  // das Ergebnis darüber liegt.
  clearTimeout(session.resultTimer);
  session.resultTimer = setTimeout(
    () => showResult(title, endReasonText(payload, ctx), detail),
    900,
  );
}

/**
 * Socket.io versucht nach einem Abbruch selbst, sich neu zu verbinden, und
 * meldet dabei jeden Fehlversuch. Deshalb wird nur der erste gemeldet.
 */
function onConnectionLost() {
  if (session.offline) return;
  session.offline = true;

  stopWaitingTimer();
  clock.stop();
  notifier.clear();

  // Der Server beendet beim Verbindungsabbruch Partie und Warteplatz.
  // Der Client zieht hier nur nach.
  if (flow.endGame()) {
    disarmResign();
    showGameActions(true);
    showResult(
      'Verbindung getrennt',
      'Die Verbindung zum Server ist abgebrochen. Die Partie ist damit beendet.',
      'Melde dich erneut an, sobald der Server wieder erreichbar ist.',
    );
  } else if (flow.searching) {
    backToThemeScreen();
    showResult(
      'Verbindung getrennt',
      'Die Verbindung zum Server ist abgebrochen. Die Suche nach einem Gegner ist beendet.',
      'Such erneut, sobald der Server wieder erreichbar ist.',
    );
  } else {
    notify({ text: 'Keine Verbindung zum Server.', tone: 'bad', importance: 'critical' });
  }
}

function onConnected() {
  if (session.offline) {
    notify({ text: 'Wieder mit dem Server verbunden.', tone: 'good', importance: 'critical' });
  }
  session.offline = false;
}

/* --- Tab im Hintergrund: im Titel zeigen, dass man dran ist -------- */

function updateTitle() {
  const myTurn = flow.playing && session.lastState?.yourTurn;
  document.title = myTurn && document.hidden ? '● Du bist am Zug – Reversi' : 'Reversi';
}

document.addEventListener('visibilitychange', updateTitle);

/* --- Wartezeit ----------------------------------------------------- */

function startWaitingTimer() {
  session.waitingSince = Date.now();
  stopWaitingTimer();
  session.waitTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - session.waitingSince) / 1000);
    const mm = Math.floor(seconds / 60);
    const ss = String(seconds % 60).padStart(2, '0');
    el.waitingTimer.textContent = `Wartezeit ${mm}:${ss}`;
  }, 1000);
}

function stopWaitingTimer() {
  if (session.waitTimer) clearInterval(session.waitTimer);
  session.waitTimer = null;
  el.waitingTimer.textContent = 'Wartezeit 0:00';
}

el.nameInput.focus();
