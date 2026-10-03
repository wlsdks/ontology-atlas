import { describe, expect, it } from 'vitest';
import { underCollation } from '../../../../tests/helpers/under-collation';
import { captionNormal, captionWithinFlatBudget, placeRelationCaptions, relationCaptionText } from './relation-captions';

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
  it('moves a caption beside its line when the line midpoint is under a concept label', () => {
    const normal = captionNormal({ x: 100, y: 80 }, { x: 200, y: 80 });
    expect(normal).toEqual({ x: 0, y: -1 });
    const reversed = captionNormal({ x: 200, y: 80 }, { x: 100, y: 80 })!;
    expect([reversed.x + 0, reversed.y]).toEqual([0, -1]);
    const label = { minX: 140, maxX: 220, minY: 74, maxY: 86 };
    const safe = { left: 16, right: 284, top: 16, bottom: 180 };
    const under = { edgeId: 'depends', text: 'depends on', x: 150, y: 80, priority: 5 };
    expect(placeRelationCaptions([under], [label], safe, (text) => text.length * 6, 20)).toEqual([]);
    const [placed] = placeRelationCaptions([{ ...under, normal }], [label], safe, (text) => text.length * 6, 20);
    expect(placed).toMatchObject({ edgeId: 'depends', x: 150, y: 60, minY: 50, maxY: 70 });
    expect(placed).not.toHaveProperty('normal');
    expect(placeRelationCaptions([{ ...under, normal }], [label, { minX: 0, maxX: 300, minY: 40, maxY: 72 }, { minX: 0, maxX: 300, minY: 88, maxY: 120 }], safe, (text) => text.length * 6, 20)).toEqual([]);
  });
  it('gives a contested spot to the same caption whatever the machine locale', () => {
    const place = () => placeRelationCaptions([
      { edgeId: 'edge:결제', text: 'pays', x: 150, y: 80, priority: 1 },
      { edgeId: 'edge:auth', text: 'signs in', x: 150, y: 80, priority: 1 },
    ], [], { left: 16, right: 284, top: 16, bottom: 180 }, (text) => text.length * 6, 20).map((item) => item.edgeId);
    expect(underCollation('ko', place)).toEqual(underCollation('en', place));
  });
});

describe('the flat caption budget in a view that draws every concept', () => {
  const base = { attended: false, touchesFocus: false, spine: false, folded: false };
  it('at rest names the spine and nothing else', () => {
    expect(captionWithinFlatBudget({ ...base, spine: true })).toBe(true);
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
