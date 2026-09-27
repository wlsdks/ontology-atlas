import { describe, expect, it } from 'vitest';

import { computeVaultHealth, type VaultHealthDoc } from './vault-health';

function mutuallyDependent(size: number): VaultHealthDoc[] {
  const slugs = Array.from({ length: size }, (_, i) => `capabilities/c${String(i).padStart(2, '0')}`);
  return slugs.map((slug) => ({
    slug,
    frontmatter: { kind: 'capability', title: slug, depends_on: slugs.filter((other) => other !== slug) },
  }));
}

describe('computeVaultHealth dependency cycles', () => {
  it('counts every cycle of seven mutually dependent capabilities exactly once', () => {
    const { summary } = computeVaultHealth(mutuallyDependent(7));
    expect(summary.dependencyCycles).toBe(2365);
    expect(summary.dependencyCyclesPartial).toBe(false);
  });

  it('counts one cycle when two references name the same dependency', () => {
    const { summary } = computeVaultHealth([
      { slug: 'capabilities/pay', frontmatter: { kind: 'capability', title: 'Pay', depends_on: ['capabilities/refund', 'refund'] } },
      { slug: 'capabilities/refund', frontmatter: { kind: 'capability', title: 'Refund', dependencies: ['capabilities/pay'] } },
    ]);
    expect(summary.dependencyCycles).toBe(1);
  });

  it('counts a capability that depends on itself as one cycle, however often it names itself', () => {
    const { status, checks, summary } = computeVaultHealth([
      { slug: 'domains/core', frontmatter: { kind: 'domain', title: 'Core', capabilities: ['capabilities/loop'] } },
      {
        slug: 'capabilities/loop',
        frontmatter: { kind: 'capability', title: 'Loop', domain: 'domains/core', depends_on: ['capabilities/loop', 'loop'] },
      },
    ]);
    expect(checks.find((check) => check.id === 'dependency_cycles')).toEqual({ id: 'dependency_cycles', status: 'fail', count: 1 });
    expect(summary.dependencyCycles).toBe(1);
    expect(status).toBe('needs_attention');
  });

  it('marks the count as a floor when eleven mutually dependent capabilities exhaust the step budget', () => {
    const { summary, checks } = computeVaultHealth(mutuallyDependent(11));
    expect(summary.dependencyCyclesPartial).toBe(true);
    expect(checks.find((check) => check.id === 'dependency_cycles')?.status).toBe('fail');
  });
});
