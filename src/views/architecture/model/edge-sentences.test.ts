import { describe, expect, it } from 'vitest';

import { placeEdgeSentences, type SentenceEdge } from './edge-sentences';

/* A seven-role chain at the shipped geometry: 180×82 boxes, 12px gap, chain runs down. */
const IDS = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
const BOX = { boxW: 180, boxH: 82, rowGap: 12, colGap: 52 };

function chainDown(leftGround: number) {
  const placed = new Map(IDS.map((id, i) => [id, { x: leftGround, y: 20 + i * (BOX.boxH + BOX.rowGap) }]));
  return placed;
}

function chainAcross() {
  return new Map(IDS.map((id, i) => [id, { x: 28 + i * (BOX.boxW + BOX.colGap), y: 80 }]));
}

const spine: SentenceEdge[] = IDS.slice(1).map((to, i) => ({
  from: IDS[i],
  to,
  kind: 'permitted',
  columnSpan: 1,
  violated: false,
}));

const sentence = (e: SentenceEdge) =>
  e.kind === 'permitted' ? `${e.from} may depend on ${e.to}` : `${e.from} reaches ${e.to} in ${e.count} imports`;

describe('placeEdgeSentences', () => {
  it('puts every adjacent sentence left of a downward chain, right-aligned, on its own gap', () => {
    const placed = chainDown(400);
    const out = placeEdgeSentences({
      axis: 'down', edges: spine, placed, ...BOX, swingOf: () => 0, leadRoom: 400, trailRoom: 300, sentenceOf: sentence,
    });
    expect(out).toHaveLength(6);
    for (const s of out) {
      expect(s.hidden).toBeUndefined();
      expect(s.anchor).toBe('end');
      expect(s.x).toBe(400 - 20);
      expect(s.rect!.x + s.rect!.width).toBeLessThanOrEqual(380);
    }
    /* One sentence per gap, no two sharing a baseline. */
    expect(new Set(out.map((s) => s.y)).size).toBe(6);
  });

  it('gives a skip its sentence beside its own arc, right of the column', () => {
    const placed = chainDown(400);
    const skip: SentenceEdge = { from: 'entities', to: 'widgets', kind: 'traffic', count: 2, columnSpan: 2, violated: true };
    /* The canvas measures a skip's swing from the box's centre line to the arc's apex, and the
       apex is always past the box's far side (SKIP_DROP + boxW / 2 at the shallowest). */
    const [s] = placeEdgeSentences({
      axis: 'down', edges: [skip], placed, ...BOX, swingOf: () => 30 + 90, leadRoom: 400, trailRoom: 300, sentenceOf: sentence,
    });
    expect(s.hidden).toBeUndefined();
    expect(s.anchor).toBe('start');
    expect(s.x).toBe(400 + 90 + 120 + 10);
  });

  it('alternates two tiers above an across chain so neighbours never touch', () => {
    const placed = chainAcross();
    const out = placeEdgeSentences({
      axis: 'across', edges: spine, placed, ...BOX, swingOf: () => 0, leadRoom: 60, trailRoom: 80, sentenceOf: sentence,
    });
    expect(out.every((s) => s.hidden === undefined)).toBe(true);
    const ys = out.map((s) => s.y);
    expect(new Set(ys).size).toBe(2);
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i].rect!, b = out[j].rect!;
        const apart = a.x + a.width + 4 <= b.x || b.x + b.width + 4 <= a.x || a.y + a.height + 4 <= b.y || b.y + b.height + 4 <= a.y;
        expect(apart, `${out[i].key} vs ${out[j].key}`).toBe(true);
      }
  });

  it('states a sentence it cannot fit instead of cropping it into the box', () => {
    const placed = chainDown(30);
    const out = placeEdgeSentences({
      axis: 'down', edges: spine, placed, ...BOX, swingOf: () => 0, leadRoom: 30, trailRoom: 300, sentenceOf: sentence,
    });
    expect(out.every((s) => s.hidden === 'no-room')).toBe(true);
    expect(out.every((s) => s.rect === undefined)).toBe(true);
  });

  it('ellipsizes to the room it has and never crosses a box', () => {
    const placed = chainDown(140);
    const out = placeEdgeSentences({
      axis: 'down', edges: spine, placed, ...BOX, swingOf: () => 0, leadRoom: 140, trailRoom: 300,
      sentenceOf: (e) => `${e.from} may depend on ${e.to} and this clause runs long`,
    });
    for (const s of out) {
      expect(s.hidden).toBeUndefined();
      expect(s.text.endsWith('…')).toBe(true);
      expect(s.rect!.x).toBeGreaterThanOrEqual(0);
      expect(s.rect!.x + s.rect!.width).toBeLessThanOrEqual(140 - 20);
    }
  });

  it('lets a rule win over traffic when two sentences would share one place', () => {
    const placed = chainDown(400);
    const rule: SentenceEdge = { from: 'views', to: 'widgets', kind: 'permitted', columnSpan: 1, violated: false };
    const traffic: SentenceEdge = { from: 'views', to: 'widgets', kind: 'traffic', count: 314, columnSpan: 1, violated: false };
    const out = placeEdgeSentences({
      axis: 'down', edges: [traffic, rule], placed, ...BOX, swingOf: () => 0, leadRoom: 400, trailRoom: 300, sentenceOf: sentence,
    });
    const drawn = out.filter((s) => s.hidden === undefined);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].text).toContain('may depend on');
    expect(out.find((s) => s.hidden === 'collision')?.text).toContain('314');
  });

  it('lets the focused role\'s skip sentence take a place a resting sentence held', () => {
    /* Measured on the seven-role profile, 2026-08-30: two violation sentences drawn at rest sat where
       the views → shared skip's sentence would go, so the profile's largest number (26,000 imports)
       never got a sentence even when Views was hovered. With focus, its strokes place first. */
    const placed = chainDown(400);
    const violated: SentenceEdge = { from: 'entities', to: 'views', kind: 'traffic', count: 1, columnSpan: 3, violated: true };
    const skip: SentenceEdge = { from: 'views', to: 'shared', kind: 'traffic', count: 26_000, columnSpan: 4, violated: false };
    const swing = () => 30 + 90;
    const atRest = placeEdgeSentences({ axis: 'down', edges: [violated, skip], placed, ...BOX, swingOf: swing, leadRoom: 400, trailRoom: 300, sentenceOf: sentence });
    const focused = placeEdgeSentences({ axis: 'down', edges: [violated, skip], placed, ...BOX, swingOf: swing, leadRoom: 400, trailRoom: 300, sentenceOf: sentence, focus: 'views' });
    const drawn = (out: ReturnType<typeof placeEdgeSentences>, key: string) => out.find((s) => s.key === key)?.hidden === undefined;
    /* Both sit on the same gap band; at rest the violation wins, with Views focused the skip wins. */
    expect(drawn(atRest, 'entities>views') || drawn(atRest, 'views>shared')).toBe(true);
    expect(drawn(focused, 'views>shared')).toBe(true);
  });
});
