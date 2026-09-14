import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import { previewDocumentPatch } from '@/shared/lib/document-patch.mjs';
import { meaningTransitionV2TextDigest } from '@/shared/lib/meaning-transition-v2';
import { buildProposalBinding } from '@/entities/knowledge-graph';

import type { TaskMeaningDecision } from './use-task-meaning-review';
import { useMeaningTransitionCapture } from './use-meaning-transition-capture';

const native = vi.hoisted(() => ({
  enabled: true,
  append: vi.fn(),
  inspect: vi.fn(),
  continuity: vi.fn(),
}));

vi.mock('@/entities/meaning-transition', async (original) => ({
  ...await original<typeof import('@/entities/meaning-transition')>(),
  appendMeaningTransitionV2: native.append,
}));
vi.mock('@/shared/lib/tauri-meaning-transition-archive', () => ({
  canArchiveMeaningTransitions: () => native.enabled,
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: (handle: { root: string }) => handle.root,
  inspectTauriProjectSource: native.inspect,
  inspectTauriProjectSourceContinuity: native.continuity,
}));

const rawBefore = `---
uid: 30000000-0000-4000-8000-000000000001
kind: capability
title: Refund
description: Old rule
---

Refund body
`;
const patch = { description: 'New 한글 rule' };
const preview = previewDocumentPatch({ rawBefore, frontmatterPatch: patch });
if (preview.status !== 'available') throw new Error('fixture preview unavailable');
const previewMarkdown = preview.markdown;

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function fileHandle(read: () => ArrayBuffer): FileSystemFileHandle {
  return {
    getFile: vi.fn(async () => ({ size: read().byteLength, lastModified: 10, arrayBuffer: async () => read() })),
  } as unknown as FileSystemFileHandle;
}

function context(read: () => ArrayBuffer = () => bytes(previewMarkdown), root = '/vault') {
  return {
    handle: { root } as unknown as FileSystemDirectoryHandle,
    fileHandles: new Map([['capabilities/refund', fileHandle(read)]]) as ReadonlyMap<string, FileSystemFileHandle>,
    writable: true,
  };
}

async function decision(): Promise<TaskMeaningDecision> {
  const identity = { vaultId: '/vault', sessionGeneration: 3, userEventId: 'user-1', requestId: 7, toolCallId: 'tool-1' };
  const rawInput = { slug: 'capabilities/refund', expected_mtime: 10, frontmatter: patch };
  const sourceRevision = `source:sha256:${'e'.repeat(64)}`;
  const beforeDigest = await meaningTransitionV2TextDigest(rawBefore);
  const proposal = await buildProposalBinding({ identity, request: { outcome: 'Change refund policy', nonGoals: null },
    sourceRevision, meaningRevision: 'meaning:sha256:before',
    contentDigest: beforeDigest, rawInput });
  return {
    action: 'accept_meaning', actionAt: '2026-09-14T08:00:00.000Z',
    request: {
      requestId: 7, sessionId: 'session-1', title: 'patch_concept', toolCallId: 'tool-1',
      toolName: 'mcp__ontology-atlas__patch_concept', toolKind: 'other', filePath: null,
      reviewKind: 'ontology-write', rawInput: { slug: 'capabilities/refund', expected_mtime: 10, frontmatter: patch }, options: [],
      writerCorrelation: { status: 'verified', server: 'ontology-atlas', tool: 'patch_concept', toolCall: 'structured-mcp', approval: 'structured-mcp', terminal: 'not-observed' },
    },
    origin: { sessionGeneration: 3, turn: { sessionId: 'session-1', vaultRoot: '/vault', userEventId: 'user-1', text: 'Change refund policy' },
      task: { outcome: 'Change refund policy', nonGoals: null, structure: 'unstructured' }, taskBaseline: null },
    proposal,
    current: {
      status: 'available', capturedAt: '2026-09-14T08:00:00.000Z', vaultId: '/vault',
      scope: { requestedSlugs: ['capabilities/refund'], capturedSlugs: ['capabilities/refund'] },
      counts: { requested: 1, captured: 1, bytes: rawBefore.length }, sourceUnavailableReasons: [],
      documents: [{ slug: 'capabilities/refund', raw: rawBefore, mtime: 10, contentDigest: beforeDigest }],
      meaningBasis: 'meaning:sha256:before',
      sourceBasis: { kind: 'git', revision: 'abc', fingerprint: `sha256:${'c'.repeat(64)}`, dirty: false,
        rootPath: '/source', sourceId: `sha256:${'d'.repeat(64)}`, files: ['src/refund.ts'],
        scope: 'project-source-inspection', sourceBasisId: sourceRevision },
    },
    before: rawBefore,
    preview: previewMarkdown,
  } as unknown as TaskMeaningDecision;
}

