import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { closestAllowedValue, formatUnknownFlagError } from './cli-args.mjs';

describe('unknown arguments name the closest allowed one', () => {
  it('suggests a near flag, ignoring a value after =', () => {
    assert.equal(formatUnknownFlagError('--locle=ko', ['--locale', '--documents']), 'unknown flag: --locle=ko. Did you mean --locale?');
  });

  it('suggests nothing when no flag is close', () => {
    assert.equal(formatUnknownFlagError('--zzzzzzzz', ['--locale']), 'unknown flag: --zzzzzzzz.');
  });

  it('suggests a near command and nothing for an unrelated word', () => {
    assert.equal(closestAllowedValue('int', ['init']), 'init');
    assert.equal(closestAllowedValue('validate', ['init']), null);
  });
});
