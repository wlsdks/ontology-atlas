import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const runTurn = vi.hoisted(() => vi.fn());
const buildProposal = vi.hoisted(() => vi.fn());
const sourceBridge = vi.hoisted(() => ({ preview: vi.fn(), read: vi.fn() }));
const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock('@/shared/lib/copy-text', () => clipboard);
const writes = vi.hoisted(() => ({ createDoc: vi.fn(), saveDoc: vi.fn(), refresh: vi.fn() }));
vi.mock('@/shared/lib/tauri-local-construction', () => ({
  previewConstructionSource: sourceBridge.preview, readConstructionSource: sourceBridge.read,
}));

vi.mock('@/features/vault-agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runTurn,
  buildProposal,
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({
    fileHandles: new Map(),
    manifest: null,
    status: 'loaded',
    handle: {},
    createDoc: writes.createDoc,
    saveDoc: writes.saveDoc,
    refresh: writes.refresh,
    open: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/tauri-llm', () => ({
  llmChat: vi.fn(async () => ({ text: '' })),
  llmChatErrorMessage: null,
}));

import { useVaultAgent, type UseVaultAgentArgs } from './use-vault-agent';
import type { AgentTurn } from '@/features/vault-agent';
import { llmChat } from '@/shared/lib/tauri-llm';
import { EMPTY_SCREEN_CONTEXT } from '@/features/vault-agent/model/screen-context';

type TurnResult = Awaited<ReturnType<typeof import('@/features/vault-agent').runTurn>>;

function args(): UseVaultAgentArgs {
  return {
    provider: 'anthropic' as UseVaultAgentArgs['provider'],
    localEndpoint: null,
    vaultPath: '/vault',
    insight: null,
    manifest: { docs: [] } as unknown as UseVaultAgentArgs['manifest'],
    screenContext: {} as UseVaultAgentArgs['screenContext'],
    locale: 'en',
    vaultIsGit: false,
    projectInstructions: null,
    notices: {
      roundCap: 'round cap',
      noToolCall: () => 'no tool call',
      aborted: 'aborted',
      networkFailed: 'network failed',
      timedOut: 'timed out',
      rateLimited: 'rate limited',
      rejected: 'rejected',
      auditBlocked: 'audit blocked',
      providerRefused: 'provider refused',
      failed: 'The request could not be completed.',
    },
    proposalLabels: {
      createFile: (path) => path,
      modifyFile: (path) => path,
      addRelation: ({ from }) => from,
    },
    snapshotLabel: 'snapshot',
  };
}

/**
 * ⚠️ **A turn that throws is still a turn that ended.** `runTurn` reaches the network,
 * the Tauri bridge and the tool executor; when one of the three rejected, the reset
 * that follows it was simply skipped and the panel stayed `running` forever — send
 * button dead, elapsed clock counting up, only a reload to escape.
 */
