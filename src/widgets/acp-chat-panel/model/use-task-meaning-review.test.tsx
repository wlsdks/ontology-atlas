import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingPermission, TaskBaselineCaptureResult } from '@/features/acp-session';
import { useTaskMeaningReview } from './use-task-meaning-review';

const hash = (value: string) => `sha256:${value.repeat(64)}`;
const raw = ['---', 'kind: capability', 'uid: 994ad212-519b-45fd-b66a-66a5a2946134', 'title: Refund', 'relation_notes:', '  elements/ledger: Captures settlement', 'description: Before', '---', 'Before body'].join('\n');
const events = [
  { kind: 'user' as const, id: 'event', text: 'Change refund meaning' },
  { kind: 'tool' as const, id: 'connection', title: 'mcp__atlas-vault__connection_info', toolKind: 'read', status: 'completed', rawInput: {}, rawOutput: [{ type: 'text', text: JSON.stringify({ vaultRoot: '/vault', repoRoot: '/other/source' }) }] },
];
function baseline(options: { source?: boolean; mtime?: number; digest?: string } = {}): TaskBaselineCaptureResult {
  const source = options.source ?? true;
  return { status: 'available', capturedAt: '2026-09-14T00:00:00Z', vaultId: '/vault', scope: { requestedSlugs: ['capabilities/refund'], capturedSlugs: ['capabilities/refund'] }, counts: { requested: 1, captured: 1, bytes: raw.length }, sourceUnavailableReasons: source ? [] : ['missing'], documents: [{ slug: 'capabilities/refund', raw, mtime: options.mtime ?? 100, contentDigest: options.digest ?? hash('a') }], meaningBasis: 'meaning:sha256:before', sourceBasis: source ? { kind: 'git', revision: 'abc', fingerprint: 'tree:abc', dirty: false, rootPath: '/repo', sourceId: 'source', files: ['src/a.ts'], scope: 'project-source-inspection', sourceBasisId: 'source:sha256:before' } : null };
}
function pending(input: Record<string, unknown> = {}): PendingPermission {
  return { request: { requestId: 1, sessionId: 'session', title: 'patch_concept', toolCallId: 'tool', toolName: 'mcp__atlas-vault__patch_concept', toolKind: 'other', filePath: null, reviewKind: 'ontology-write', rawInput: { slug: 'capabilities/refund', expected_mtime: 100, frontmatter: { description: null, relation_notes: { 'elements/new': 'New rule' } }, body: '', ...input }, options: [] }, origin: { sessionGeneration: 2, turn: { sessionId: 'session', vaultRoot: '/vault', userEventId: 'event', text: 'Change refund meaning' }, task: { outcome: 'Change refund meaning', nonGoals: null, structure: 'unstructured' }, taskBaseline: baseline() }, resolve: vi.fn() };
}
const stableCapture = async () => baseline();

