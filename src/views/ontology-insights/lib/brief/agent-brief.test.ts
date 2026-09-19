import { describe, expect, it } from 'vitest';
import { buildAgentBrief } from './agent-brief';

const anchorMs = Date.parse('2026-09-18T00:00:00Z');

describe('buildAgentBrief', () => {
  it('counts calls, writes and distinct agents after the anchor only', () => {
    const brief = buildAgentBrief({
      entries: [
        { at: '2026-09-18T01:00:00Z', tool: 'get_concept', agent: 'claude' },
        { at: '2026-09-18T01:01:00Z', tool: 'add_concept', agent: 'claude' },
        { at: '2026-09-18T02:00:00Z', tool: 'patch_concept', agent: null },
        { at: '2026-09-17T02:00:00Z', tool: 'add_concept', agent: 'codex' },
      ],
      writeTools: new Set(['add_concept', 'patch_concept']),
      anchorMs,
    });
    expect(brief.availability).toBe('measured');
    expect({ reads: brief.current, writes: brief.stale, agents: brief.unknown }).toEqual({ reads: 1, writes: 2, agents: 2 });
  });

  it('says no-data when the folder has no activity log at all', () => {
    expect(buildAgentBrief({ entries: [], writeTools: new Set(), anchorMs }).availability).toBe('no-data');
  });
});
