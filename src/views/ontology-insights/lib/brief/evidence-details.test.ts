import { describe, expect, it } from 'vitest';
import { buildEvidenceDetails } from './evidence-details';
import { resolveEvidenceStates } from '@/shared/lib/evidence-states';
import { buildOntologyBrief } from './ontology-brief';
import type { EvidenceRow } from '@/shared/lib/evidence-states';

const titleById = new Map([['pay', 'Payment'], ['cart', 'Cart']]);

function row(partial: Partial<EvidenceRow> & Pick<EvidenceRow, 'id' | 'verdict'>): EvidenceRow {
  return { reason: null, slug: `capabilities/${partial.id}`, docChangedAt: '2026-09-01T00:00:00Z', moved: [], gone: [], folders: [], ...partial };
}

describe('buildEvidenceDetails', () => {
  it('names one concept per row and keeps its newest moved path', () => {
    const details = buildEvidenceDetails({
      rows: [
        row({
          id: 'pay',
          verdict: 'stale',
          moved: [
            { path: 'src/pay.ts', changedAt: '2026-09-05T00:00:00Z' },
            { path: 'src/pay-later.ts', changedAt: '2026-09-12T00:00:00Z' },
            { path: 'src/pay-refund.ts', changedAt: '2026-09-08T00:00:00Z' },
          ],
        }),
      ],
      titleById,
    });
    const moved = details.get('ontology-evidence-moved') ?? [];
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ name: 'Payment', path: 'src/pay-later.ts', at: '2026-09-12T00:00:00Z' });
  });

  it('counts a concept once, under the verdict its line counted', () => {
    // A concept can have a vanished path *and* a moved one. The line counts it as missing, so
    // it must not also appear under the moved line.
    const details = buildEvidenceDetails({
      rows: [
        row({
          id: 'pay',
          verdict: 'missing',
          gone: ['src/removed.ts'],
          moved: [{ path: 'src/pay.ts', changedAt: '2026-09-12T00:00:00Z' }],
        }),
      ],
      titleById,
    });
    expect(details.get('ontology-evidence-missing')).toHaveLength(1);
    expect(details.get('ontology-evidence-moved')).toHaveLength(0);
  });

  it('names only the folder-only concepts on the folder line', () => {
    const details = buildEvidenceDetails({
      rows: [
        row({ id: 'cart', verdict: 'unknown', reason: 'folder-only', folders: [{ path: 'src/widgets/cart', changedAt: '2026-09-15T00:00:00Z' }] }),
        row({ id: 'free', verdict: 'unknown', reason: 'path-not-walked' }),
      ],
      titleById,
    });
    expect(details.get('ontology-evidence-folder-only')?.map((detail) => detail.name)).toEqual(['Cart']);
  });

  it('discloses exactly as many rows as the lines counted', () => {
    /*
     * The invariant the split broke: the sentence counts concepts and the disclosure lists
     * them, so the two numbers are the same number. Run the real resolver so a change to either
     * side has to keep them equal.
     */
    const changes = new Map([
      ['capabilities/pay.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
      ['src/pay.ts', { exists: true, lastChangedAt: '2026-09-12T00:00:00Z' }],
      ['src/pay-api.ts', { exists: true, lastChangedAt: '2026-09-14T00:00:00Z' }],
      ['capabilities/cart.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
      ['src/cart.ts', { exists: false, lastChangedAt: null }],
      ['src/cart-view.ts', { exists: true, lastChangedAt: '2026-09-13T00:00:00Z' }],
    ]);
    const states = resolveEvidenceStates(
      [
        { id: 'pay', docPath: 'capabilities/pay.md', evidencePaths: ['src/pay.ts', 'src/pay-api.ts'] },
        { id: 'cart', docPath: 'capabilities/cart.md', evidencePaths: ['src/cart.ts', 'src/cart-view.ts'] },
      ],
      changes,
    );
    const details = buildEvidenceDetails({ rows: states.rows, titleById });
    // The line counts come from the real builder, so neither side can drift alone.
    const core = buildOntologyBrief({
      nodes: [
        { id: 'pay', kind: 'capability', title: 'Payment', docSlug: 'pay', createdBy: null },
        { id: 'cart', kind: 'capability', title: 'Cart', docSlug: 'cart', createdBy: null },
      ],
      docs: new Map([
        ['pay', { updatedAt: '2026-09-10T00:00:00Z', reviewedBy: 'owner' }],
        ['cart', { updatedAt: '2026-09-10T00:00:00Z', reviewedBy: 'owner' }],
      ]),
      evidence: states,
      repairCount: 0,
      unmatchedCount: 0,
      anchorMs: Date.parse('2026-09-01T00:00:00Z'),
    });
    const countOf = (id: string) => core.lines.find((line) => line.id === id)?.count ?? -1;
    for (const id of ['ontology-evidence-moved', 'ontology-evidence-missing', 'ontology-evidence-folder-only']) {
      expect(details.get(id) ?? [], `${id} discloses a different number of concepts than it counts`).toHaveLength(
        countOf(id),
      );
    }
    // Idling guard: a table where every line is zero would satisfy the loop above.
    expect(countOf('ontology-evidence-moved') + countOf('ontology-evidence-missing')).toBeGreaterThan(0);
  });
});
