import assert from 'node:assert/strict';
import test from 'node:test';

import { comparableBranch, usablePushBefore } from './plan-base.mjs';

const SHA = 'a'.repeat(40);

test('a push compares with its previous tip only when GitHub gave a real commit id', () => {
  assert.equal(usablePushBefore(SHA), SHA);
  assert.equal(usablePushBefore('0'.repeat(40)), null, 'a new branch has no previous tip');
  assert.equal(usablePushBefore(undefined), null);
  assert.equal(usablePushBefore(''), null);
  assert.equal(usablePushBefore('abc123'), null, 'a short id is not the exact tip');
  assert.equal(usablePushBefore(`${SHA}\n`), null);
  assert.equal(usablePushBefore('A'.repeat(40)), null, 'only lowercase hex is a commit id');
});

test('a manual run compares only with a plain branch name', () => {
  assert.equal(comparableBranch('main'), 'main');
  assert.equal(comparableBranch('feat/map-focus_2.1'), 'feat/map-focus_2.1');
  assert.equal(comparableBranch(''), null);
  assert.equal(comparableBranch('-rf'), null, 'a leading dash could read as an option');
  assert.equal(comparableBranch('a..b'), null, 'a range is not a branch');
  assert.equal(comparableBranch('main; rm -rf /'), null);
  assert.equal(comparableBranch('a'.repeat(201)), null);
  assert.equal(comparableBranch('a'.repeat(200)), 'a'.repeat(200));
});
