import { describe, expect, it } from 'vitest';

import type { VaultHealthDoc } from './vault-health';
import { unassignedNodeSlugs, unmatchedGraphAsks } from './vault-health';

const doc = (slug: string, frontmatter: Record<string, unknown>): VaultHealthDoc => ({
  slug,
  frontmatter,
});

const VAULT: VaultHealthDoc[] = [
  doc('shop', { kind: 'project', contains: ['domains/payment', 'capabilities/refund'] }),
  doc('domains/payment', {
    kind: 'domain',
    capabilities: ['capabilities/invoice', 'capabilities/holds-position'],
  }),
  doc('capabilities/invoice', {
    kind: 'capability',
    domain: 'domains/payment',
    dependencies: ['capabilities/holds-position', 'capabilities/ledger'],
  }),
  doc('capabilities/refund', {
    kind: 'capability',
    domain: 'domains/payment',
    dependencies: ['capabilities/holds-position'],
  }),
];

describe('unmatchedGraphAsks — names an agent wrote that this vault has no node for', () => {
  it('groups one missing name across every node that asked for it', () => {
    const rows = unmatchedGraphAsks(VAULT);
    const holds = rows.find((row) => row.ref === 'capabilities/holds-position');
    expect(holds).toBeDefined();
    expect(holds!.count).toBe(3);
    expect(holds!.sources).toEqual([
      'capabilities/invoice',
      'capabilities/refund',
      'domains/payment',
    ]);
    // The frontmatter keys it was written under, so the row says what was meant by it.
    expect(holds!.relations).toEqual(['capabilities', 'dependencies']);
  });

  it('orders by how often it was asked for, then by name', () => {
    expect(unmatchedGraphAsks(VAULT).map((row) => row.ref)).toEqual([
      'capabilities/holds-position',
      'capabilities/ledger',
    ]);
  });

  it('says nothing about a vault whose references all resolve', () => {
    expect(
      unmatchedGraphAsks([
        doc('shop', { kind: 'project', contains: ['domains/payment'] }),
        doc('domains/payment', { kind: 'domain' }),
      ]),
    ).toEqual([]);
  });

  it('resolves through the same aliases the graph does — a tail name is not a missing node', () => {
    expect(
      unmatchedGraphAsks([
        doc('shop', { kind: 'project', contains: ['payment'] }),
        doc('domains/payment', { kind: 'domain' }),
      ]),
    ).toEqual([]);
  });

  it('leaves a source path alone — an element path is evidence, not a missing concept', () => {
    expect(
      unmatchedGraphAsks([
        doc('capabilities/invoice', { kind: 'capability', elements: ['src/billing/invoice.ts'] }),
      ]),
    ).toEqual([]);
  });

  it('ignores plain markdown with no kind, the same way the health check does', () => {
    expect(unmatchedGraphAsks([doc('notes', { contains: ['nowhere'] })])).toEqual([]);
  });
});

describe('unassignedNodeSlugs — a capability or element nothing placed', () => {
  it('names a capability with neither a resolved domain nor a containment parent', () => {
    expect(
      unassignedNodeSlugs([
        doc('shop', { kind: 'project', contains: ['domains/payment'] }),
        doc('domains/payment', { kind: 'domain' }),
        doc('capabilities/floating', { kind: 'capability' }),
        doc('capabilities/placed', { kind: 'capability', domain: 'domains/payment' }),
      ]),
    ).toEqual(['capabilities/floating']);
  });

  it('counts a containment parent as placement even without a domain field', () => {
    expect(
      unassignedNodeSlugs([
        doc('domains/payment', { kind: 'domain', capabilities: ['capabilities/held'] }),
        doc('capabilities/held', { kind: 'capability' }),
      ]),
    ).toEqual([]);
  });

  it('does not ask a domain or a project to be placed', () => {
    expect(
      unassignedNodeSlugs([
        doc('shop', { kind: 'project' }),
        doc('domains/loose', { kind: 'domain' }),
      ]),
    ).toEqual([]);
  });

  it('refuses a domain reference that does not resolve — an unplaced node is still unplaced', () => {
    expect(
      unassignedNodeSlugs([doc('capabilities/x', { kind: 'capability', domain: 'domains/gone' })]),
    ).toEqual(['capabilities/x']);
  });
});
