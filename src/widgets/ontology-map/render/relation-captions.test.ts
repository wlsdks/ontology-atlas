import { describe, expect, it } from 'vitest';
import { captionWithinFlatBudget, placeRelationCaptions, relationCaptionText } from './relation-captions';

describe('map relation meaning captions', () => {
  it('preserves subject-to-target direction without inventing direction for association', () => {
    expect(relationCaptionText('depends on', { x: 0, y: 0 }, { x: 10, y: 0 }, true)).toBe('→ depends on');
    expect(relationCaptionText('depends on', { x: 10, y: 0 }, { x: 0, y: 0 }, true)).toBe('← depends on');
    expect(relationCaptionText('related to', { x: 10, y: 0 }, { x: 0, y: 0 }, false)).toBe('related to');
  });
  it('protects concept labels and bounds while giving the selected predicate priority', () => {
    const result = placeRelationCaptions([
      { edgeId: 'contains', text: 'contains', x: 150, y: 80, priority: 0 },
      { edgeId: 'depends', text: 'depends on', x: 150, y: 80, priority: 2 },
      { edgeId: 'occluded', text: 'contains', x: 80, y: 80, priority: 0 },
      { edgeId: 'offscreen', text: 'contains', x: 290, y: 80, priority: 0 },
    ], [{ minX: 60, maxX: 100, minY: 60, maxY: 100 }], { left: 16, right: 284, top: 16, bottom: 180 }, (text) => text.length * 6, 20);
    expect(result.map((item) => item.edgeId)).toEqual(['depends']);
  });
});

describe('the flat caption budget in a view that draws every concept', () => {
  const base = { attended: false, touchesFocus: false, spine: false, folded: false };
  it('at rest names the spine and nothing else', () => {
    expect(captionWithinFlatBudget({ ...base, spine: true })).toBe(true);
    // A capability's "contains" to its element: drawn in Strata, not on the flat overview.
    expect(captionWithinFlatBudget(base)).toBe(false);
  });
  it("names the focused concept's relations, except those the flat map folds behind a chip", () => {
    expect(captionWithinFlatBudget({ ...base, touchesFocus: true })).toBe(true);
    expect(captionWithinFlatBudget({ ...base, touchesFocus: true, folded: true })).toBe(false);
    expect(captionWithinFlatBudget({ ...base, spine: true, folded: true })).toBe(false);
  });
  it('always names the relation a person is reading', () => {
    expect(captionWithinFlatBudget({ ...base, attended: true, folded: true })).toBe(true);
  });
});
