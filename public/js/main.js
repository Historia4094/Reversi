/**
 * Steuerung des Clients.
 *
 * Der Client kennt vier Bildschirme (Anmeldung, Brettwahl, Warten, Spiel)
 * und reagiert auf Nachrichten des Servers. Er trifft keine
 * Spielentscheidungen: welche Züge erlaubt sind, wer am Zug ist, wann die
 * Zeit abläuft und wer gewonnen hat, steht ausschließlich in den
 * Nachrichten vom Server.
 *
 * Diese Datei verbindet nur: Sie reagiert auf Bedienung und Nachrichten
 * und reicht sie an die Module weiter, die die eigentliche Arbeit tun:
 *   board.js    Brett zeichnen          settings.js  Einstellungen
 *   clock.js    Bedenkzeit anzeigen     notices.js   Hinweise und Ansagen
 *   score.js    Punktestand, Zuganzeige result.js    Ergebnisfenster
 *   log.js      Zugverlauf              hints.js     Ereignis -> Hinweistext
 *   flow.js     Suchen/Spielen/Fertig, Schutz vor veralteten Nachrichten
 */
import { BLACK, opponentOf, sideName } from '../shared/constants.js';
import { connect } from './net.js';
import { BoardView } from './board.js';
import { Settings } from './settings.js';
import { Notifier } from './notices.js';
import { ClockView } from './clock.js';
import { MoveLog } from './log.js';
import { ScoreView } from './score.js';
import { ResultView } from './result.js';
import { Flow } from './flow.js';
import { cleanName, exampleName } from '../shared/names.js';
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
  resign: $('resign'),
  newGame: $('new-game'),
  settingsDialog: $('settings'),
  settingsReset: $('settings-reset'),
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
  /** Wann lastState angekommen ist – die Restzeit darin gilt für diesen Moment. */
  receivedAt: 0,
  /** Grund für den zuletzt abgelehnten Zug; bleibt bis zum nächsten Zug stehen. */
  rejection: '',
  resignTimer: null,
  resultTimer: null,
  offline: false,
  /** Zuletzt angesagte Zuganzeige und Zeitüberschreitungen, um nur Änderungen vorzulesen. */
  spokenTurn: '',
  spokenStrikes: '',
};

const settings = new Settings();
settings.bind();

const boardView = new BoardView(el.board, (row, col) => net.move(row, col));
const notifier = new Notifier({
  toastRoot: $('toasts'),
  banner: $('banner'),
  announcer: $('announcer'),
});
const moveLog = new MoveLog($('move-log'), $('move-log-empty'));
const score = new ScoreView();
const result = new ResultView($('result'), { open: openDialog, onPlayAgain: startOver });
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

/**
 * Öffnet ein modales Fenster. Toasts und Ansagen ziehen mit hinein,
 * sonst lägen sie unter dem abgedunkelten Hintergrund (notices.js).
 */
function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  notifier.attach(dialog);
}

for (const dialog of [el.settingsDialog, $('result')]) {
  dialog.addEventListener('close', () => notifier.detach(dialog));
}

/** Zeigt einen Hinweis – sofern die Stufe in den Einstellungen es zulässt. */
function notify(notice) {
  const full = { tone: 'info', importance: 'important', prominent: false, ...notice };
  if (visibleAt(settings.get('notices'), full)) notifier.show(full);
}

function perspective() {
  return { me: session.color, names: session.names };
}

/* --- Einstellungen ------------------------------------------------- */

for (const button of document.querySelectorAll('[data-open-settings]')) {
  button.addEventListener('click', () => openDialog(el.settingsDialog));
}

el.settingsReset.addEventListener('click', () => settings.reset());

// Jede Änderung wirkt sofort – auch mitten in der Partie.
settings.onChange(() => {
  if (session.lastState) renderState(session.lastState);
});

/* --- Anmeldung ----------------------------------------------------- */

// Bei jedem Laden ein anderes Beispiel; ohne JavaScript bleibt das aus
// index.html stehen.
el.nameInput.placeholder = `z. B. ${exampleName()}`;

el.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  // Dieselbe Regel wie auf dem Server: Ein Name braucht mindestens zwei
  // Buchstaben. Leerzeichen, Satzzeichen und Symbole allein zählen nicht.
  const name = cleanName(el.nameInput.value);

  if (name.length === 0) {
    el.loginError.textContent =
      'Dein Name braucht mindestens zwei Buchstaben, damit dein Gegner weiß, gegen wen er spielt.';
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
  // Ein Ergebnis, das noch aussteht (900 ms nach Spielende), darf nicht
  // später über einer neuen Suche erscheinen.
  clearTimeout(session.resultTimer);
  session.resultTimer = null;
  // Läuft schon eine neue Suche, muss der Server davon erfahren. Sonst
  // bliebe dort eine Anmeldung stehen, die niemand mehr sieht.
  if (flow.searching) net.leave();
  result.close();
  boardView.reset();
  session.lastState = null;
  backToThemeScreen();
}

el.newGame.addEventListener('click', startOver);

/** Aufgeben während der Partie, "Neue Partie" danach. */
function showGameActions(over) {
  el.resign.hidden = over;
  el.newGame.hidden = !over;
}

