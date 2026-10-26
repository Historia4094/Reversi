/**
 * ESLint-Konfiguration (Flat Config).
 *
 * Grundlage sind die empfohlenen Regeln von ESLint. Getrennt wird nur
 * nach Umgebung: Code in public/ läuft im Browser, alles andere unter
 * Node. Formatierung (Einrückung, Anführungszeichen …) übernimmt
 * Prettier, deshalb stehen hier keine Stilregeln.
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Von /socket.io/socket.io.js als globale Funktion bereitgestellt.
        io: 'readonly',
      },
    },
  },
  {
    files: ['server/**/*.js', 'scripts/**/*.js', 'test/**/*.js', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Client-Tests laufen unter Node, bekommen aber über test/helpers/dom.js
    // (jsdom) die Browser-Namen document und window.
    files: ['test/**/*.js'],
    languageOptions: { globals: { document: 'readonly', window: 'readonly' } },
  },
  {
    rules: {
      // Häufige Fehlerquellen, die "recommended" nicht abdeckt.
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
