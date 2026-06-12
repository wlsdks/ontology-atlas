import { describe, expect, it } from 'vitest';
import { applyRelationEdgeSemantics } from './reducer-relation-edge';
import type { SigmaEdgeAttrs } from './graph-build';

function edge(overrides: Partial<SigmaEdgeAttrs> = {}): SigmaEdgeAttrs {
  return {
    size: 0.5,
    color: 'rgba(255, 255, 255, 0.08)',
    kind: 'depends-on',
    relationType: 'depends_on',
    ...overrides,
  };
}

describe('applyRelationEdgeSemantics — relation quality rendering', () => {
  it('contains hierarchy edges stay neutral because skeleton/containment owns hierarchy ink', () => {
    const attrs = edge({ kind: 'contains', relationQuality: 'strong' });
    expect(applyRelationEdgeSemantics(attrs, { cameraRatio: 1 })).toBe(attrs);
  });

  it('strong source-backed relations receive the highest semantic weight', () => {
    const out = applyRelationEdgeSemantics(
      edge({ relationQuality: 'strong', evidenceCount: 2 }),
      { cameraRatio: 1 },
    );
    expect(out.color).toBe('rgba(139, 151, 255, 0.28)');
    expect(out.size).toBeCloseTo(1.17);
    expect(out.zIndex).toBe(2);
  });

  it('weak associative relations stay visually quieter than strong relations', () => {
    const strong = applyRelationEdgeSemantics(edge({ relationQuality: 'strong' }), {
      cameraRatio: 1,
    });
    const weak = applyRelationEdgeSemantics(edge({ relationQuality: 'weak' }), {
      cameraRatio: 1,
    });
    expect(weak.color).toBe('rgba(217, 161, 65, 0.16)');
    expect(weak.size).toBeLessThan(strong.size);
    expect(weak.zIndex).toBeLessThan(strong.zIndex ?? 0);
  });

  it('review relations keep a warning hue without gaining evidence boost', () => {
    const out = applyRelationEdgeSemantics(edge({ relationQuality: 'review' }), {
      cameraRatio: 1,
    });
    expect(out.color).toBe('rgba(226, 105, 105, 0.16)');
    expect(out.size).toBeCloseTo(0.58);
  });

  it('zoomed-out overview fades semantic edges without hiding them outright', () => {
    const out = applyRelationEdgeSemantics(
      edge({ relationQuality: 'strong', evidenceCount: 1 }),
      { cameraRatio: 2.2 },
    );
    expect(out.size).toBeGreaterThan(0.35);
    expect(out.size).toBeLessThan(1.17);
  });
});
