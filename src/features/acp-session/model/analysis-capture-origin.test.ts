import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisCaptureContext, AnalysisSaveState } from './analysis-capture';
import type { AcpTurnStart, AcpTurnCompletion } from './use-acp-session';

const append = vi.hoisted(() => vi.fn());
vi.mock('@/entities/analysis-record', async (original) => ({ ...await original<object>(), appendAnalysisRecord: append }));
import { createAnalysisTurnObserver } from './analysis-capture';

const handle = { rootPath: '/original-vault' } as unknown as FileSystemDirectoryHandle;
const context: AnalysisCaptureContext = { mode: 'meaning', surface: 'map', handle, writable: true, fileHandles: new Map(), scope: { projectSlug: null, projectUid: null, targetSlugs: [], profileSlug: null }, graph: { nodes: [], edges: [] }, sourceFingerprint: null, profileHash: null };
const start: AcpTurnStart = { runtimeId: 'test', sessionId: 's-1', vaultRoot: '/original-vault', userEventId: 'u-1', text: 'Review meaning', startedAt: '2026-09-05T07:59:00.000Z' };
const finish: AcpTurnCompletion = { ...start, endedAt: '2026-09-05T08:00:00.000Z', outcome: 'completed', stopReason: 'end_turn', events: [{ kind: 'agent', id: 'a-1', text: 'An unverified answer.' }] };

beforeEach(() => { append.mockReset(); append.mockResolvedValue({ created: true }); });
describe('captured analysis origin', () => {
  it('saves a late completion only to its original authorized folder', async () => {
    const state: AnalysisSaveState[] = [];
    const next = { ...context, handle: { rootPath: '/next-vault' } as unknown as FileSystemDirectoryHandle };
    await createAnalysisTurnObserver(context, () => next, (value) => state.push(value))(start)(finish);
    expect(append).toHaveBeenCalledWith(handle, expect.objectContaining({ answer: 'An unverified answer.' }), true);
    expect(state.at(-1)?.record?.qualification.reasons).toContain('vault_context_changed');
  });
  it.each(['vaultRoot', 'sessionId', 'userEventId', 'runtimeId', 'text', 'startedAt'] as const)('refuses mismatched completion %s while retaining raw output', async (field) => {
    const state: AnalysisSaveState[] = [];
    await createAnalysisTurnObserver(context, () => context, (value) => state.push(value))(start)({ ...finish, [field]: field === 'startedAt' ? '2026-09-05T07:58:00.000Z' : 'different' });
    expect(append).not.toHaveBeenCalled();
    expect(state.at(-1)?.status).toBe('error');
    expect(state.at(-1)?.record?.answer).toBe('An unverified answer.');
  });
});
