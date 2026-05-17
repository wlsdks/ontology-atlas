import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  closestAllowedFlag,
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseBoundedPositiveIntegerFlag,
  parseNonNegativeIntegerFlag,
  parsePositiveIntegerFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
  resolveSingleRootPathArg,
  resolveTrailingVaultArg,
} from './cli-args.mjs';

const errorMessage = (value) => {
  assert.ok(value instanceof Error);
  return value.message;
};

describe('cli integer argument parsers', () => {
  it('parses positive integers without accepting zero, decimals, or unsafe values', () => {
    assert.equal(parsePositiveIntegerFlag('--limit', '1'), 1);
    assert.equal(parsePositiveIntegerFlag('--limit', '500'), 500);
    assert.equal(errorMessage(parsePositiveIntegerFlag('--limit', undefined)), '--limit requires a value');
    assert.equal(errorMessage(parsePositiveIntegerFlag('--limit', '--json')), '--limit requires a value');
    assert.equal(errorMessage(parsePositiveIntegerFlag('--limit', '0')), '--limit must be a positive integer');
    assert.equal(errorMessage(parsePositiveIntegerFlag('--limit', '1.5')), '--limit must be a positive integer');
    assert.equal(errorMessage(parsePositiveIntegerFlag('--limit', '9007199254740992')), '--limit must be a positive integer');
  });

  it('parses non-negative integers and preserves zero as a valid value', () => {
    assert.equal(parseNonNegativeIntegerFlag('--depth', '0'), 0);
    assert.equal(parseNonNegativeIntegerFlag('--depth', '20'), 20);
    assert.equal(errorMessage(parseNonNegativeIntegerFlag('--depth', undefined)), '--depth requires a value');
    assert.equal(errorMessage(parseNonNegativeIntegerFlag('--depth', '--json')), '--depth requires a value');
    assert.equal(errorMessage(parseNonNegativeIntegerFlag('--depth', '-1')), '--depth must be a non-negative integer');
    assert.equal(errorMessage(parseNonNegativeIntegerFlag('--depth', '2x')), '--depth must be a non-negative integer');
  });

  it('caps bounded positive integers with the same user-facing flag name', () => {
    assert.equal(parseBoundedPositiveIntegerFlag('--limit', '500', { max: 500 }), 500);
    assert.equal(errorMessage(parseBoundedPositiveIntegerFlag('--limit', '501', { max: 500 })), '--limit must be <= 500');
    assert.equal(errorMessage(parseBoundedPositiveIntegerFlag('--limit', '0', { max: 500 })), '--limit must be a positive integer');
  });

  it('caps bounded non-negative integers while allowing zero', () => {
    assert.equal(parseBoundedNonNegativeIntegerFlag('--max-hops', '0', { max: 20 }), 0);
    assert.equal(parseBoundedNonNegativeIntegerFlag('--max-hops', '20', { max: 20 }), 20);
    assert.equal(errorMessage(parseBoundedNonNegativeIntegerFlag('--max-hops', '21', { max: 20 })), '--max-hops must be <= 20');
    assert.equal(errorMessage(parseBoundedNonNegativeIntegerFlag('--max-hops', '2x', { max: 20 })), '--max-hops must be a non-negative integer');
  });

  it('suggests the closest known flag for recoverable typos', () => {
    assert.equal(closestAllowedFlag('--lmit', ['--json', '--limit', '--vault']), '--limit');
    assert.equal(closestAllowedFlag('--lmit=1', ['--json', '--limit', '--vault']), '--limit');
    assert.equal(closestAllowedFlag('--zzzz', ['--json', '--limit', '--vault']), null);
    assert.equal(
      formatUnknownFlagError('--lmit', ['--json', '--limit', '--vault']),
      'unknown flag: --lmit. Did you mean --limit?',
    );
    assert.equal(
      formatUnknownFlagError('--lmit=1', ['--json', '--limit', '--vault']),
      'unknown flag: --lmit=1. Did you mean --limit?',
    );
    assert.equal(formatUnknownFlagError('--zzzz', ['--json', '--limit', '--vault']), 'unknown flag: --zzzz.');
  });
});

describe('cli vault and positional argument parsers', () => {
  it('normalizes --vault values without accepting empty paths or the next flag', () => {
    assert.equal(parseVaultFlag(' docs/ontology '), 'docs/ontology');
    assert.equal(parseVaultFlag(''), false);
    assert.equal(parseVaultFlag(undefined), false);
    assert.equal(parseVaultFlag('--timeout-ms'), false);
  });

  it('rejects ambiguous vault sources and extra positional arguments', () => {
    assert.deepEqual(
      resolveExclusiveVaultArg({ vault: false, positional: [] }),
      { error: '--vault requires a path' },
    );
    assert.deepEqual(
      resolveExclusiveVaultArg({ vault: 'docs/ontology', positional: ['other'] }),
      { error: 'pass vault as either positional argument or --vault, not both' },
    );
    assert.deepEqual(
      resolveExclusiveVaultArg({ vault: null, positional: ['one', 'two'] }),
      { error: 'too many arguments: two' },
    );
    assert.deepEqual(
      resolveExclusiveVaultArg({ vault: null, positional: [] }),
      { vault: '.' },
    );
    assert.deepEqual(
      resolveExclusiveVaultArg({ vault: null, positional: ['docs/ontology'] }),
      { vault: 'docs/ontology' },
    );
  });

  it('resolves trailing vault arguments for commands with leading root paths', () => {
    assert.deepEqual(
      resolveTrailingVaultArg({ vault: null, positional: ['src'], vaultIndex: 1 }),
      { vault: '.' },
    );
    assert.deepEqual(
      resolveTrailingVaultArg({ vault: null, positional: ['src', 'docs/ontology'], vaultIndex: 1 }),
      { vault: 'docs/ontology' },
    );
    assert.deepEqual(
      resolveTrailingVaultArg({ vault: 'docs/ontology', positional: ['src'], vaultIndex: 1 }),
      { vault: 'docs/ontology' },
    );
    assert.deepEqual(
      resolveTrailingVaultArg({ vault: 'docs/ontology', positional: ['src', 'other'], vaultIndex: 1 }),
      { error: 'pass vault as either positional argument or --vault, not both' },
    );
    assert.deepEqual(
      resolveTrailingVaultArg({ vault: null, positional: ['src', 'one', 'two'], vaultIndex: 1 }),
      { error: 'too many arguments: two' },
    );
  });

  it('keeps single root and required flag value parsing fail-closed', () => {
    assert.deepEqual(resolveSingleRootPathArg({ positional: [] }), { rootPath: '.' });
    assert.deepEqual(resolveSingleRootPathArg({ positional: ['src'] }), { rootPath: 'src' });
    assert.deepEqual(
      resolveSingleRootPathArg({ positional: ['src', 'extra'] }),
      { error: 'too many arguments: extra' },
    );
    assert.equal(parseRequiredFlagValue('--from', ' node '), 'node');
    assert.equal(errorMessage(parseRequiredFlagValue('--from', '')), '--from requires a value');
    assert.equal(errorMessage(parseRequiredFlagValue('--from', '--to')), '--from requires a value');
  });
});
