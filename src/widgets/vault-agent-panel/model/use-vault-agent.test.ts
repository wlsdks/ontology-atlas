import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const runTurn = vi.hoisted(() => vi.fn());

vi.mock('@/features/vault-agent', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runTurn,
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({
    fileHandles: new Map(),
    manifest: null,
    status: 'loaded',
    handle: {},
    createDoc: vi.fn(),
    saveDoc: vi.fn(),
    refresh: vi.fn(),
    open: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/tauri-llm', () => ({
  llmChat: vi.fn(async () => ({ text: '' })),
  llmChatErrorMessage: null,
}));

import { useVaultAgent, type UseVaultAgentArgs } from './use-vault-agent';

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
});
