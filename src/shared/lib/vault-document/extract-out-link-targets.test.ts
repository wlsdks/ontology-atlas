import { describe, expect, it } from 'vitest';
import { extractOutLinkTargets, extractOutLinksWithContext } from './parse-frontmatter';

/** A small deterministic generator (mulberry32), so a failing body can be reproduced from its seed. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FROM_SLUGS = ['README', 'notes/plan', 'wiki/quarter-plan', 'ontology/elements/canvas', 'a/b/c/deep', 'capabilities/checkout'];
const LINKS = [
  '[a](other.md)',
  '[a](./other.md)',
  '[up](../domains/x.md)',
  '[far](../../../../root.md)',
  '[anchor](notes/plan.md#part)',
  '[self](plan.md)',
  '[web](https://example.com/x.md)',
  '[web](HTTP://example.com/y.md)',
  '[only](#heading)',
  '[img](picture.png)',
  '![img](picture.md)',
  '[win](..\\domains\\x.md)',
  '[drive](C:\\vault\\notes\\a.md)',
  '[unc](\\\\server\\share\\b.md)',
  '[mixed](sub\\dir/c.md)',
  '[spaces](my note.md)',
  '[empty]()',
  '[[budget]]',
  '[[budget|the budget]]',
  '[[wiki/budget]]',
  '[[capabilities/checkout#flow]]',
  '[[ontology/project]]',
  '[[src:sources/plan.pdf#p2]]',
  '[[#only-anchor]]',
  '[[ notes\\win ]]',
  '[[README]]',
  '[[a]] [[a]]',
  '[[nested [[inner]] ]]',
  '[broken](unclosed.md',
  '[[unclosed',
];
const PROSE = ['plain words', '다음 문장', '\n\n## Heading\n', '\r\n- item ', '`code [x](y.md)`', ' · ', '\t'];

function body(next: () => number): string {
  const parts: string[] = [];
  const count = Math.floor(next() * 24);
  for (let at = 0; at < count; at += 1) {
    const pool = next() < 0.6 ? LINKS : PROSE;
    parts.push(pool[Math.floor(next() * pool.length)]);
  }
  return parts.join(next() < 0.5 ? ' ' : '');
}

describe('extractOutLinkTargets equals the link slugs of the passage extractor it replaces', () => {
  it('agrees on 1,000 generated bodies, Windows-style paths among them, in every folder', () => {
    const next = random(20261121);
    let withLinks = 0;
    for (let seed = 0; seed < 1000; seed += 1) {
      const text = body(next);
      const from = FROM_SLUGS[seed % FROM_SLUGS.length];
      const expected = extractOutLinksWithContext(text, from).slugs;
      if (expected.length > 0) withLinks += 1;
      expect(extractOutLinkTargets(text, from), `seed ${seed} from ${from}: ${text}`).toEqual(expected);
    }
    expect(withLinks, 'the generator must produce bodies that link').toBeGreaterThan(500);
  });
});