function receipt(result: AcpWorkReceipt['result'] = 'completed'): AcpWorkReceipt {
  return {
    v: 1, id: 'receipt-1', at: '2026-09-14T08:00:01.000Z', updatedAt: '2026-09-14T08:00:02.000Z',
    agent: 'Codex', request: 'Change refund policy', tool: 'patch_concept', decision: 'allowed', result,
    items: [{ target: 'capabilities/refund', operation: 'patch', relation: null, fields: ['description'] }],
    origin: { vaultId: '/vault', sessionGeneration: 3, sessionId: 'session-1', userEventId: 'user-1', requestId: 7, toolCallId: 'tool-1' },
    writerCorrelation: { status: 'verified', server: 'ontology-atlas', tool: 'patch_concept', toolCall: 'structured-mcp', approval: 'structured-mcp',
      terminal: result === 'not-run' ? 'not-observed' : result },
  };
}

beforeEach(() => {
  vi.clearAllMocks(); native.enabled = true;
  native.append.mockResolvedValue({ status: 'archived', fileName: 'transition.md', created: true });
  native.inspect.mockResolvedValue({ kind: 'git', rootPath: '/source', sourceId: `sha256:${'d'.repeat(64)}`, revision: 'abc',
    fingerprint: `sha256:${'c'.repeat(64)}`, dirty: false, truncated: false });
  native.continuity.mockResolvedValue({ scope: 'meaning-transition-continuity-v1', rootPath: '/source',
    sourceId: `sha256:${'d'.repeat(64)}`, kind: 'git', revision: 'abc', fingerprint: `sha256:${'c'.repeat(64)}`,
    dirty: false, truncated: false, exclusions: { target: 'capabilities/refund.md', archivePrefix: '.ontology-atlas/meaning-transitions' } });
});