function showResult(title, reason, detail) {
  if (el.settingsDialog.open) el.settingsDialog.close();
  result.show({ title, reason, detail });
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
  session.spokenTurn = '';
  session.spokenStrikes = '';
  el.startSearch.disabled = false;
  showGameActions(false);

  settings.setPerspective(sideName(session.color));
  boardView.setPerspective(session.color, session.names);
  boardView.reset();
  moveLog.reset();
  notifier.clear();

  const youAreBlack = session.color === BLACK;
  score.setPlayers({
    me: session.color,
    myName: session.name,
    opponentName: payload.opponentName,
  });

  for (const node of document.querySelectorAll('[data-turn-seconds]')) {
    node.textContent = String(Math.round(payload.state.turnMs / 1000));
  }

  // Offene Fenster schließen: Hinter dem Einstellungsfenster bliebe der
  // Spielstart unbemerkt, während die eigene Bedenkzeit schon läuft.
  if (el.settingsDialog.open) el.settingsDialog.close();
  result.close();
  showScreen('game');
  onState(payload.state);
  // Tastaturnutzer sollen gleich auf dem Brett weitermachen können, statt
  // vom Seitenanfang aus hinzunavigieren.
  boardView.focus();

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
  session.receivedAt = Date.now();
  renderState(state);

  const ctx = perspective();
  for (const notice of [...noticesFor(state.events ?? [], ctx), ...stateNotices(state)]) {
    notify(notice);
  }
  updateTitle();
}

function renderState(state) {
  const playing = flow.playing && !state.finished;
  boardView.render(state, { allowAny: settings.get('moveHints') === 'off' });
  const shown = score.render(state, { playing, rejection: session.rejection });
  moveLog.render(state.history ?? [], perspective());

  // Neu ansagen, was sich geändert hat – das Neuzeichnen nach einer
  // Einstellung allein nicht. Zusammen mit den Hinweisen aus onState wird
  // daraus eine Ansage (notices.js).
  if (shown.turn !== session.spokenTurn) {
    session.spokenTurn = shown.turn;
    notifier.say(shown.turn);
  }
  if (shown.strikes !== session.spokenStrikes) {
    session.spokenStrikes = shown.strikes;
    notifier.say(shown.strikes);
  }

  // Auch ein Zustand, der noch "läuft" sagt, startet nach dem Ende keine
  // Uhr mehr (z. B. beim Neuzeichnen nach einer Einstellung).
  if (!playing) {
    clock.stop();
    return;
  }
  const opponent = session.names[opponentOf(session.color)] ?? 'Dein Gegner';
  // remainingMs ist eine Momentaufnahme vom Empfang. Wird derselbe
  // Zustand später neu gezeichnet (Einstellung geändert), ist seitdem
  // Zeit vergangen. Ohne Abzug spränge die Uhr zurück.
  const elapsed = Date.now() - session.receivedAt;
  clock.start(
    Math.max(0, state.remainingMs - elapsed),
    state.turnMs,
    state.yourTurn,
    state.yourTurn ? 'Deine Bedenkzeit' : `Bedenkzeit von ${opponent}`,
  );
}

function onRejected(payload) {
  const text = payload?.message ?? 'Dieser Zug ist nicht erlaubt.';
  // Der Grund bleibt unter dem Brett stehen, bis der nächste Zug kommt.
  // Sofort neu zeichnen: Der Server schickt den korrigierten Zustand nicht
  // nach jeder Ablehnung mit, sondern höchstens einmal pro Sekunde.
  session.rejection = text;
  if (session.lastState && flow.playing) renderState(session.lastState);
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

/**
 * Schließt den zuletzt gezeigten Zustand ab. Bei Abbruch oder
 * Verbindungsverlust kommt vom Server kein Endzustand mehr; ohne diesen
 * Schritt blieben die letzten erlaubten Felder anklickbar.
 */
function freezeBoard() {
  if (!session.lastState) return;
  session.lastState = { ...session.lastState, finished: true, yourTurn: false, legalMoves: [] };
  renderState(session.lastState);
}

function onGameOver(payload) {
  if (!flow.endGame()) return;
  clock.stop();
  freezeBoard();
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

  const yours = payload.scores[sideName(session.color)];
  const theirs = payload.scores[sideName(opponentOf(session.color))];
  const detail = `${yours} zu ${theirs} Steine.`;

  // Kurz warten, damit die letzten Steine sichtbar fertig drehen, bevor
  // das Ergebnis darüber liegt.
  clearTimeout(session.resultTimer);
  session.resultTimer = setTimeout(() => {
    session.resultTimer = null;
    // Nur, wenn das Fenster noch bei genau dieser beendeten Partie ist.
    if (flow.phase === 'over') showResult(title, endReasonText(payload, ctx), detail);
  }, 900);
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
    freezeBoard();
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
  // Nur Wörter: Ein Zeichen wie "●" läsen Screenreader als "schwarzer Kreis" vor.
  document.title = myTurn && document.hidden ? 'Du bist am Zug, Reversi' : 'Reversi';
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
