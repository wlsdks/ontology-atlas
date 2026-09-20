import { describe, expect, it } from 'vitest';
import { buildWikiBrief } from './wiki-brief';
import { visibleLines } from './brief-model';

const anchorMs = Date.parse('2026-09-18T00:00:00Z');

describe('buildWikiBrief', () => {
  it('states every page by its cited sources: current, stale, unknown', () => {
    const brief = buildWikiBrief({
      sources: [
        { path: 'sources/a.md', state: 'compiled', citedBy: ['wiki/a'] },
        { path: 'sources/b.md', state: 'stale', citedBy: ['wiki/b'] },
        { path: 'sources/c.md', state: 'partial', citedBy: ['wiki/c'] },
        { path: 'sources/d.md', state: 'checking', citedBy: ['wiki/d'] },
        { path: 'sources/e.md', state: 'not-compiled', citedBy: [] },
      ],
      pages: [
        { slug: 'wiki/a', sourcePaths: ['sources/a.md'] },
        { slug: 'wiki/b', sourcePaths: ['sources/b.md'] },
        { slug: 'wiki/c', sourcePaths: ['sources/a.md', 'sources/c.md'] },
        { slug: 'wiki/d', sourcePaths: ['sources/d.md'] },
        { slug: 'wiki/gone', sourcePaths: ['sources/missing.md'] },
        { slug: 'wiki/free', sourcePaths: [] },
      ],
      folderProblems: { orphanPages: 2, danglingLinks: 1 },
      lint: { disagreement: 1, superseded: 2 },
      passes: [],
      log: [],
      anchorMs,
    });
    expect(brief.availability).toBe('measured');
    expect({ current: brief.current, stale: brief.stale, unknown: brief.unknown }).toEqual({
      current: 1,
      stale: 2,
      unknown: 3,
    });
    const byId = Object.fromEntries(brief.lines.map((line) => [line.id, line.count]));
    expect(byId['wiki-stale-pages']).toBe(2);
    expect(byId['wiki-disagreements']).toBe(3);
    expect(byId['wiki-sources-unwritten']).toBe(1);
    expect(byId['wiki-orphan-pages']).toBe(2);
    expect(byId['wiki-dangling-links']).toBe(1);
  });

  it('counts only passes and writes after the anchor, and never asleep gaps', () => {
    const brief = buildWikiBrief({
      sources: [],
      pages: [{ slug: 'wiki/a', sourcePaths: [] }],
      folderProblems: null,
      lint: null,
      passes: [
        { endedAt: '2026-09-18T01:00:00Z', outcome: 'redrafted' },
        { endedAt: '2026-09-18T02:00:00Z', outcome: 'failed' },
        { endedAt: '2026-09-18T03:00:00Z', outcome: 'asleep' },
        { endedAt: '2026-09-17T23:00:00Z', outcome: 'redrafted' },
      ],
      log: [
        { at: '2026-09-18T01:00:00Z', kind: 'compile' },
        { at: '2026-09-18T01:30:00Z', kind: 'lint' },
        { at: '2026-09-17T01:00:00Z', kind: 'compile' },
      ],
      anchorMs,
    });
    const byId = Object.fromEntries(brief.lines.map((line) => [line.id, line.count]));
    expect(byId['wiki-redrafted-since']).toBe(1);
    expect(byId['wiki-passes-troubled-since']).toBe(1);
    expect(byId['wiki-written-since']).toBe(1);
    expect(visibleLines(brief).map((line) => line.id)).toEqual([
      'wiki-written-since',
      'wiki-redrafted-since',
      'wiki-passes-troubled-since',
    ]);
  });

  it('says no-data for a folder with neither pages nor sources', () => {
    const brief = buildWikiBrief({ sources: [], pages: [], folderProblems: null, lint: null, passes: [], log: [], anchorMs });
    expect(brief.availability).toBe('no-data');
    expect(visibleLines(brief)).toEqual([]);
  });
});
