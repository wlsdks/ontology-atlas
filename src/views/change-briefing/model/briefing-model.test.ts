import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { briefingRange, groupBriefing, groupSourceAreas, localDate, movePeriod } from './briefing-model';

describe('calendar source briefing', () => {
  it('uses Monday weeks, leap months and year boundaries', () => {
    expect(briefingRange('week', '2026-01-01')).toMatchObject({ start: '2025-12-29', end: '2026-01-04' });
    expect(briefingRange('month', '2024-02-20')).toMatchObject({ start: '2024-02-01', end: '2024-02-29' });
    expect(briefingRange('year', '2024-02-29')).toMatchObject({ start: '2024-01-01', end: '2024-12-31' });
    expect(movePeriod('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(movePeriod('year', '2024-02-29', 1)).toBe('2025-01-01');
    expect(movePeriod('week', '2026-01-01', -1)).toBe('2025-12-25');
  });
  it('includes the entire final local day and excludes the following midnight', () => {
    for (const day of ['2026-03-08', '2026-11-01', '2026-12-31']) {
      const range = briefingRange('custom', day, day, day)!;
      const next = new Date(`${day}T00:00:00`); next.setDate(next.getDate() + 1);
      expect(range.startEpoch).toBe(new Date(`${day}T00:00:00`).getTime() / 1000);
      expect(range.endEpoch).toBe(next.getTime() / 1000);
      expect(localDate(new Date(range.endEpoch * 1000 - 1))).toBe(day);
    }
  });
  it('uses twenty-three and twenty-five hour local days across daylight saving changes', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const spring = briefingRange('custom', '2026-03-08', '2026-03-08', '2026-03-08')!;
      const autumn = briefingRange('custom', '2026-11-01', '2026-11-01', '2026-11-01')!;
      expect(spring.startEpoch).toBe(Date.UTC(2026, 2, 8, 5) / 1000);
      expect(spring.endEpoch - spring.startEpoch).toBe(23 * 3600);
      expect(autumn.startEpoch).toBe(Date.UTC(2026, 10, 1, 4) / 1000);
      expect(autumn.endEpoch - autumn.startEpoch).toBe(25 * 3600);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
  it.each([['2026-02-29', '2026-03-01'], ['2026-04-31', '2026-05-01'], ['', '2026-01-01'], ['2026-04-10', '2026-04-01']])('refuses invalid or reversed dates %s to %s', (from, to) => {
    expect(briefingRange('custom', from, from, to)).toBeNull();
  });
});

function doc(slug: string, kind: string, path?: string, elements?: string[]): VaultDoc {
  return { slug, title: slug, frontmatter: { kind, path, elements, display_ko: '검색' } } as unknown as VaultDoc;
}
describe('capability evidence grouping', () => {
  const docs = [doc('capabilities/search', 'capability', 'src/search.ts', ['elements/query']), doc('capabilities/browse', 'capability', 'src/shared'), doc('elements/query', 'element', 'src/shared/query.ts')];
  it('preserves multiple memberships, deleted paths, Hangul and unmapped files without additive totals', () => {
    const commits = [{ hash: 'one', subject: 'claim: everything is safe', paths: ['src/search.ts', 'src/shared/query.ts', 'src/sharedly/no.ts', '한글/삭제.ts'] }, { hash: 'two', subject: 'revert', paths: ['src/shared/query.ts'] }];
    const result = groupBriefing(commits, docs, 'ko');
    expect(result).toMatchObject({ files: 4, mapped: 2, unmapped: 2 });
    expect(result.groups.find(group => group.id === 'capabilities/search')).toMatchObject({ title: '검색', paths: ['src/search.ts', 'src/shared/query.ts'] });
    expect(result.groups.find(group => group.id === 'capabilities/browse')?.commits).toHaveLength(2);
    expect(result.groups.find(group => group.id === 'unmapped')?.paths).toEqual(['src/sharedly/no.ts', '한글/삭제.ts']);
    expect(result.groups[0].commits[0].subject).toBe(commits[0].subject);
  });
  it('keeps all evidence when no anchors exist, including duplicate paths', () => {
    expect(groupBriefing([], docs, 'en').files).toBe(0);
    const result = groupBriefing([{ hash: 'x', subject: '', paths: ['gone.ts', 'gone.ts'] }], [], 'en');
    expect(result.groups).toMatchObject([{ id: 'unmapped', paths: ['gone.ts'] }]);
  });
  it('keeps a commit with no changed paths inspectable', () => {
    const result = groupBriefing([{ hash: 'empty', subject: 'empty integration commit', paths: [] }], docs, 'en');
    expect(result.groups).toMatchObject([{ id: 'unmapped', commits: [{ hash: 'empty' }] }]);
  });
  it('maps only capabilities contained by the selected project', () => {
    const scopeDocs = [doc('one', 'project'), doc('two', 'project'), doc('capabilities/one', 'capability', 'shared.ts'), doc('capabilities/two', 'capability', 'shared.ts')];
    scopeDocs[0].frontmatter.domains = ['domains/one']; scopeDocs[1].frontmatter.domains = ['domains/two'];
    scopeDocs[2].frontmatter.domain = 'domains/one'; scopeDocs[3].frontmatter.domain = 'domains/two';
    const result = groupBriefing([{ hash: 'x', subject: 'change', paths: ['shared.ts'] }], scopeDocs, 'en', 'one');
    expect(result.groups.map(group => group.id)).toEqual(['capabilities/one']);
    scopeDocs[0].frontmatter.domains = []; scopeDocs[0].frontmatter.contains = ['domains/one'];
    scopeDocs.push(doc('domains/one', 'domain'));
    expect(groupBriefing([{ hash: 'x', subject: 'change', paths: ['shared.ts'] }], scopeDocs, 'en', 'one').groups.map(group => group.id)).toEqual(['capabilities/one']);
  });
  it('partitions unmapped paths into literal source areas without losing evidence', () => {
    const paths = ['README.md', '한글.md', 'src/widgets/map/draw.ts', 'src/widgets/map/input.ts', 'src/short.ts', 'mcp/src/tools/read.mjs', '한글/경로.ts'];
    const commits = [{ hash: 'a', subject: 'unverified', paths }];
    const areas = groupSourceAreas({ id: 'unmapped', title: '', paths, commits });
    expect(areas.flatMap(area => area.paths).sort()).toEqual([...paths].sort());
    expect(areas.find(area => area.id === 'src/widgets/map')?.paths).toHaveLength(2);
    expect(areas.find(area => area.id === '.')?.paths).toEqual(['README.md', '한글.md']);
    expect(areas.every(area => area.commits.length === 1)).toBe(true);
  });
  it('groups a two-thousand-commit read without counting a shared file repeatedly', () => {
    const commits = Array.from({ length: 2000 }, (_, index) => ({ hash: String(index), subject: 'change', paths: ['src/search.ts', `unmapped/${index}.ts`] }));
    const result = groupBriefing(commits, docs, 'en');
    expect(result).toMatchObject({ files: 2001, mapped: 1, unmapped: 2000 });
    expect(result.groups.find(group => group.id === 'capabilities/search')?.commits).toHaveLength(2000);
  });
});