describe('useVaultAgent — send when the turn rejects', () => {
  beforeEach(() => {
    runTurn.mockReset();
    buildProposal.mockReset().mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('releases running and the elapsed clock', async () => {
    runTurn.mockRejectedValue(new Error('provider bridge died'));
    const { result } = renderHook(() => useVaultAgent(args()));

    await act(async () => {
      await result.current.send('what changed?');
    });

    expect(result.current.running).toBe(false);
    expect(result.current.elapsedSeconds).toBeNull();
  });

  it('marks the turn failed and says so in the panel, without swallowing the error', async () => {
    const thrown = new Error('provider bridge died');
    runTurn.mockRejectedValue(thrown);
    const { result } = renderHook(() => useVaultAgent(args()));

    await act(async () => {
      await result.current.send('what changed?');
    });

    const turn = result.current.turns.at(-1);
    expect(turn?.status).toBe('failed');
    expect(turn?.events.at(-1)).toMatchObject({
      kind: 'notice',
      code: 'failed',
      text: 'The request could not be completed.',
    });
    expect(console.error).toHaveBeenCalledWith('[vault-agent] turn failed', thrown);
  });

  it('keeps the malformed-response diagnosis and accepts the next send', async () => {
    const actual = await vi.importActual<typeof import('@/features/vault-agent')>('@/features/vault-agent');
    runTurn.mockImplementation(actual.runTurn);
    const receipt = { status: 200, host: 'api.anthropic.com', durationMs: 1, loggedAt: '2026-10-02T00:00:00Z' };
    vi.mocked(llmChat)
      .mockResolvedValueOnce({ ...receipt, body: 'null' })
      .mockResolvedValueOnce({ ...receipt, body: JSON.stringify({ content: [{ type: 'text', text: 'Ready.' }], stop_reason: 'end_turn' }) });
    const { result } = renderHook(() => useVaultAgent({ ...args(), screenContext: EMPTY_SCREEN_CONTEXT }));
    await act(async () => { await result.current.send('Inspect evidence'); });
    expect(result.current.running).toBe(false);
    expect(result.current.elapsedSeconds).toBeNull();
    expect(result.current.turns.at(-1)?.events.at(-1)).toMatchObject({
      kind: 'notice', code: 'failed', text: expect.stringContaining('invalid-provider-response'),
    });
    expect(buildProposal).not.toHaveBeenCalled();
    await act(async () => { await result.current.send('Try again'); });
    expect(result.current.running).toBe(false);
    expect(result.current.turns).toHaveLength(2);
    expect(result.current.turns.at(-1)?.status).toBe('done');
  });

  it('leaves the success path untouched', async () => {
    runTurn.mockImplementation(async (_deps: unknown, turn: { id: string }) => ({
      turn: { ...turn, status: 'done' },
      writeIntents: [],
      readSlugs: [],
    }));
    const { result } = renderHook(() => useVaultAgent(args()));

    await act(async () => {
      await result.current.send('what changed?');
    });

    expect(result.current.running).toBe(false);
    expect(result.current.turns.at(-1)?.status).toBe('done');
  });

  it('keeps a newer request active when a cancelled request completes', async () => {
    const first = Promise.withResolvers<TurnResult>();
    const second = Promise.withResolvers<TurnResult>();
    const started: AgentTurn[] = [];
    const signals: AbortSignal[] = [];
    runTurn.mockImplementation((_deps, turn: AgentTurn, options: { signal: AbortSignal }) => {
      started.push(turn);
      signals.push(options.signal);
      return started.length === 1 ? first.promise : second.promise;
    });
    const { result } = renderHook(() => useVaultAgent(args()));
    let firstSend!: Promise<void>;
    let secondSend!: Promise<void>;
    act(() => { firstSend = result.current.send('first'); });
    act(() => { result.current.stop(); });
    act(() => { secondSend = result.current.send('second'); });
    await act(async () => {
      first.resolve({ turn: { ...started[0], status: 'aborted' }, readSlugs: [], writeIntents: [{ name: 'create_concept', args: {} }] });
      await firstSend;
    });
    expect(result.current.running).toBe(true);
    expect(buildProposal).not.toHaveBeenCalled();
    act(() => { result.current.stop(); });
    expect(signals[1].aborted).toBe(true);
    await act(async () => {
      second.resolve({ turn: { ...started[1], status: 'aborted' }, readSlugs: [], writeIntents: [] });
      await secondSend;
    });
    expect(result.current.running).toBe(false);
  });

  it('does not publish a proposal prepared after cancellation', async () => {
    const prepared = Promise.withResolvers<unknown>();
    buildProposal.mockReturnValue(prepared.promise);
    runTurn.mockImplementation(async (_deps, turn: AgentTurn) => ({
      turn: { ...turn, status: 'done' }, readSlugs: [], writeIntents: [{ name: 'create_concept', args: {} }],
    }));
    const { result } = renderHook(() => useVaultAgent(args()));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.send('prepare'); });
    expect(buildProposal).toHaveBeenCalledTimes(1);
    act(() => { result.current.stop(); });
    await act(async () => {
      prepared.resolve({ id: 'late-proposal', status: 'pending', changes: [] });
      await pending;
    });
    expect(result.current.proposal).toBeNull();
  });
});

