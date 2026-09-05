import { describe, expect, it } from 'vitest';

import type { VaultHealthDoc } from './vault-health';
import { computeVaultHealth, unmatchedGraphAsks } from './vault-health';

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

describe('unmatchedGraphAsks — the same walk the health count already made', () => {
  /*
   * ⚠️ Two readings of one fact. `computeVaultHealth` counts unresolved references and
   * keeps a number; this keeps the names behind it. If they ever disagree, one of the two
   * screens is lying about the same folder — so the identity is asserted, not assumed.
   */
  it('accounts for every unresolved edge the health summary counted', () => {
    const total = unmatchedGraphAsks(VAULT).reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(computeVaultHealth(VAULT).summary.unresolvedEdges);
    expect(total).toBeGreaterThan(0);
  });

  it('returns one row per distinct name, not one per reference', () => {
    const rows = unmatchedGraphAsks(VAULT);
    expect(rows).toHaveLength(new Set(rows.map((row) => row.ref)).size);
    // Four references, two names — the grouping is what makes the count readable.
    expect(rows).toHaveLength(2);
  });

  it('never names something this folder actually holds', () => {
    const held = new Set(VAULT.map((doc) => doc.slug));
    for (const row of unmatchedGraphAsks(VAULT)) {
      expect(held.has(row.ref)).toBe(false);
    }
  });
});
