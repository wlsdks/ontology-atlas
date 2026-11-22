import assert from 'node:assert/strict';
import test from 'node:test';

import { parseInitArgs } from './parse-args.mjs';

test('no arguments scaffold the default folder in English', () => {
  assert.deepEqual(parseInitArgs([]), { target: undefined, quickStart: false, locale: 'en', documents: false });
});

test('--help and -h win over every other argument', () => {
  assert.deepEqual(parseInitArgs(['--bogus', '--help']), { help: true });
  assert.deepEqual(parseInitArgs(['-h']), { help: true });
});

test('a folder, --quick-start and a locale in either spelling are read', () => {
  assert.deepEqual(parseInitArgs(['v', '--quick-start', '--locale', 'ko']), {
    target: 'v',
    quickStart: true,
    locale: 'ko',
    documents: false,
  });
  assert.equal(parseInitArgs(['--locale=ko']).locale, 'ko');
  assert.equal(parseInitArgs(['--documents']).documents, true);
});

test('--locale without a value, or followed by a flag, is an error', () => {
  assert.match(parseInitArgs(['--locale']).error, /--locale requires a value/);
  assert.match(parseInitArgs(['--locale', '--quick-start']).error, /--locale requires a value/);
});

test('an unknown flag and a second folder are errors', () => {
  assert.match(parseInitArgs(['--bogus']).error, /--bogus/);
  assert.equal(parseInitArgs(['a', 'b']).error, 'too many arguments: b');
});

test('a documents folder has no code to bootstrap from, so the two flags do not combine', () => {
  assert.match(parseInitArgs(['--documents', '--quick-start']).error, /do not combine/);
});
