import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `pretendard-latin-subsets.ts` must carry, for every upstream dynamic subset that holds a
 * character of the Latin range, one face limited to exactly that intersection; together they
 * must cover every Latin-range character Pretendard has, or a Latin page would reach for the
 * whole font, and no face may reach outside the range, or it would draw a Hangul or kana glyph
 * the page expects from another family.
 */

const ROOT = process.cwd();
const LATIN = 'U+0000-024F, U+2010-2017, U+2019, U+2020-2025, U+2027-206F, U+2070-2BFF';
const UPSTREAM = path.join(ROOT, 'node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css');
const MODULE = path.join(ROOT, 'src/shared/config/pretendard-latin-subsets.ts');

type Range = [number, number];

function parseRanges(value: string): Range[] {
  return value.split(',').map((part) => {
    const [from, to] = part.trim().slice(2).split('-');
    return [parseInt(from!, 16), parseInt(to ?? from!, 16)];
  });
}

function intersect(a: Range[], b: Range[]): Range[] {
  return a.flatMap(([x1, y1]) => b.flatMap(([x2, y2]): Range[] => {
    const lo = Math.max(x1, x2);
    const hi = Math.min(y1, y2);
    return lo <= hi ? [[lo, hi]] : [];
  })).sort((p, q) => p[0] - q[0]);
}

function codepoints(ranges: Range[]): Set<number> {
  const out = new Set<number>();
  for (const [from, to] of ranges) for (let c = from; c <= to; c += 1) out.add(c);
  return out;
}

const upstream = [...readFileSync(UPSTREAM, 'utf8').matchAll(
  /src: url\(\.\/woff2-dynamic-subset\/(PretendardVariable\.subset\.\d+\.woff2)\)[^;]*;\s*unicode-range: ([^;]+);/g,
)].map(([, file, range]) => ({ file: file!, ranges: parseRanges(range!) }));

const declared = [...readFileSync(MODULE, 'utf8').matchAll(
  /woff2-dynamic-subset\/(PretendardVariable\.subset\.\d+\.woff2)'[\s\S]*?prop: 'unicode-range', value: '([^']+)'/g,
)].map(([, file, range]) => ({ file: file!, ranges: parseRanges(range!) }));

describe('Pretendard Latin subsets', () => {
  const latin = parseRanges(LATIN);

  it('probe: the upstream stylesheet and the module both parse', () => {
    expect(upstream.length).toBeGreaterThan(80);
    expect(declared.length).toBeGreaterThan(10);
  });

  it('declares one face per upstream subset that holds a Latin-range character, limited to it', () => {
    const expected = upstream
      .map(({ file, ranges }) => ({ file, ranges: intersect(ranges, latin) }))
      .filter(({ ranges }) => ranges.length > 0)
      .sort((a, b) => a.file.localeCompare(b.file));
    const actual = [...declared].sort((a, b) => a.file.localeCompare(b.file));
    expect(actual.map((face) => face.file)).toEqual(expected.map((face) => face.file));
    for (const [index, face] of actual.entries()) {
      expect([...codepoints(face.ranges)].sort(), face.file).toEqual([...codepoints(expected[index]!.ranges)].sort());
    }
  });

  it('the faces cover every Latin-range character Pretendard has and nothing outside the range', () => {
    const latinPoints = codepoints(latin);
    const fontPoints = codepoints(upstream.flatMap(({ ranges }) => ranges));
    const covered = codepoints(declared.flatMap(({ ranges }) => ranges));
    expect([...covered].filter((c) => !latinPoints.has(c))).toEqual([]);
    expect([...fontPoints].filter((c) => latinPoints.has(c) && !covered.has(c))).toEqual([]);
  });
});
