/**
 * Anzeigeeinstellungen: speichern, an Formularfelder binden, anwenden.
 *
 * Alles hier betrifft nur den eigenen Bildschirm. Nichts davon geht an den
 * Server, weil nichts davon den Spielzustand berührt – beide Spieler
 * können ganz unterschiedliche Einstellungen haben und spielen trotzdem
 * dieselbe Partie.
 *
 * Angewendet werden die Einstellungen über data-Attribute am <html>-
 * Element (data-board="wood", data-symbols="on" …). Das CSS reagiert
 * darauf; das JavaScript muss keine einzelnen Elemente umfärben.
 *
 * Jedes Formularfeld mit data-setting="<name>" wird automatisch gebunden.
 * Dasselbe Feld darf mehrfach vorkommen (Brettwahl auf dem Startbildschirm
 * und im Einstellungsfenster) – alle Kopien bleiben synchron.
 */

import {
  STONE_COLORS,
  edgeColorFor,
  markColorFor,
  resolveStones,
  toHex,
  WEAK_CONTRAST_RATIO,
} from './colors.js';
import { otherSide } from '../shared/constants.js';

// v2: Werte seit Version 1.3 englisch (felt statt filz …). Alte
// Einstellungen unter v1 werden dadurch einfach nicht mehr gelesen.
const STORAGE_KEY = 'reversi.settings.v2';

export const DEFAULTS = Object.freeze({
  board: 'felt',
  stoneMine: 'standard',
  stoneOpponent: 'standard',
  symbols: false,
  reduceMotion: false,
  moveHints: 'rings',
  lastMove: true,
  coords: false,
  notices: 'all',
});

const STONE_IDS = STONE_COLORS.map((color) => color.id);

/** Erlaubte Werte je Einstellung. Alles andere wird verworfen. */
const ALLOWED = {
  board: ['felt', 'wood', 'marine', 'contrast'],
  stoneMine: STONE_IDS,
  stoneOpponent: STONE_IDS,
  moveHints: ['rings', 'counts', 'off'],
  notices: ['all', 'important', 'warnings'],
};

function isValid(key, value) {
  // Object.hasOwn statt "key in DEFAULTS": "in" prüft auch geerbte
  // Eigenschaften. Ein gespeicherter Schlüssel "toString" gälte sonst als
  // bekannte Einstellung.
  if (!Object.hasOwn(DEFAULTS, key)) return false;
  if (typeof DEFAULTS[key] === 'boolean') return typeof value === 'boolean';
  return ALLOWED[key]?.includes(value) ?? false;
}

/**
 * Liest gespeicherte Einstellungen. Der Speicher kann fehlen oder
 * gesperrt sein (privates Fenster) – dann gelten einfach die Vorgaben.
 */
function load() {
  let parsed;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Gespeicherte Einstellungen nicht lesbar, es gelten die Vorgaben.', error);
    return {};
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  // Jeder Eintrag wird einzeln geprüft. Ein ungültiger Wert kostet nur
  // diesen einen Eintrag, nicht alle Einstellungen.
  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => isValid(key, value)));
}

function save(values) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Ohne Speicher gelten die Einstellungen eben nur bis zum Neuladen.
  }
}

export class Settings {
  constructor(root = document.documentElement) {
    this.root = root;
    this.values = { ...DEFAULTS, ...load() };
    this.listeners = new Set();
    /** Welche Seite ich spiele – nötig, um "meine Farbe" zuzuordnen. */
    this.myColor = 'black';
    this.controls = [];
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (!isValid(key, value) || this.values[key] === value) return;
    this.values[key] = value;
    save(this.values);
    this.refresh();
    for (const listener of this.listeners) listener(key, value);
  }

