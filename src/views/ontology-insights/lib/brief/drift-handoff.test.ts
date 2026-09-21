import { describe, expect, it } from 'vitest';
import { buildDriftHandoff } from './drift-handoff';

const rows = [
  { name: 'Payments', slug: 'capabilities/pay', path: 'src/pay.ts', at: '2026-09-12T00:00:00Z', docAt: '2026-09-10T00:00:00Z', href: '/topology/?p=pay' },
  { name: 'Shipping', slug: 'capabilities/ship', path: 'src/ship.ts', at: '2026-09-11T00:00:00Z', docAt: null, href: '/topology/?p=ship' },
];

describe('buildDriftHandoff', () => {
  it('names each concept with its file and both dates, and asks for judgement, not a write', () => {
    const request = buildDriftHandoff({ rows, locale: 'ko' })!;
    expect(request).toContain('Payments');
    expect(request).toContain('src/pay.ts');
    expect(request).toContain('2026-09-10T00:00:00Z');
    expect(request).toContain('기록 없음');
    expect(request).toContain('볼트를 직접 바꾸지 말고');
    expect(request).not.toMatch(/add_concept|patch_concept|add_relation/);
  });

  it('names how many it left out rather than sending an unbounded list', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ ...rows[0]!, name: `C${index}` }));
    const request = buildDriftHandoff({ rows: many, locale: 'en', limit: 3 })!;
    expect(request.match(/^- C\d/gm)).toHaveLength(3);
    expect(request).toContain('6 more concepts');
  });

  it('has nothing to ask when nothing drifted', () => {
    expect(buildDriftHandoff({ rows: [], locale: 'en' })).toBeNull();
  });
});

describe('the request names what the tools take', () => {
  it('carries each concept slug, because get_concept does not accept a display title', () => {
    /*
     * The request told the agent to read the recorded meaning with `get_concept` and then named
     * the concept only by its title, so the agent had to search for the document before it could
     * read anything (2026-09-20).
     */
    const request = buildDriftHandoff({ rows, locale: 'en' })!;
    expect(request).toContain('Payments (capabilities/pay)');
    expect(request).toContain('Shipping (capabilities/ship)');
    expect(request).toContain('get_concept with the slug');
  });

  it('says a concept owns no document instead of inventing a slug for it', () => {
    const request = buildDriftHandoff({
      rows: [{ ...rows[0]!, name: 'Loose name', slug: null }],
      locale: 'en',
    })!;
    expect(request).toContain('- Loose name —');
    expect(request).not.toContain('Loose name (');
    expect(request).toContain('owns no document');
  });

  it('keeps asking for judgement rather than a write', () => {
    const request = buildDriftHandoff({ rows, locale: 'en' })!;
    expect(request).not.toMatch(/add_concept|patch_concept|add_relation/);
    expect(request).toContain('Do not write to the vault');
  });
});

describe('the request says where an unknown goes', () => {
  /*
   * Asked only to "propose the sentence to change", an agent that cannot verify a claim proposes
   * striking it, and the vault then reads as if that boundary had been checked and found absent.
   * The vault has a place for the difference, and the MCP write door names that place as the
   * repair for an unstated unknown, so the request names it too.
   */
  it('routes what could not be checked into the Uncertainty line, not into a deletion', () => {
    const request = buildDriftHandoff({ rows, locale: 'en' })!;
    expect(request).toContain('`## Uncertainty` line');
    expect(request).toContain('do not propose deleting a claim');
  });

  it('asks for the file the judgement was read in, so it can be rechecked', () => {
    const request = buildDriftHandoff({ rows, locale: 'en' })!;
    expect(request).toContain('naming the exact file you read them in');
  });

  it('says the same in Korean, because the person reads this before sending it', () => {
    const request = buildDriftHandoff({ rows, locale: 'ko' })!;
    expect(request).toContain('`## Uncertainty` 줄');
    expect(request).toContain('주장을 지우지는 마');
    expect(request).toContain('어느 파일의 어느 줄에서 읽었는지');
  });
});
