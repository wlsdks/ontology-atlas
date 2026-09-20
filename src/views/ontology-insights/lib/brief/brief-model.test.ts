import { describe, expect, it } from 'vitest';
import { briefTotals, type BriefCore } from './brief-model';

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
    expect(briefTotals([ontology]).unknown).toBe(3);
    expect(briefTotals([ontology]).unknown).toBeLessThanOrEqual(ontology.headline ?? 0);
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
