import { describe, expect, it } from 'vitest';
import { flowHeadingChanges, selectFlowVersions } from './flow-history';

const basis = (graphHash: string | null) => ({ graphHash, sourceFingerprint: null, profileHash: null, documents: [] });

const run = (overrides: Record<string, unknown> = {}) => ({
  schema: 'atlas-analysis/v1',
  recordType: 'run',
  id: 'run-1',
  createdAt: '2026-09-18T00:00:00Z',
  mode: 'meaning',
  scope: { projectSlug: 'project', projectUid: null, targetSlugs: [], profileSlug: null },
  request: { id: 'r', text: 'ask', parentRunId: null },
  origin: { surface: 'analysis', runtimeId: 'claude-acp', sessionId: null, userEventId: 'u', answerEventId: 'a', startedAt: '2026-09-18T00:00:00Z', stopReason: null, outcome: 'completed' },
  basis: basis('graph-1'),
  evidence: [],
  observations: [],
  profileSnapshot: null,
  toolReads: [],
  sourceAccess: 'atlas-only',
  findings: [],
  qualification: { status: 'grounded', reasons: [] },
  answer: '### 왜 있나\n설명.',
  ...overrides,
}) as never;

const context = { mode: 'meaning', scope: { projectSlug: 'project', projectUid: null, targetSlugs: [], profileSlug: null } } as never;

describe('selectFlowVersions', () => {
  it('keeps this surface, this scope and completed answers, newest first', () => {
    const versions = selectFlowVersions(
      [
        run(),
        run({ id: 'run-2', createdAt: '2026-09-19T00:00:00Z' }),
        run({ id: 'other-surface', origin: { ...(run() as unknown as { origin: Record<string, unknown> }).origin, surface: 'architecture' } }),
        run({ id: 'cancelled', origin: { ...(run() as unknown as { origin: Record<string, unknown> }).origin, outcome: 'cancelled' } }),
        run({ id: 'empty', answer: '   ' }),
        run({ id: 'other-project', scope: { projectSlug: 'else', projectUid: null, targetSlugs: [], profileSlug: null } }),
      ],
      context,
      basis('graph-1'),
    );
    expect(versions.map((version) => version.id)).toEqual(['run-2', 'run-1']);
    expect(versions[0]?.standing).toBe('current');
    expect(versions[0]?.writer).toBe('claude-acp');
  });

  it('says the folder moved when the graph behind the explanation changed', () => {
    const versions = selectFlowVersions([run()], context, basis('graph-2'));
    expect(versions[0]?.standing).toBe('stale');
    expect(versions[0]?.reasons).toContain('graphHash_changed');
  });

  it('says unknown rather than current when there is nothing to compare against', () => {
    expect(selectFlowVersions([run()], context, null)[0]?.standing).toBe('unknown');
    expect(selectFlowVersions([run()], null, basis('graph-1'))).toEqual([]);
  });
});

describe('flowHeadingChanges', () => {
  it('names the scenes that were added, removed or rewritten', () => {
    const newer = '### 왜 있나\n새 설명.\n\n### 어디가 책임지나\n같음.\n\n### 새 장면\n추가됨.';
    const older = '### 왜 있나\n옛 설명.\n\n### 어디가 책임지나\n같음.\n\n### 사라진 장면\n지워짐.';
    expect(flowHeadingChanges(newer, older)).toEqual([
      { heading: '왜 있나', change: 'rewritten' },
      { heading: '새 장면', change: 'added' },
      { heading: '사라진 장면', change: 'removed' },
    ]);
  });
});