  reset() {
    this.values = { ...DEFAULTS };
    save(this.values);
    this.refresh();
    for (const listener of this.listeners) listener('*', null);
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Wird bei Spielbeginn gesetzt: 'black' oder 'white'. */
  setPerspective(myColor) {
    this.myColor = myColor;
    this.apply();
  }

  /** Bindet alle Felder mit data-setting im angegebenen Bereich. */
  bind(scope = document) {
    for (const select of scope.querySelectorAll('select[data-options="stones"]')) {
      select.replaceChildren(...STONE_COLORS.map((color) => new Option(color.name, color.id)));
    }

    for (const control of scope.querySelectorAll('[data-setting]')) {
      const key = control.dataset.setting;
      if (!Object.hasOwn(DEFAULTS, key)) continue;
      this.controls.push(control);
      control.addEventListener('change', () => {
        if (control.type === 'checkbox') this.set(key, control.checked);
        else if (control.type !== 'radio' || control.checked) this.set(key, control.value);
      });
    }
    this.refresh();
  }

  refresh() {
    this.apply();
    this.sync();
  }

  /** Überträgt die Werte in alle gebundenen Felder. */
  sync() {
    for (const control of this.controls) {
      const value = this.values[control.dataset.setting];
      if (control.type === 'checkbox') control.checked = Boolean(value);
      else if (control.type === 'radio') control.checked = control.value === value;
      else control.value = value;
    }
  }

  /** Setzt data-Attribute und Steinfarben am Wurzelelement. */
  apply() {
    const { dataset, style } = this.root;
    const v = this.values;

    dataset.board = v.board;
    dataset.symbols = v.symbols ? 'on' : 'off';
    dataset.motion = v.reduceMotion ? 'reduced' : 'full';
    dataset.moveHints = v.moveHints;
    dataset.lastMove = v.lastMove ? 'on' : 'off';
    dataset.coords = v.coords ? 'on' : 'off';

    const sides = this.boardSides();
    const board = this.boardColor();
    const stones = resolveStones({
      mine: v.stoneMine,
      opponent: v.stoneOpponent,
      myColor: this.myColor,
      sides,
    });

    // null = Standardfarbe des Bretts. Dann bleibt die Variable leer und
    // das CSS fällt auf die Brettfarbe zurück.
    for (const [side, short] of [
      ['black', 'b'],
      ['white', 'w'],
    ]) {
      const hex = stones[side];
      const edge = hex ? edgeColorFor(hex, board, sides) : null;
      if (hex) {
        style.setProperty(`--user-stone-${short}`, hex);
        style.setProperty(`--user-mark-${short}`, markColorFor(hex));
      } else {
        style.removeProperty(`--user-stone-${short}`);
        style.removeProperty(`--user-mark-${short}`);
      }
      // Eigener Rand nur, wenn sich der Stein sonst kaum vom Brett abhebt.
      if (edge) style.setProperty(`--user-edge-${short}`, edge);
      else style.removeProperty(`--user-edge-${short}`);
    }

    this.updatePreview(stones, sides);
  }

  /**
   * Standardfarben der beiden Seiten auf dem gewählten Brett, gelesen aus
   * tokens.css. So stehen sie nur dort, und die Kontrastprüfung rechnet
   * mit den Farben des tatsächlich gewählten Bretts.
   */
  boardSides() {
    const style = getComputedStyle(this.root);
    const read = (name, fallback) => toHex(style.getPropertyValue(name)) ?? fallback;
    return { black: read('--c-ink', '#000000'), white: read('--c-bone', '#ffffff') };
  }

  /** Farbe der Spielfläche als Hex, aus tokens.css; null, wenn unbekannt. */
  boardColor() {
    return toHex(getComputedStyle(this.root).getPropertyValue('--c-felt'));
  }

  /** Vorschau und Warnhinweis im Einstellungsfenster. */
  updatePreview(stones, sides) {
    const theirs = otherSide(this.myColor);
    for (const node of document.querySelectorAll('[data-stone-preview="mine"]')) {
      node.dataset.side = this.myColor;
    }
    for (const node of document.querySelectorAll('[data-stone-preview="opponent"]')) {
      node.dataset.side = theirs;
    }

    const warning = document.getElementById('stone-warning');
    if (!warning) return;

    let message = '';
    if (stones.adjusted) {
      const fallback = stones[theirs] === sides.black ? 'Schwarz' : 'Weiß';
      message = `Beide Steine hätten dieselbe Farbe. Der Gegner wird deshalb in ${fallback} angezeigt.`;
    } else if (stones.ratio < WEAK_CONTRAST_RATIO && !this.values.symbols) {
      message =
        'Die beiden Farben unterscheiden sich kaum in der Helligkeit. ' +
        'Bei einer Farbsehschwäche sind sie schwer auseinanderzuhalten – ' +
        'schalte am besten die Symbole auf den Steinen ein.';
    }
    warning.textContent = message;
    warning.hidden = message === '';
  }
}
