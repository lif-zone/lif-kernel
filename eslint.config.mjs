// Like jusers.js -> using JS as a DB language
import globals from 'globals';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import js from '@eslint/js';
import json from '@eslint/json';
export default [{
  plugins: {},
  languageOptions: {
    globals: {
      // import restricted from "confusing-browser-globals";
      // rules: {"no-restricted-globals": ["error", ...restricted]}
      ...globals.browser, // XXX: remove name, status, event, length...
      ...globals.node,
      ...globals.mocha,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
        // ts: true,
      },
    },
  },
  linterOptions: {
    reportUnusedDisableDirectives: false,
  },
  files: ['**/*.jsx', '**/*.js', '**/*.jsm', '**/*.tsx'],
  rules: {
    'no-debugger': 'warn',
    'no-cond-assign': 'off',
    'no-undef': 'error',
    'no-unused-vars': 'off',
    'no-constant-condition': 'off',
    'no-constant-binary-expression': 'off',
    'no-unreachable': 'off',
    'no-useless-escape': 'off',
    'no-empty': 'off',
    'no-ex-assign': 'off',
    'semi': ['error', 'always'],
  },
}, {
  plugins: {json},
  files: ['**/*.json'],
  language: 'json/json',
  rules: {
    "json/no-duplicate-keys": "error",
  },
}];
