import assert from 'node:assert/strict';
import test from 'node:test';

import {
  exactlyNamed,
  flagNamed,
  givesReason,
  namedInCode,
  namesWord,
  packageFolder,
  spokenForms,
} from './name-matching.mjs';

test('a word is named only as a whole word, not inside a longer word or path', () => {
  assert.equal(namesWord('Users list invoices', 'list'), true);
  assert.equal(namesWord('listing invoices', 'list'), false);
  assert.equal(namesWord('see src/list/index.ts', 'list'), false);
  assert.equal(namesWord('use ab here', 'ab'), false);
});

test('a name is also spoken in words: camelCase, kebab-case and a package scope', () => {
  assert.deepEqual(spokenForms('createLabels'), ['createLabels', 'create Labels']);
  assert.deepEqual(spokenForms('create-labels'), ['create-labels', 'create labels']);
  assert.deepEqual(spokenForms('@scope/pkg-name'), ['pkg-name', 'pkg name']);
});

test('a package entry file answers to its folder, a plain file does not', () => {
  assert.equal(packageFolder('src/billing/index.ts'), 'billing');
  assert.equal(packageFolder('pkg/__init__.py'), 'pkg');
  assert.equal(packageFolder('src/billing/invoice.ts'), null);
});

test('a flag is named in code form or as "the x flag", never by the bare word alone', () => {
  assert.equal(flagNamed('pass `--force` to skip', '--force'), true);
  assert.equal(flagNamed('the force flag skips it', '--force'), true);
  assert.equal(flagNamed('use force when needed', '--force'), false);
  assert.equal(flagNamed('a dry run lists only', '--dry-run'), true);
});

test('a code span names a row by its symbol, its cite or its flag', () => {
  const row = { kind: 'function', name: 'issueInvoice', symbol: 'issueInvoice', path: 'src/x.ts', evidence: 'src/x.ts:L10' };
  assert.equal(namedInCode('calls `issueInvoice` first', row), true);
  assert.equal(namedInCode('see src/x.ts:L10 for it', row), true);
  assert.equal(namedInCode('see src/x.ts:L100 for it', row), false);
  assert.equal(namedInCode('issueInvoice in prose only', row), false);
});

test('an exact name needs the same case and is ignored for a generic word', () => {
  assert.equal(exactlyNamed('the list command', { name: 'list' }), true);
  assert.equal(exactlyNamed('the List command', { name: 'list' }), false);
  assert.equal(exactlyNamed('the next command', { name: 'next' }), false);
});

test('an exclusion gives a reason only when words remain once the names are taken out', () => {
  const abilities = [{ name: 'log' }, { name: 'ssl' }];
  assert.equal(givesReason('Not modeled: log, ssl.', abilities), false);
  assert.equal(givesReason('log and ssl only tune the transport', abilities), true);
});
