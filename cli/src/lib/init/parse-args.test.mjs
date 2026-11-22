import assert from 'node:assert/strict';
import test from 'node:test';

import { parseInitArgs } from './parse-args.mjs';

test('no arguments scaffold the default folder in English', () => {
  assert.deepEqual(parseInitArgs([]), { target: undefined, locale: 'en', documents: false });
});

test('--help and -h win over every other argument', () => {
  assert.deepEqual(parseInitArgs(['--bogus', '--help']), { help: true });
  assert.deepEqual(parseInitArgs(['-h']), { help: true });
});

test('a folder and a locale in either spelling are read', () => {
  assert.deepEqual(parseInitArgs(['v', '--locale', 'ko']), {
    target: 'v',
    locale: 'ko',
    documents: false,
  });
  assert.equal(parseInitArgs(['--locale=ko']).locale, 'ko');
  assert.equal(parseInitArgs(['--documents']).documents, true);
});

test('--locale without a value, or followed by a flag, is an error', () => {
  assert.match(parseInitArgs(['--locale']).error, /--locale requires a value/);
  assert.match(parseInitArgs(['--locale', '--documents']).error, /--locale requires a value/);
});

test('an unknown flag, the removed --quick-start, and a second folder are errors', () => {
  assert.match(parseInitArgs(['--bogus']).error, /--bogus/);
  assert.match(parseInitArgs(['--quick-start']).error, /--quick-start/);
  assert.equal(parseInitArgs(['a', 'b']).error, 'too many arguments: b');
});