describe('useMeaningTransitionCapture', () => {
  it('archives the explicit meaning action immediately without waiting for ACP permission', async () => {
    const capture = context();
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    const capturedDecision = await decision();
    let saved: boolean | undefined;
    await act(async () => { saved = await hook.result.current.saveDecision?.(capturedDecision); });
    expect(native.inspect).toHaveBeenCalled();
    expect(native.append).toHaveBeenCalledTimes(1);
    expect(saved).toBe(true);
    expect(native.append.mock.calls[0]![0].record).toMatchObject({ phase: 'decision', meaningDecision: { action: 'accept_meaning' }, acpCorrelation: { executionPermission: 'pending' } });
  });

  it('does not invent a decision from an ACP receipt when no meaning action was recorded', async () => {
    const capture = context();
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    act(() => hook.result.current.recordReceipt(receipt()));
    await Promise.resolve();
    expect(native.append).not.toHaveBeenCalled();
  });

  it('blocks the decision before archival when the current source no longer matches the accepted review source', async () => {
    native.inspect.mockResolvedValueOnce({ kind: 'git', rootPath: '/source', sourceId: `sha256:${'d'.repeat(64)}`,
      revision: 'changed', fingerprint: `sha256:${'f'.repeat(64)}`, dirty: true, truncated: false });
    const capture = context();
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    await act(async () => expect(await hook.result.current.saveDecision!(await decision())).toBe(false));
    expect(native.append).not.toHaveBeenCalled();
    expect(native.continuity).not.toHaveBeenCalled();
  });

  it('suppresses a late archive result after the root context changes', async () => {
    let release!: () => void;
    native.append.mockImplementation(async (input: { isCurrent: () => boolean }) => {
      await new Promise<void>((resolve) => { release = resolve; });
      if (!input.isCurrent()) throw new Error('late context');
    });
    const first = context();
    const hook = renderHook(({ root, capture }) => useMeaningTransitionCapture({ context: capture, vaultRoot: root, runtimeId: 'codex' }),
      { initialProps: { root: '/vault', capture: first } });
    let saved!: Promise<boolean>;
    act(() => { saved = decision().then((value) => hook.result.current.saveDecision!(value)); });
    await waitFor(() => expect(native.append).toHaveBeenCalled());
    hook.rerender({ root: '/other', capture: context(() => bytes(previewMarkdown), '/other') });
    release();
    await act(async () => { await expect(saved).rejects.toThrow(/late context/); });
  });

  it('records a terminal snapshot after two matching UTF-8 reads', async () => {
    const read = vi.fn(() => bytes(previewMarkdown));
    const capture = context(read);
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    await act(async () => { await hook.result.current.saveDecision!(await decision()); });
    act(() => hook.result.current.recordReceipt(receipt()));
    await waitFor(() => expect(native.append).toHaveBeenCalledTimes(2));
    expect(read).toHaveBeenCalledTimes(4); // size and bytes for each of two fresh File observations.
    expect(native.append.mock.calls[1]![0].record).toMatchObject({ phase: 'terminal', outcome: 'accepted_complete', rowEvidence: [{ readback: 'matched' }] });
  });

  it('keeps changed terminal source continuity as an explicit question without turning it into code verification', async () => {
    native.continuity
      .mockResolvedValueOnce({ scope: 'meaning-transition-continuity-v1', rootPath: '/source',
        sourceId: `sha256:${'d'.repeat(64)}`, kind: 'git', revision: 'abc', fingerprint: `sha256:${'c'.repeat(64)}`,
        dirty: false, truncated: false, exclusions: { target: 'capabilities/refund.md', archivePrefix: '.ontology-atlas/meaning-transitions' } })
      .mockResolvedValueOnce({ scope: 'meaning-transition-continuity-v1', rootPath: '/source',
        sourceId: `sha256:${'d'.repeat(64)}`, kind: 'git', revision: 'def', fingerprint: `sha256:${'f'.repeat(64)}`,
        dirty: true, truncated: false, exclusions: { target: 'capabilities/refund.md', archivePrefix: '.ontology-atlas/meaning-transitions' } });
    const capture = context();
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    await act(async () => { await hook.result.current.saveDecision!(await decision()); });
    act(() => hook.result.current.recordReceipt(receipt()));
    await waitFor(() => expect(native.append).toHaveBeenCalledTimes(2));
    const terminal = native.append.mock.calls[1]![0].record;
    expect(terminal).toMatchObject({ phase: 'terminal', outcome: 'accepted_complete',
      receipts: { codeChecks: 'unknown', merge: 'unknown', deployment: 'unknown' } });
    expect(terminal.remainingQuestions).toEqual(expect.arrayContaining([
      expect.stringMatching(/Task-owned code changes remain unverified/),
      expect.stringMatching(/Bounded source continuity changed/),
    ]));
  });

  it.each([
    ['BOM', () => bytes(`\uFEFF${previewMarkdown}`), 'mismatched'],
    ['invalid UTF-8', () => new Uint8Array([0xc3, 0x28]).buffer, 'missing'],
  ])('fails closed for %s writer bytes', async (_name, read, expectedReadback) => {
    const capture = context(read);
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    await act(async () => { await hook.result.current.saveDecision!(await decision()); });
    act(() => hook.result.current.recordReceipt(receipt()));
    await waitFor(() => expect(native.append).toHaveBeenCalledTimes(2));
    expect(native.append.mock.calls[1]![0].record).toMatchObject({ phase: 'terminal', outcome: 'accepted_partial', rowEvidence: [{ readback: expectedReadback }] });
  });

  it('exposes a terminal archive failure without revoking the already archived decision', async () => {
    const capture = context();
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    await act(async () => { await hook.result.current.saveDecision!(await decision()); });
    native.append.mockRejectedValueOnce(new Error('terminal archive failed'));
    act(() => hook.result.current.recordReceipt(receipt()));
    await waitFor(() => expect(hook.result.current.terminalSaveFailed).toBe(true));
    expect(native.append.mock.calls[0]![0].record.phase).toBe('decision');
  });

  it('returns no save callback in an unsupported browser and keeps the action explicitly unsaved', () => {
    native.enabled = false;
    const capture = context();
    const hook = renderHook(() => useMeaningTransitionCapture({ context: capture, vaultRoot: '/vault', runtimeId: 'codex' }));
    expect(hook.result.current.saveDecision).toBeUndefined();
    expect(native.append).not.toHaveBeenCalled();
  });
});
