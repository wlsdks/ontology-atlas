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
      isWriteTool: (tool) => tool === 'add_concept' || tool === 'patch_concept',
      receipts: [
        { at: '2026-09-18T01:02:00Z', decision: 'allowed', result: 'pending' },
        { at: '2026-09-18T01:03:00Z', decision: 'rejected', result: 'not-run' },
        { at: '2026-09-18T01:04:00Z', decision: 'allowed', result: 'failed' },
        { at: '2026-09-17T01:04:00Z', decision: 'allowed', result: 'pending' },
      ],
      anchorMs,
    });
    const byId = Object.fromEntries(brief.lines.map((line) => [line.id, line.count]));
    /*
     * The receipt lines state what is open, not what happened in the window: the older pending
     * write is still allowed and unfinished, so it is still waiting for the person. Their
     * sentences carry no "since", unlike the three call/write/agent lines below.
     */
    expect(byId['agent-writes-waiting']).toBe(2);
    expect(byId['agent-writes-refused']).toBe(1);
    expect(byId['agent-writes-failed']).toBe(1);
    expect(brief.availability).toBe('measured');
    expect({ reads: brief.current, writes: brief.stale, agents: brief.unknown }).toEqual({ reads: 1, writes: 2, agents: 2 });
  });

  it('says no-data when the folder has no activity log at all', () => {
    expect(buildAgentBrief({ entries: [], isWriteTool: () => false, anchorMs }).availability).toBe('no-data');
  });

  it('is measured when the only receipts are older than the anchor', () => {
    // "Nothing recorded here" is a fact about the folder. Deciding it from the window made the
    // card claim no agent had ever worked in a folder whose every receipt predates the visit.
    const brief = buildAgentBrief({
      entries: [],
      isWriteTool: () => false,
      receipts: [{ at: '2026-09-01T00:00:00Z', decision: 'allowed', result: 'pending' }],
      anchorMs,
    });
    expect(brief.availability).toBe('measured');
    expect(brief.lines.find((line) => line.id === 'agent-writes-waiting')?.count).toBe(1);
  });
});