for (const retirement of ['stop', 'unmount', 'folder'] as const) {
  it(`passes the turn signal into transport and retires on ${retirement}`, async () => {
    const pending = Promise.withResolvers<TurnResult>();
    let started!: AgentTurn;
    runTurn.mockImplementation(async (deps: Parameters<typeof import('@/features/vault-agent').runTurn>[0], turn: AgentTurn) => {
      started = turn;
      await deps.send({ body: '{}', model: 'fixture', question: 'question', scope: { nodes: [], promptChars: 0, vaultChars: 0, tools: [] } });
      return pending.promise;
    });
    const hook = renderHook((input) => useVaultAgent(input), { initialProps: args() });
    let sending!: Promise<void>;
    act(() => { sending = hook.result.current.send('question'); });
    await waitFor(() => expect(llmChat).toHaveBeenCalled());
    const signal = vi.mocked(llmChat).mock.calls.at(-1)![0].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    act(() => {
      if (retirement === 'stop') hook.result.current.stop();
      else if (retirement === 'unmount') hook.unmount();
      else hook.rerender({ ...args(), vaultPath: '/other' });
    });
    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve({ turn: { ...started, status: 'aborted' }, readSlugs: [], writeIntents: [] }); await sending; });
  });
}


const sourcePreview = {
  sourcePath: '/code', destinationPath: '/vault', fingerprint: 'source-v1',
  files: [{ path: 'entry.py', bytes: 12 }], limited: false, excluded: [],
};
const sourceRange = {
  path: 'entry.py', startLine: 1, endLine: 1, text: 'real source', bytes: 11,
  fullFileSha256: `sha256:${'a'.repeat(64)}`, totalLines: 1, fileComplete: true, nextLine: null,
};
const sourceDraft = {
  id: 'source-draft', status: 'pending', snapshotRequested: false, readNodesThisTurn: [],
  changes: [{ id: 'new', tool: 'add_concept', selected: true, summary: 'new',
    files: [{ path: 'elements/entry.md', kind: 'create', before: null, after: 'reviewed draft' }] }],
};
function localArgs(): UseVaultAgentArgs {
  return { ...args(), screenContext: EMPTY_SCREEN_CONTEXT, provider: 'local', localEndpoint: { baseUrl: 'http://localhost:11434', model: 'fixture' } };
}

