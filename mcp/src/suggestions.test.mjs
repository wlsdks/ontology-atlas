import { spawnSync } from 'node:child_process';
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

  // The shared did-you-mean path of relate, relation-check and MCP queries.
  it('suggests compiled slugs for tail typos, transpositions, and folder misses', () => {
    const slugs = ['capabilities/payment-flow', 'capabilities/auth-login', 'domains/billing'];
    assert.deepEqual(suggestCompiledSlugs('capabilities/payment-flwo', slugs), ['capabilities/payment-flow']);
    assert.deepEqual(suggestCompiledSlugs('pyament-flow', slugs), ['capabilities/payment-flow']);
    // Wrong folder, exact tail: the exact tail wins.
    assert.deepEqual(suggestCompiledSlugs('elements/payment-flow', slugs), ['capabilities/payment-flow']);
    assert.ok(suggestCompiledSlugs('billing', slugs).includes('domains/billing'));
    assert.deepEqual(suggestCompiledSlugs('zzzz-qqqq-xxxx', slugs), []);
    assert.deepEqual(suggestCompiledSlugs('', slugs), []);
    assert.deepEqual(suggestCompiledSlugs('x', []), []);
  });
});

it('retains the nearest allowed value decision even when another candidate has a wider threshold', () => {
  assert.equal(closestAllowedValue('a'.repeat(12), ['b' + 'a'.repeat(8), 'a'.repeat(12) + 'b'.repeat(5)]), null);
  assert.equal(closestAllowedValue('abc', ['abx', 'aby']), 'abx');
});

it('keeps typo-tier precedence, exact thresholds and unusual slice limits', () => {
  const slugs = ['elements/abcd', 'domains/abce', 'capabilities/abcde-more', 'documents/abc'];
  assert.deepEqual(suggestCompiledSlugs('abc', slugs), ['documents/abc', 'domains/abce', 'elements/abcd']);
  assert.deepEqual(suggestCompiledSlugs('abc', slugs, 0), []);
  assert.deepEqual(suggestCompiledSlugs('abc', slugs, -1), ['documents/abc', 'domains/abce', 'elements/abcd']);
  assert.deepEqual(suggestCompiledSlugs('abc', slugs, 1.5), ['documents/abc']);
  assert.equal(closestAllowedValue('abc', ['axy']), 'axy');
  assert.equal(closestAllowedValue('ab', ['abcd']), 'abcd');
  assert.equal(closestAllowedValue('abc', ['xyz']), null);
});

for (const method of ['suggestCompiledSlugs', 'closestAllowedValue']) {
  it(`${method} rejects a long impossible name without stalling`, () => {
    const moduleUrl = new URL('./suggestions.mjs', import.meta.url);
    const script = `import {${method} as suggest} from ${JSON.stringify(moduleUrl.href)}; const names = Array.from({length: 1000}, (_, i) => 'elements/long-document-name-' + i); process.stdout.write(JSON.stringify(suggest('z'.repeat(2_000_000), names)));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(child.error, undefined, `${method}: spawned suggestion must finish`);
    assert.equal(child.status, 0);
    assert.equal(child.stdout, method === 'suggestCompiledSlugs' ? '[]' : 'null');
  });
}
