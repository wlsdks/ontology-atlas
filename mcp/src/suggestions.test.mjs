import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  closestAllowedValue,
  formatAllowedValueError,
  formatErrorValue,
  suggestCompiledSlugs,
} from './suggestions.mjs';

describe('suggestions', () => {
  it('suggests close allowed values but avoids weak matches', () => {
    assert.equal(closestAllowedValue('overveiw', ['overview', 'health']), 'overview');
    assert.equal(closestAllowedValue('incomng', ['incoming', 'outgoing', 'both']), 'incoming');
    assert.equal(closestAllowedValue('xyz', ['overview', 'health']), null);
    assert.equal(closestAllowedValue('limit', []), null);
  });

  it('formats allowed-value errors with received values and close hints', () => {
    assert.equal(
      formatAllowedValueError('operation', 'overveiw', ['overview', 'health']),
      'operation must be one of: overview, health. Received: "overveiw". Did you mean "overview"?',
    );
    assert.equal(
      formatAllowedValueError('operation', 1, ['overview', 'health']),
      'operation must be one of: overview, health. Received: number.',
    );
  });

  it('formats values without leaking object internals into short errors', () => {
    assert.equal(formatErrorValue('x'), '"x"');
    assert.equal(formatErrorValue(null), 'null');
    assert.equal(formatErrorValue(['x']), 'array');
    assert.equal(formatErrorValue({ value: 'x' }), 'object');
  });

  // did-you-mean for an unresolved slug — the shared error path of relate, relation-check, and MCP queries.
  it('suggests compiled slugs for tail typos, transpositions, and folder misses', () => {
    const slugs = ['capabilities/payment-flow', 'capabilities/auth-login', 'domains/billing'];
    // Ordinary typo (flwo)
    assert.deepEqual(suggestCompiledSlugs('capabilities/payment-flwo', slugs), ['capabilities/payment-flow']);
    // Transposition typo, and no folder
    assert.deepEqual(suggestCompiledSlugs('pyament-flow', slugs), ['capabilities/payment-flow']);
    // Wrong folder, exact tail → the exact tail wins
    assert.deepEqual(suggestCompiledSlugs('elements/payment-flow', slugs), ['capabilities/payment-flow']);
    // Partial input, substring
    assert.ok(suggestCompiledSlugs('billing', slugs).includes('domains/billing'));
    // Nothing related at all → no suggestion
    assert.deepEqual(suggestCompiledSlugs('zzzz-qqqq-xxxx', slugs), []);
    assert.deepEqual(suggestCompiledSlugs('', slugs), []);
    assert.deepEqual(suggestCompiledSlugs('x', []), []);
  });
});