describe('local source construction resource boundary', () => {
  beforeEach(() => {
    runTurn.mockReset();
    vi.mocked(llmChat).mockReset().mockResolvedValue({ status: 200, host: 'localhost:11434', durationMs: 0, loggedAt: 'fixture', body: '{}' });
    buildProposal.mockReset().mockResolvedValue(sourceDraft);
    sourceBridge.preview.mockReset().mockResolvedValue(sourcePreview);
    sourceBridge.read.mockReset().mockResolvedValue(sourceRange);
    writes.createDoc.mockReset().mockResolvedValue(undefined);
    writes.saveDoc.mockReset().mockResolvedValue(undefined);
    writes.refresh.mockReset().mockResolvedValue(undefined);
    runTurn.mockImplementation(async (deps, turn) => {
      await deps.execute({ id: 'read', name: 'read_source_text', args: { path: 'entry.py' } });
      await deps.send({ body: '{}', model: 'fixture', question: 'build', scope: { nodes: [], tools: [], vaultChars: 0, promptChars: 0 } });
      return { turn: { ...turn, status: 'done' }, readSlugs: [], writeIntents: [{ name: 'add_concept', args: {} }] };
    });
  });
  afterEach(() => { cleanup(); });

  it('uses construction tools and eight rounds with strict native local transport, then rechecks witnesses before approved save', async () => {
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(runTurn.mock.calls[0][0]).toMatchObject({ roundCap: 8, adapter: { provider: 'local' } });
    expect(runTurn.mock.calls[0][0].tools.some((tool: { name: string }) => tool.name === 'read_source_text')).toBe(true);
    expect(hook.result.current.systemPrompt).toBe(runTurn.mock.calls[0][0].system);
    expect(llmChat).toHaveBeenLastCalledWith(expect.objectContaining({ sourceConstruction: true, provider: 'local' }));
    expect(writes.createDoc).not.toHaveBeenCalled();
    const readsBeforeApply = sourceBridge.read.mock.calls.length;
    await act(async () => { await hook.result.current.apply(); });
    expect(sourceBridge.read.mock.calls.length).toBeGreaterThan(readsBeforeApply);
    expect(writes.createDoc).toHaveBeenCalledWith('elements/entry', 'reviewed draft');
    expect(hook.result.current.proposal?.status).toBe('applied');
  });

  it('blocks apply when a full-file witness changed even with the same inventory fingerprint', async () => {
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    sourceBridge.read.mockResolvedValue({ ...sourceRange, fullFileSha256: `sha256:${'b'.repeat(64)}` });
    await act(async () => { await hook.result.current.apply(); });
    expect(writes.createDoc).not.toHaveBeenCalled();
    expect(hook.result.current.proposal?.status).toBe('conflict');
    expect(hook.result.current.construction?.status).toBe('sourceChanged');
  });

  it.each(['model', 'endpoint', 'vault', 'provider'] as const)('retires the draft on a %s switch', async (field) => {
    const hook = renderHook((input) => useVaultAgent(input), { initialProps: localArgs() });
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    const next = localArgs();
    if (field === 'model') next.localEndpoint!.model = 'other';
    if (field === 'endpoint') next.localEndpoint!.baseUrl = 'http://localhost:1234';
    if (field === 'vault') next.vaultPath = '/other';
    if (field === 'provider') next.provider = 'anthropic';
    hook.rerender(next);
    await act(async () => { await hook.result.current.apply(); });
    expect(writes.createDoc).not.toHaveBeenCalled();
    expect(hook.result.current.proposal?.status).toBe('cancelled');
  });

  it('serializes double apply while source revalidation is pending', async () => {
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    const gate = Promise.withResolvers<typeof sourcePreview>();
    sourceBridge.preview.mockReturnValue(gate.promise);
    let first!: Promise<void>; let second!: Promise<void>;
    act(() => { first = hook.result.current.apply(); second = hook.result.current.apply(); });
    await act(async () => { gate.resolve(sourcePreview); await Promise.all([first, second]); });
    expect(writes.createDoc).toHaveBeenCalledTimes(1);
  });

  it('does not publish a late construction proposal after Stop', async () => {
    const late = Promise.withResolvers<unknown>();
    buildProposal.mockReturnValue(late.promise);
    const hook = renderHook(() => useVaultAgent(localArgs()));
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.sendConstruction(sourcePreview, 'build'); });
    await waitFor(() => expect(buildProposal).toHaveBeenCalled());
    act(() => { hook.result.current.stop(); });
    await act(async () => { late.resolve(sourceDraft); await pending; });
    expect(hook.result.current.proposal).toBeNull();
    expect(writes.createDoc).not.toHaveBeenCalled();
  });

  it('refuses the ninth construction send even when the shared loop asks for a closing request', async () => {
    vi.mocked(llmChat).mockClear();
    runTurn.mockImplementation(async (deps, turn) => {
      for (let index = 0; index < 9; index += 1) await deps.send({ body: '{}', model: 'fixture', question: 'build', scope: { nodes: [], tools: [], vaultChars: 0, promptChars: 0 } });
      return { turn, readSlugs: [], writeIntents: [] };
    });
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(llmChat).toHaveBeenCalledTimes(8);
    expect(hook.result.current.construction?.status).toBe('incomplete');
    expect(hook.result.current.construction?.issues).toContainEqual({ code: 'construction_request_limit', target: '/code' });
  });

  it('keeps the real loop partial draft after eight requests while refusing its ninth closing transfer', async () => {
    const actual = await vi.importActual<typeof import('@/features/vault-agent')>('@/features/vault-agent');
    runTurn.mockImplementation(actual.runTurn);
    vi.mocked(llmChat).mockReset().mockImplementation(async () => {
      const index = vi.mocked(llmChat).mock.calls.length;
      const name = index === 1 ? 'read_source_text' : index === 2 ? 'add_concept' : 'list_source_files';
      const callArgs = index === 1 ? { path: 'entry.py' } : index === 2 ? {
        slug: 'elements/entry', kind: 'element', title: 'Entry', path: 'entry.py',
        body: `Observed entry [source:entry.py:1-1@${sourceRange.fullFileSha256}]`,
      } : {};
      return { status: 200, host: 'localhost:11434', durationMs: 0, loggedAt: 'fixture', body: JSON.stringify({
        choices: [{ message: { content: null, tool_calls: [{ id: `call-${index}`, type: 'function', function: { name, arguments: JSON.stringify(callArgs) } }] }, finish_reason: 'tool_calls' }],
      }) };
    });
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(llmChat).toHaveBeenCalledTimes(8);
    expect(hook.result.current.turns.at(-1)?.events.at(-1)).toMatchObject({ kind: 'notice', code: 'round-cap' });
    expect(hook.result.current.proposal?.status).toBe('pending');
    expect(hook.result.current.construction?.status).toBe('incomplete');
    expect(writes.createDoc).not.toHaveBeenCalled();
  });

  it('does not send a construction request beyond the serialized byte budget', async () => {
    vi.mocked(llmChat).mockClear();
    runTurn.mockImplementation(async (deps, turn) => {
      await deps.send({ body: '한'.repeat(22000), model: 'fixture', question: 'build', scope: { nodes: [], tools: [], vaultChars: 0, promptChars: 0 } });
      return { turn, readSlugs: [], writeIntents: [] };
    });
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(llmChat).not.toHaveBeenCalled();
  });

  it('labels a round-limited surviving proposal incomplete even when the shared turn ends done', async () => {
    runTurn.mockImplementation(async (deps, turn) => {
      await deps.execute({ id: 'read', name: 'read_source_text', args: { path: 'entry.py' } });
      return { turn: { ...turn, status: 'done', events: [...turn.events, { kind: 'notice', code: 'round-cap', text: 'limit' }] }, readSlugs: [], writeIntents: [{ name: 'add_concept', args: {} }] };
    });
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(hook.result.current.proposal?.status).toBe('pending');
    expect(hook.result.current.construction?.status).toBe('incomplete');
  });

  it('keeps source-read limits visible and marks a surviving draft incomplete after a normal model finish', async () => {
    runTurn.mockImplementation(async (deps, turn) => {
      for (let index = 0; index < 9; index += 1) await deps.execute({ id: `read-${index}`, name: 'read_source_text', args: { path: 'entry.py' } });
      return { turn: { ...turn, status: 'done' }, readSlugs: [], writeIntents: [{ name: 'add_concept', args: {} }] };
    });
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(hook.result.current.construction?.status).toBe('incomplete');
    expect(hook.result.current.construction?.issues).toContainEqual({ code: 'source_range_limit', target: 'entry.py' });
    expect(hook.result.current.proposal?.status).toBe('pending');
  });

  it('labels invalid source evidence changed and publishes no actionable draft', async () => {
    sourceBridge.read.mockResolvedValue({ ...sourceRange, bytes: 999 });
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(hook.result.current.construction?.status).toBe('sourceChanged');
    expect(hook.result.current.construction?.issues).toContainEqual({ code: 'source_evidence_invalid', target: 'entry.py' });
    expect(hook.result.current.proposal).toBeNull();
    expect(writes.createDoc).not.toHaveBeenCalled();
  });

  it('blocks a stale resource after Apply started but before native witness revalidation finishes', async () => {
    const hook = renderHook((input) => useVaultAgent(input), { initialProps: localArgs() });
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    const gate = Promise.withResolvers<typeof sourcePreview>();
    sourceBridge.preview.mockReturnValue(gate.promise);
    let applying!: Promise<void>;
    act(() => { applying = hook.result.current.apply(); });
    hook.rerender({ ...localArgs(), vaultPath: '/other' });
    await act(async () => { gate.resolve(sourcePreview); await applying; });
    expect(writes.createDoc).not.toHaveBeenCalled();
    expect(hook.result.current.proposal?.status).toBe('cancelled');
  });

  it('refuses a remote address despite the local provider label', async () => {
    const hook = renderHook(() => useVaultAgent({ ...localArgs(), localEndpoint: { baseUrl: 'https://remote.example', model: 'fixture' } }));
    await act(async () => { await hook.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('rejects a preview for a different destination or a nonlocal provider before a request', async () => {
    const hook = renderHook(() => useVaultAgent(localArgs()));
    await act(async () => { await hook.result.current.sendConstruction({ ...sourcePreview, destinationPath: '/other' }, 'build'); });
    expect(runTurn).not.toHaveBeenCalled();
    hook.unmount();
    const cloud = renderHook(() => useVaultAgent(args()));
    await act(async () => { await cloud.result.current.sendConstruction(sourcePreview, 'build'); });
    expect(runTurn).not.toHaveBeenCalled();
  });
});

describe('useVaultAgent proposal clipboard outcomes', () => {
  beforeEach(() => {
    clipboard.copyText.mockReset().mockResolvedValue(true);
    runTurn.mockImplementation(async (_deps, turn: AgentTurn) => ({ turn: { ...turn, status: 'done' },
      readSlugs: [], writeIntents: [{ name: 'patch_concept', args: {} }] }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  function preparedProposal() {
    return { id: 'clipboard', status: 'pending', snapshotRequested: false, readNodesThisTurn: [], changes: [
      { id: 'first', tool: 'patch_concept', summary: 'First', selected: true,
        files: [{ path: 'capabilities/payment.md', kind: 'modify', before: 'original', after: 'original\nEARLIER' }] },
      { id: 'last', tool: 'patch_concept', summary: 'Last', selected: true,
        files: [{ path: 'capabilities/payment.md', kind: 'modify', before: 'original\nEARLIER', after: 'original\nEARLIER\nLATER' }] },
    ] };
  }

  it('starts no clipboard operation without a pending proposal', async () => {
    const hook = renderHook(() => useVaultAgent(args()));
    await expect(hook.result.current.copyProposal()).resolves.toBe(false);
    expect(clipboard.copyText).not.toHaveBeenCalled();
  });

  it('returns the actual pending clipboard result and final file bytes', async () => {
    const pending = Promise.withResolvers<boolean>();
    clipboard.copyText.mockReturnValue(pending.promise);
    buildProposal.mockResolvedValue(preparedProposal());
    const hook = renderHook(() => useVaultAgent(args()));
    await act(async () => { await hook.result.current.send('draft'); });
    let settled = false;
    const result = hook.result.current.copyProposal().then(ok => { settled = true; return ok; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(clipboard.copyText).toHaveBeenCalledWith(expect.stringContaining('original\nEARLIER\nLATER'));
    pending.resolve(false);
    await expect(result).resolves.toBe(false);
  });

  it('refuses direct clipboard calls for a gap or empty selection', async () => {
    buildProposal.mockResolvedValue(preparedProposal());
    const hook = renderHook(() => useVaultAgent(args()));
    await act(async () => { await hook.result.current.send('draft'); });
    act(() => { hook.result.current.toggleChange('first', false); });
    await expect(hook.result.current.copyProposal()).resolves.toBe(false);
    act(() => { hook.result.current.toggleChange('last', false); });
    await expect(hook.result.current.copyProposal()).resolves.toBe(false);
    expect(clipboard.copyText).not.toHaveBeenCalled();
  });


  it('keeps direct clipboard operations serial across selection changes', async () => {
    const pending = Promise.withResolvers<boolean>();
    clipboard.copyText.mockReturnValueOnce(pending.promise).mockResolvedValue(true);
    buildProposal.mockResolvedValue(preparedProposal());
    const hook = renderHook(() => useVaultAgent(args()));
    await act(async () => { await hook.result.current.send('draft'); });
    const oldCopy = hook.result.current.copyProposal();
    act(() => { hook.result.current.toggleChange('last', false); });
    await expect(hook.result.current.copyProposal()).resolves.toBe(false);
    expect(clipboard.copyText).toHaveBeenCalledTimes(1);
    pending.resolve(true);
    await expect(oldCopy).resolves.toBe(true);
    await expect(hook.result.current.copyProposal()).resolves.toBe(true);
    expect(clipboard.copyText).toHaveBeenCalledTimes(2);
    expect(clipboard.copyText.mock.calls[1][0]).not.toContain('LATER');
  });

  it('keeps rejected clipboard operations retryable and permits fallback success', async () => {
    clipboard.copyText.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(true);
    buildProposal.mockResolvedValue(preparedProposal());
    const hook = renderHook(() => useVaultAgent(args()));
    await act(async () => { await hook.result.current.send('draft'); });
    await expect(hook.result.current.copyProposal()).resolves.toBe(false);
    expect(hook.result.current.proposal?.status).toBe('pending');
    await expect(hook.result.current.copyProposal()).resolves.toBe(true);
  });
});
