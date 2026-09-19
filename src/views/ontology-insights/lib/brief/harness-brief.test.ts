import { describe, expect, it } from 'vitest';
import { buildHarnessBrief } from './harness-brief';
import { visibleLines } from './brief-model';

const anchorMs = Date.parse('2026-09-18T00:00:00Z');

describe('buildHarnessBrief', () => {
  it('is app-only in the browser with one line saying so', () => {
    const brief = buildHarnessBrief({ areas: null, driftCount: null, fileTimes: null, guideFileCount: null, anchorMs });
    expect(brief.availability).toBe('app-only');
    expect(brief.lines.map((line) => line.id)).toEqual(['harness-app-only']);
    expect(visibleLines(brief)).toEqual([]);
  });

  it('counts the empty cells per column and rule files changed since the anchor', () => {
    const brief = buildHarnessBrief({
      areas: [
        { told: ['a'], gated: ['b'], watched: ['c'] },
        { told: ['a'], gated: [], watched: [] },
        { told: [], gated: [], watched: ['c'] },
      ],
      driftCount: 2,
      guideFileCount: 17,
      fileTimes: [
        { path: 'AGENTS.md', mtimeMs: anchorMs + 1000 },
        { path: '.claude/rules/git.md', mtimeMs: anchorMs - 1000 },
        { path: '.claude/rules/design.md', mtimeMs: null },
      ],
      anchorMs,
    });
    expect(brief.availability).toBe('measured');
    expect(brief.headline).toBe(17);
    expect({ told: brief.current, gated: brief.stale, watched: brief.unknown }).toEqual({ told: 2, gated: 1, watched: 2 });
    const byId = Object.fromEntries(brief.lines.map((line) => [line.id, line.count]));
    expect(byId).toEqual({
      'harness-untold-areas': 1,
      'harness-ungated-areas': 2,
      'harness-unwatched-areas': 1,
      'harness-mirror-drift': 2,
      'harness-changed-since': 1,
    });
  });
});
