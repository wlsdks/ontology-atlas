import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from './parse-args.mjs';

test('no arguments means the current folder as vault, text output and no failure policy', () => {
  assert.deepEqual(parseArgs([]), { vault: '.', json: false, strict: false, listCodes: false, failOn: null });
});

test('--help and -h win over every other argument', () => {
  assert.deepEqual(parseArgs(['--bogus', '--help']), { help: true });
  assert.deepEqual(parseArgs(['-h']), { help: true });
});

test('flags and one positional vault are read in either spelling', () => {
  const parsed = parseArgs(['/v', '--json', '--strict', '--fail-on=a,b']);
  assert.equal(parsed.vault, '/v');
  assert.equal(parsed.json, true);
  assert.equal(parsed.strict, true);
  assert.deepEqual(parsed.failOn, ['a', 'b']);
  assert.equal(parseArgs(['--vault=/w']).vault, '/w');
  assert.equal(parseArgs(['--list-codes']).listCodes, true);
});

test('an unknown flag, or a vault given twice, is an error', () => {
  assert.match(parseArgs(['--nope']).error, /--nope/);
  assert.ok(parseArgs(['/a', '--vault', '/b']).error);
});