describe('useTaskMeaningReview', () => {
  it('preserves null removal, empty body, and complete relation-note map semantics', async () => {
    const capture = vi.fn(async () => baseline()); const request = pending();
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'description', kind: 'removed', after: { present: false } }),
      expect.objectContaining({ field: 'body', kind: 'changed', after: { present: true, value: '' } }),
      expect.objectContaining({ field: 'relation_notes', kind: 'removed', before: { present: true, value: 'Captures settlement' } }),
      expect.objectContaining({ field: 'relation_notes', kind: 'added', after: { present: true, value: 'New rule' } }),
    ]));
    expect(result.current.coverage.complete).toBe(true);
  });

  it('keeps a fractional MCP guard as coarse-compatible with the native integer-ms file boundary', async () => {
    const request = pending({ expected_mtime: 100.875 });
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.guardStatus).toBe('compatible-coarse');
    expect(result.current.proposal?.rawInput.expected_mtime).toBe(100.875);
  });

  it('is explicitly unavailable without historical source evidence', async () => {
    const request = pending(); request.origin!.taskBaseline = baseline({ source: false });
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.reasons).toEqual(['source_basis_unavailable']);
  });

  it.each([
    { name: 'wrong server namespace', rows: [events[0]!, { ...events[1]!, title: 'mcp__other__connection_info' }] },
    { name: 'prior turn result', rows: [events[1]!, events[0]!] },
    { name: 'failed result', rows: [events[0]!, { ...events[1]!, status: 'failed' }] },
    { name: 'truncated result', rows: [events[0]!, { ...events[1]!, rawOutput: { vaultRoot: '/vault', truncated: true } }] },
    { name: 'agent prose', rows: [events[0]!, { kind: 'agent' as const, id: 'answer', text: 'connection_info says vaultRoot is /vault' }] },
  ])('refuses $name as write-vault proof', async ({ rows }) => {
    const request = pending();
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events: rows }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.reasons).toEqual(['connection_unverified']);
    expect(result.current.meaningStatus).toBe('unknown');
  });

  it('blocks execution on a known wrong MCP vault even when the same target slug exists', async () => {
    const request = pending();
    const wrongRoot = [events[0]!, { ...events[1]!, rawOutput: [{ type: 'text', text: JSON.stringify({ vaultRoot: '/other', repoRoot: '/repo' }) }] }];
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events: wrongRoot }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current).toMatchObject({ reasons: ['connection_root_mismatch'], executionBlocked: true, actualReportedRoot: '/other', meaningStatus: 'unknown' });
    expect(request.resolve).not.toHaveBeenCalled();
  });

  it('does not publish a late result after raw request identity changes', async () => {
    const releases: Array<(value: TaskBaselineCaptureResult) => void> = [];
    const capture = vi.fn(() => new Promise<TaskBaselineCaptureResult>((resolve) => { releases.push(resolve); }));
    const first = pending();
    const { result, rerender } = renderHook(({ request }) => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }), { initialProps: { request: first } });
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    const changed = pending({ body: 'changed request' }); rerender({ request: changed });
    releases[0]!(baseline());
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('loading');
  });

  it('rechecks binding at acceptance and never resolves the write permission', async () => {
    let current = baseline(); const request = pending();
    const capture = async () => current;
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await expect(result.current.markMeaningAccepted({ acknowledgeFullScope: false })).resolves.toBe(false);
    current = baseline({ mtime: 101, digest: hash('b') });
    await act(async () => { await expect(result.current.markMeaningAccepted({ acknowledgeFullScope: true })).resolves.toBe(false); });
    expect(request.resolve).not.toHaveBeenCalled();
    expect(result.current.meaningStatus).toBe('unreviewed');
  });

  it('marks only the current fully acknowledged proposal meaning as accepted', async () => {
    const request = pending();
    const capture = async () => baseline();
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { await expect(result.current.markMeaningAccepted({ acknowledgeFullScope: true })).resolves.toBe(true); });
    expect(result.current.meaningStatus).toBe('accepted');
    expect(request.resolve).not.toHaveBeenCalled();
  });

  it('rejects acceptance when the bound raw arguments mutate in place', async () => {
    const request = pending();
    const capture = async () => baseline();
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    request.request.rawInput.body = 'mutated after review';
    await expect(result.current.markMeaningAccepted({ acknowledgeFullScope: true })).resolves.toBe(false);
    expect(request.resolve).not.toHaveBeenCalled();
  });

  it('blocks a known wrong root even when historical source evidence is missing', async () => {
    const request = pending(); request.origin!.taskBaseline = baseline({ source: false });
    const wrong = [events[0]!, { ...events[1]!, rawOutput: { vaultRoot: '/wrong' } }];
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events: wrong }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.executionBlocked).toBe(true);
  });

  it.each([
    { connectionRows: [{ ...events[1]!, rawOutput: [{ type: 'text', text: JSON.stringify({ vaultRoot: '/vault' }) }, { type: 'text', text: JSON.stringify({ vaultRoot: '/wrong' }) }] }] },
    { connectionRows: [events[1]!, { ...events[1]!, id: 'later', rawOutput: { vaultRoot: '/wrong', truncated: true } }] },
  ])('invalidates contradictory or later invalid connection evidence', async ({ connectionRows }) => {
    const { result } = renderHook(() => useTaskMeaningReview({ pending: pending(), runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events: [events[0]!, ...connectionRows] }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('requires the current capture to preserve vault identity and complete historical membership', async () => {
    const request = pending();
    const historical = baseline();
    if (historical.status === 'available') {
      historical.scope = { requestedSlugs: ['capabilities/refund', 'capabilities/pay'], capturedSlugs: ['capabilities/refund', 'capabilities/pay'] };
      historical.documents = [...historical.documents, { ...historical.documents[0]!, slug: 'capabilities/pay' }];
      historical.counts = { requested: 2, captured: 2, bytes: raw.length * 2 };
    }
    request.origin!.taskBaseline = historical;
    const wrongVault = async () => ({ ...baseline(), vaultId: '/wrong' }) as TaskBaselineCaptureResult;
    const { result, rerender } = renderHook(({ capture }) => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }), { initialProps: { capture: stableCapture } });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    rerender({ capture: wrongVault });
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(await result.current.markMeaningAccepted({ acknowledgeFullScope: true })).toBe(false);
  });

  it.each([
    ['source_binding_changed', (value: Extract<TaskBaselineCaptureResult, { status: 'available' }>) => { value.sourceBasis!.rootPath = '/another'; value.sourceBasis!.sourceId = 'another'; value.sourceBasis!.sourceBasisId = 'source:sha256:another'; }],
    ['source_diff_unavailable', (value: Extract<TaskBaselineCaptureResult, { status: 'available' }>) => { value.sourceBasis!.fingerprint = 'tree:changed'; value.sourceBasis!.sourceBasisId = 'source:sha256:changed'; }],
  ] as const)('rejects current source evidence as %s', async (reason, mutate) => {
    const capture = async () => { const value = baseline(); if (value.status === 'available') mutate(value); return value; };
    const { result } = renderHook(() => useTaskMeaningReview({ pending: pending(), runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.reasons).toEqual([reason]);
    expect(await result.current.markMeaningAccepted({ acknowledgeFullScope: true })).toBe(false);
  });

  it('keeps rejected capture unavailable', async () => {
    const capture = async (): Promise<TaskBaselineCaptureResult> => { throw new Error('capture failed'); };
    const { result } = renderHook(() => useTaskMeaningReview({ pending: pending(), runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(await result.current.markMeaningAccepted({ acknowledgeFullScope: true })).toBe(false);
  });

  it('invalidates stale acceptance callbacks and batched provider replacement', async () => {
    const first = async () => baseline();
    const next = vi.fn(() => new Promise<TaskBaselineCaptureResult>(() => {}));
    const { result, rerender } = renderHook(({ capture }) => useTaskMeaningReview({ pending: pending(), runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }), { initialProps: { capture: first } });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const staleAccept = result.current.markMeaningAccepted;
    await act(async () => {
      expect(await staleAccept({ acknowledgeFullScope: true })).toBe(true);
      rerender({ capture: next });
    });
    expect(result.current.meaningStatus).toBe('unknown');
    expect(next).toHaveBeenCalled();
    expect(await staleAccept({ acknowledgeFullScope: true })).toBe(false);
  });
  it('archives the exact reviewed decision before marking meaning accepted without resolving permission', async () => {
    const request = pending();
    let finish!: (saved: boolean) => void;
    const save = vi.fn((_decision: import('./use-task-meaning-review').TaskMeaningDecision) => new Promise<boolean>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events, onMeaningDecision: save }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let accepting!: Promise<boolean>;
    act(() => { accepting = result.current.markMeaningAccepted({ acknowledgeFullScope: true }); });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(result.current.meaningStatus).toBe('unreviewed');
    expect(save.mock.calls[0][0]).toMatchObject({ before: raw, preview: result.current.canonicalPreview, action: 'accept_meaning' });
    expect(Object.isFrozen(save.mock.calls[0][0])).toBe(true);
    await act(async () => { finish(true); expect(await accepting).toBe(true); });
    expect(result.current.decisionSaveStatus).toBe('saved');
    expect(request.resolve).not.toHaveBeenCalled();
  });

  it('retains a visible failed archive and does not mark the meaning accepted', async () => {
    const save = vi.fn(async () => { throw new Error('disk full'); });
    const request = pending();
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: stableCapture, events, onMeaningDecision: save }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { expect(await result.current.markMeaningAccepted({ acknowledgeFullScope: true })).toBe(false); });
    expect(result.current.decisionSaveStatus).toBe('failed');
    expect(result.current.meaningStatus).toBe('unreviewed');
    expect(request.resolve).not.toHaveBeenCalled();
  });

  it('allows comparison but refuses acceptance when the writer would mint a UID', async () => {
    const capture = async () => {
      const value = structuredClone(baseline());
      if (value.status === 'available') value.documents = value.documents.map((row) => ({ ...row, raw: row.raw.replace(/uid:.*\n/, '') }));
      return value;
    };
    const request = pending(); request.origin!.taskBaseline = await capture();
    const { result } = renderHook(() => useTaskMeaningReview({ pending: request, runtimeId: 'codex', vaultRoot: '/vault', captureTaskBaseline: capture, events }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.canonicalPreview).toBeNull();
    await act(async () => { expect(await result.current.markMeaningAccepted({ acknowledgeFullScope: true })).toBe(false); });
  });

});
