import { describe, expect, it } from 'vitest';

import { LABEL_PAD, LabelField, fontOf, makeLabel } from './film-map-labels';

const measure = (text: string) => text.length * 10;
const segments = [{ text: 'hello', ink: 'strong' as const }];

describe('label boxes', () => {
  it('writes the font as weight, size and family', () => {
    expect(fontOf(650, 22, 'sans')).toBe('650 22px sans');
  });

  it('anchors the box by alignment around the text middle, 0.62 of the size either side', () => {
    const left = makeLabel(measure, 'k', null, 'cap', segments, 'f', 20, 100, 50, 'left');
    const center = makeLabel(measure, 'k', null, 'cap', segments, 'f', 20, 100, 50, 'center');
    const right = makeLabel(measure, 'k', null, 'cap', segments, 'f', 20, 100, 50, 'right');
    expect(left.box).toEqual({ l: 100, t: 37.6, r: 150, b: 62.4 });
    expect(center.box.l).toBe(75);
    expect(right.box.r).toBe(100);
  });

  it('adds the widths of every segment', () => {
    const label = makeLabel(measure, 'k', null, 'reach', [...segments, { text: 'ab', ink: 'reach' }], 'f', 10, 0, 0, 'left');
    expect(label.box.r).toBe(70);
  });
});

describe('free space for names', () => {
  const bounds = { l: 0, t: 0, r: 200, b: 100 };
  const empty = () => new LabelField(bounds, [{ l: 150, t: 0, r: 200, b: 30 }]);

  it('refuses a box that, with its padding, leaves the bounds', () => {
    expect(empty().free({ l: LABEL_PAD, t: 40, r: 50, b: 60 })).toBe(true);
    expect(empty().free({ l: LABEL_PAD - 1, t: 40, r: 50, b: 60 })).toBe(false);
  });

  it('refuses a forbidden rectangle, a taken box, a mark and a sample point', () => {
    const forbidden = empty();
    expect(forbidden.free({ l: 120, t: 10, r: 148, b: 20 })).toBe(false);

    const taken = empty();
    taken.take({ l: 20, t: 40, r: 60, b: 60 });
    expect(taken.free({ l: 62, t: 40, r: 90, b: 60 })).toBe(false);
    expect(taken.free({ l: 80, t: 40, r: 110, b: 60 })).toBe(true);

    const marked = empty();
    marked.marks.push({ x: 40, y: 50, r: 6 });
    expect(marked.free({ l: 44, t: 45, r: 80, b: 55 })).toBe(false);

    const sampled = empty();
    sampled.samples = [{ x: 60, y: 50 }];
    expect(sampled.free({ l: 40, t: 40, r: 80, b: 60 })).toBe(false);
  });
});
