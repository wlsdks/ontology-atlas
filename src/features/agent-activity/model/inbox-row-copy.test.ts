import { describe, expect, it } from 'vitest';
import type { BellResult } from './bell-inbox';
import {
  decisionKey,
  formatInboxDuration,
  problemSummary,
  resultFacts,
  writeSentence,
} from './inbox-row-copy';

const t = (key: string, values?: Record<string, number>) =>
  values ? `${key}:${Object.values(values).join(',')}` : key;

describe('writeSentence', () => {
  it('leads with the largest count and breaks ties added, edited, removed', () => {
    expect(writeSentence(t, { added: 1, edited: 3, removed: 0 })).toBe('resultEdited:3');
    expect(writeSentence(t, { added: 2, edited: 2, removed: 2 })).toBe('resultAdded:2');
    expect(writeSentence(t, { added: 0, edited: 1, removed: 1 })).toBe('resultEdited:1');
  });

  it('says nothing changed for no counts or all zero', () => {
    expect(writeSentence(t, null)).toBe('resultNothing');
    expect(writeSentence(t, { added: 0, edited: 0, removed: 0 })).toBe('resultNothing');
  });
});

describe('problemSummary', () => {
  it('lists unresolved edges and cycles, marking a partial cycle count as at least', () => {
    expect(
      problemSummary(t, { unresolvedEdges: 2, dependencyCycles: 1, dependencyCyclesPartial: false }),
    ).toBe('problemUnresolved:2summaryJoinproblemCycles:1');
    expect(
      problemSummary(t, { unresolvedEdges: 0, dependencyCycles: 3, dependencyCyclesPartial: true }),
    ).toBe('problemCyclesAtLeast:3');
    expect(problemSummary(t, { unresolvedEdges: 0, dependencyCycles: 0, dependencyCyclesPartial: false })).toBe('');
  });
});

describe('decisionKey', () => {
  it('never reads an automatic pass as the person allowing it', () => {
    expect(decisionKey({ decision: 'rejected', autoApproved: true })).toBe('decisionRejected');
    expect(decisionKey({ decision: 'allowed', autoApproved: true })).toBe('decisionAutoApproved');
    expect(decisionKey({ decision: 'allowed', autoApproved: false })).toBe('decisionAllowed');
  });
});

describe('formatInboxDuration', () => {
  it('names the largest unit and leaves out anything under a second', () => {
    expect(formatInboxDuration(t, 500)).toBeNull();
    expect(formatInboxDuration(t, 45_000)).toBe('durationSeconds:45');
    expect(formatInboxDuration(t, 3 * 60_000 + 5_000)).toBe('durationMinutes:3,5');
    expect(formatInboxDuration(t, 2 * 3_600_000 + 4 * 60_000)).toBe('durationHours:2,4');
  });
});

describe('resultFacts', () => {
  const task = {
    kind: 'task',
    agent: 'someone',
    durationMs: 61_000,
    allowed: 0,
    rejected: 0,
    autoApproved: 2,
  } as BellResult;

  it('keeps the decision counts out of a task nobody was asked about', () => {
    const facts = resultFacts(t, task, '2m ago');
    expect(facts).toMatchObject({ allowed: null, denied: null, autoApproved: 2, age: '2m ago' });
    expect(facts.duration).toBe('durationMinutes:1,1');
    expect(resultFacts(t, { ...task, allowed: 1, rejected: 3 } as BellResult, '').denied).toBe(3);
  });

  it('adds a state word to an allowed decision that did not complete, and none otherwise', () => {
    const decision = {
      kind: 'decision',
      agent: null,
      decision: 'allowed',
      result: 'failed',
      items: 4,
    } as unknown as BellResult;
    expect(resultFacts(t, decision, '').summaryFacts).toEqual([
      { label: 'decisionItems:4' },
      { label: 'receiptResult.failed', tone: 'warning' },
    ]);
    expect(resultFacts(t, { ...decision, result: 'completed' } as BellResult, '').summaryFacts).toHaveLength(1);
    expect(
      resultFacts(t, { ...decision, decision: 'rejected' } as BellResult, '').summaryFacts,
    ).toEqual([{ label: 'decisionNoChange' }]);
    expect(resultFacts(t, decision, '').agent).toBe('unknownAgent');
  });
});
