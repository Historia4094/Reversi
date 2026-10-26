/**
 * Übersetzt Spielereignisse in Hinweise für den Spieler.
 *
 * Der Server meldet nüchtern, was passiert ist ("Weiß setzt aus",
 * "Zeit abgelaufen, Ersatzzug auf D3"). Hier wird daraus ein Satz aus
 * der Sicht des jeweiligen Spielers. Reine Funktionen ohne DOM – deshalb
 * unter Node testbar.
 *
 * Jeder Hinweis hat eine Wichtigkeit:
 *   critical  – betrifft direkt den Ausgang (eigener Zeitablauf, Aufgabe droht)
 *   important – verändert den Ablauf (Aussetzen, Zeitablauf des Gegners)
 *   extra     – Spielhilfe (Ecke besetzt, großer Zug, nur ein Zug möglich)
 *
 * prominent = als Einblendung über dem Brett statt am Rand.
 */

import { squareName } from '../shared/constants.js';

const TIMES = { 1: 'einmal', 2: 'zweimal', 3: 'dreimal', 4: 'viermal', 5: 'fünfmal' };

/** Ab so vielen gedrehten Steinen gilt ein Zug als "groß". */
export const BIG_FLIP = 6;

const LEVELS = {
  all: new Set(['critical', 'important', 'extra']),
  important: new Set(['critical', 'important']),
  warnings: new Set(['critical']),
};

/** Filtert Hinweise nach der gewählten Stufe aus den Einstellungen. */
export function visibleAt(level, notice) {
  return (LEVELS[level] ?? LEVELS.all).has(notice.importance);
}

/**
 * @param {object[]} events Ereignisse aus der state-Nachricht.
 * @param {{me: number, names: {[color: number]: string}}} ctx
 * @returns {{text: string, tone: string, importance: string, prominent: boolean}[]}
 */
export function noticesFor(events, { me, names }) {
  const nameOf = (color) => names[color] ?? 'Dein Gegner';
  return events.flatMap((event) => {
    const build = BUILDERS[event.type];
    return build ? build(event, { mine: event.player === me, name: nameOf(event.player) }) : [];
  });
}

/**
 * Eine Funktion je Ereignistyp. Jede bekommt das Ereignis und wer es
 * ausgelöst hat (mine = ich selbst, name = Anzeigename) und liefert null,
 * einen oder mehrere Hinweise.
 */
const BUILDERS = {
  timeout: timeoutNotices,
  pass: passNotices,
  move: moveNotices,
};

function timeoutNotices(event, { mine, name }) {
  if (event.square === null) return []; // Aufgabe – zeigt das Ergebnisfenster.
  const where = squareName(event.square.row, event.square.col);
  if (!mine) {
    return [
      {
        text: `${name} hat nicht rechtzeitig gezogen. Der Server hat zufällig ${where} gesetzt.`,
        tone: 'info',
        importance: 'important',
        prominent: true,
      },
    ];
  }
  const left = event.max - event.count;
  const consequence =
    left === 1
      ? 'Beim nächsten Mal gilt die Partie als aufgegeben.'
      : `Noch ${TIMES[left] ?? `${left}-mal`}, dann gilt die Partie als aufgegeben.`;
  return [
    {
      text: `Deine Zeit ist abgelaufen. Der Server hat zufällig ${where} für dich gesetzt. ${consequence}`,
      tone: 'bad',
      importance: 'critical',
      prominent: true,
    },
  ];
}

function passNotices(event, { mine, name }) {
  return [
    mine
      ? {
          text: 'Du hast keinen erlaubten Zug und musst aussetzen.',
          tone: 'warn',
          importance: 'important',
          prominent: true,
        }
      : {
          text: `${name} hat keinen erlaubten Zug und setzt aus. Du bist noch einmal dran.`,
          tone: 'good',
          importance: 'important',
          prominent: true,
        },
  ];
}

function moveNotices(event, { mine, name }) {
  if (event.auto) return []; // steht schon im Zeitablauf-Hinweis
  const where = squareName(event.row, event.col);
  const notices = [];
  if (event.corner) {
    notices.push({
      text: mine
        ? `Ecke ${where} gesichert – dieser Stein kann nicht mehr gedreht werden.`
        : `${name} hat die Ecke ${where} besetzt. Dieser Stein ist nicht mehr zu drehen.`,
      tone: mine ? 'good' : 'warn',
      importance: 'extra',
      prominent: false,
    });
  }
  if (event.flipped >= BIG_FLIP) {
    notices.push({
      text: mine
        ? `Starker Zug: ${event.flipped} Steine auf einmal gedreht.`
        : `${name} dreht ${event.flipped} Steine auf einmal.`,
      tone: mine ? 'good' : 'info',
      importance: 'extra',
      prominent: false,
    });
  }
  return notices;
}

/**
 * Hinweise, die sich aus dem Zustand ergeben statt aus einem Ereignis.
 * Nur, wenn man selbst am Zug ist.
 */
export function stateNotices(state) {
  if (!state.yourTurn || state.finished) return [];
  if (state.legalMoves.length === 1) {
    const [only] = state.legalMoves;
    return [
      {
        text: `Du hast nur einen einzigen erlaubten Zug: ${squareName(only.row, only.col)}.`,
        tone: 'info',
        importance: 'extra',
        prominent: false,
      },
    ];
  }
  return [];
}

/** Warum die Partie zu Ende ist – für das Ergebnisfenster. */
export function endReasonText(result, { me, names }) {
  const nameOf = (color) => (color === me ? 'Du' : (names[color] ?? 'Dein Gegner'));
  const times = TIMES[result.maxTimeouts] ?? `${result.maxTimeouts}-mal`;
  switch (result.endReason) {
    case 'boardFull':
      return 'Das Brett ist voll.';
    case 'wipeout':
      return 'Eine Farbe hat keinen Stein mehr auf dem Brett.';
    case 'noMoves':
      return result.emptySquares === 1
        ? 'Keiner kann mehr ziehen, obwohl noch ein Feld frei ist.'
        : `Keiner kann mehr ziehen, obwohl noch ${result.emptySquares} Felder frei sind.`;
    case 'resign':
      return result.forfeitedBy === me
        ? 'Du hast aufgegeben.'
        : `${nameOf(result.forfeitedBy)} hat aufgegeben.`;
    case 'inactive':
      return result.forfeitedBy === me
        ? `Du hast ${times} hintereinander nicht rechtzeitig gezogen. Die Partie gilt als aufgegeben.`
        : `${nameOf(result.forfeitedBy)} hat ${times} hintereinander nicht rechtzeitig gezogen. Die Partie gilt als aufgegeben.`;
    default:
      return '';
  }
}
