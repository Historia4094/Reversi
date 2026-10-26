/**
 * Browser-Umgebung für Client-Tests unter Node (jsdom).
 *
 * Die Client-Module greifen auf document, window und getComputedStyle als
 * globale Namen zu, wie im Browser. setupDom() stellt sie bereit. Danach
 * erst die Module laden (await import(...)), weil sie beim Laden schon
 * auf diese Namen zugreifen können.
 */
import { JSDOM } from 'jsdom';

/**
 * @param {string} [body] HTML für <body>.
 * @param {{css?: string}} [options] css = Stylesheet im <head>.
 */
export function setupDom(body = '', { css = '' } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`,
    { url: 'http://localhost/', pretendToBeVisual: true },
  );
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  for (const name of ['HTMLElement', 'Event', 'KeyboardEvent', 'Option', 'Node']) {
    globalThis[name] = window[name];
  }
  return window;
}

/** jsdom kennt showModal() und close() an <dialog> nicht: einfache Nachbildung. */
export function fakeDialog(dialog) {
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new window.Event('close'));
  };
  Object.defineProperty(dialog, 'open', { get: () => dialog.hasAttribute('open') });
  return dialog;
}
