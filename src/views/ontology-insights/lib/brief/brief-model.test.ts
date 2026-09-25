import { describe, expect, it } from 'vitest';
import { briefCounting, briefTotals, type BriefCore } from './brief-model';

function core(partial: Partial<BriefCore> & Pick<BriefCore, 'core'>): BriefCore {
  return {
    availability: 'measured',
    headline: 0,
    current: 0,
    stale: 0,
    unknown: 0,
    lines: [],
    ...partial,
  };
}

/**
 * **The headline counts things, and a thing counted twice is not two things.**
 *
 * Several lines under one card legitimately look at the same subjects from different angles —
 * the ontology card's "only a folder moved" concepts are also inside its "nobody checked these"
 * count. Adding the lines made the headline claim 205 unchecked items on a folder holding 108
 * concepts (measured on this repository's own vault, 2026-09-21): a number no reader can place.
 */
describe('briefTotals', () => {
  it('counts a concept once when two lines name it', () => {
    const ontology = core({
      core: 'ontology',
      headline: 3,
      current: 0,
      stale: 0,
      // Three concepts nobody could check; one of them is also the folder-only line.
      unknown: 3,
      headlineTotals: { stale: 0, unknown: 3 },
      lines: [
        { id: 'ontology-evidence-folder-only', count: 1, state: 'unknown' },
        { id: 'ontology-evidence-unchecked', count: 3, state: 'unknown' },
      ],
    });
    expect(briefTotals([ontology])?.unknown).toBe(3);
    expect(briefTotals([ontology])?.unknown).toBeLessThanOrEqual(ontology.headline ?? 0);
  });

  it('adds up the lines of a core whose lines are separate things', () => {
    /* The harness card's lines count empty cells in the coverage table — an area nothing tells,
       an area nothing gates and an area nothing watches are three gaps, not one area named
       three times — so this core states no total of its own and the lines are the sum. */
    const harness = core({
      core: 'harness',
      headline: 12,
      lines: [
        { id: 'harness-untold-areas', count: 2, state: 'unknown' },
        { id: 'harness-ungated-areas', count: 3, state: 'unknown' },
        { id: 'harness-mirror-drift', count: 1, state: 'stale' },
        { id: 'harness-changed-since', count: 9, state: 'current' },
      ],
    });
    expect(briefTotals([harness])).toEqual({ stale: 1, unknown: 5 });
  });
});

/**
 * **A core that is still reading has not said zero.**
 *
 * The harness scan lands seconds after every other core. While it read, the headline summed the
 * other three and painted "98 to learn · 99 not checked" as if final; the scan then added 44 mirror
 * findings and two unguarded areas and the same line silently became 142 · 101 (real bridge,
 * 2026-09-25). The sum waits for every core instead.
 */
describe('a sum while a core is still reading', () => {
  const ontology = core({
    core: 'ontology',
    headline: 98,
    headlineTotals: { stale: 98, unknown: 99 },
    lines: [{ id: 'ontology-evidence-missing', count: 98, state: 'stale' }],
  });
  const wiki = core({ core: 'wiki', headline: 4, lines: [{ id: 'wiki-stale-pages', count: 1, state: 'stale' }] });
  const agent = core({ core: 'agent', availability: 'no-data', headline: 0 });
  const reading = core({ core: 'harness', availability: 'reading', headline: null, current: null, stale: null, unknown: null });

  it('is not a number until the harness scan has reported', () => {
    expect(briefTotals([ontology, wiki, reading, agent])).toBeNull();
    expect(briefCounting([ontology, wiki, reading, agent])).toEqual(['harness']);
  });

  it('waits for the ontology walk the same way', () => {
    const walking = core({ ...ontology, availability: 'reading' });
    expect(briefTotals([walking, wiki, agent])).toBeNull();
    expect(briefCounting([walking, wiki, agent])).toEqual(['ontology']);
  });

  it('is the whole sum once every core has reported', () => {
    const measured = core({
      core: 'harness',
      headline: 106,
      lines: [
        { id: 'harness-ungated-areas', count: 1, state: 'unknown' },
        { id: 'harness-unwatched-areas', count: 1, state: 'unknown' },
        { id: 'harness-mirror-drift', count: 44, state: 'stale' },
      ],
    });
    expect(briefCounting([ontology, wiki, measured, agent])).toEqual([]);
    expect(briefTotals([ontology, wiki, measured, agent])).toEqual({ stale: 98 + 1 + 44, unknown: 99 + 2 });
  });

  it.each(['app-only', 'no-source', 'unreadable', 'no-data'] as const)('does not wait on a core that cannot be counted here: %s', (availability) => {
    // These are final answers about this session, not reads in flight: waiting on them would hold
    // the headline back forever.
    const stopped = core({ core: 'harness', availability, headline: null, current: null, stale: null, unknown: null });
    expect(briefCounting([ontology, stopped])).toEqual([]);
    expect(briefTotals([ontology, stopped])).toEqual({ stale: 98, unknown: 99 });
  });
});
