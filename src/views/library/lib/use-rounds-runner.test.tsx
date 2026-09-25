import { act, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import {
  type RoundLedger,
  type RoundRecord,
  type RoundStore,
  createMemoryRoundLedger,
  createMemoryRoundStore,
} from '@/entities/library-round';

import { useRoundsRunner } from './use-rounds-runner';

/**
 * The runner against a session whose handshake never answers — the desktop bridge's
 * `acp_start` held open (probe, 2026-09-25) — and against a Mac with no agent at all.
 * The store and the ledger are the real ones over memory, so what is asserted is what would
 * be on disk.
 */

type Session = {
  status: string;
  start: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

const h = vi.hoisted(() => ({
  store: null as unknown,
  ledger: null as unknown,
  runtimes: [] as unknown[],
  session: null as unknown,
  vault: {
    status: 'loaded',
    handle: { name: 'vault' },
    manifest: { docs: [], sources: [] },
    agentConfigStatus: null,
  },
  agentServer: { launch: { command: '/Applications/Ontology Atlas.app/mcp', args: [] } },
  connectors: { connectors: [] },
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => h.vault,
  useAgentServer: () => h.agentServer,
}));
vi.mock('@/entities/library-round', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/library-round')>()),
  createVaultFileRoundStore: () => h.store,
  createVaultRoundLedger: () => h.ledger,
}));
vi.mock('@/entities/docs-vault', () => ({
  buildLibraryModel: vi.fn(),
  isWikiPage: () => false,
  selectWikiPages: () => [],
}));
vi.mock('@/features/acp-session', () => ({
  VAULT_MCP_SERVER_NAME: 'atlas-vault',
  atlasToolMode: () => 'read',
  connectorAcpServers: () => [],
  isGuardedRuntime: () => true,
  runtimeOwnsWriteGate: () => true,
  useAcpSession: () => h.session,
  vaultMcpServers: () => [],
  vaultSelfReadSlot: () => null,
}));
vi.mock('@/features/library', () => ({
  appendWikiLog: vi.fn(async () => undefined),
  buildCompileBrief: () => 'compile brief',
  judgePageWrite: () => ({ decision: 'refuse' }),
}));
vi.mock('@/features/mcp-connectors', () => ({ useVaultConnectors: () => h.connectors }));
vi.mock('@/shared/lib/tauri-acp', () => ({
  detectAcpRuntimes: vi.fn(async () => h.runtimes),
  isAcpBridgeAvailable: () => true,
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: () => '/vault',
  nativeVaultFileHashes: async () => new Map(),
  readTauriVaultText: async () => null,
}));

const READY_CLAUDE = { id: 'claude-acp', label: 'Claude', state: 'ready', verified: true, isolated: true };

function review(id: string, name: string): RoundRecord {
  return {
    id,
    name,
    kind: 'ontology',
    cadence: { every: '6h' },
    enabled: true,
    query: '',
    createdAt: '2026-09-25T00:00:00.000Z',
    // Far ahead, so the clock never runs it: every pass here is a "Run now".
    nextDueAt: '2099-01-01T00:00:00.000Z',
  };
}

/** The handshake is held open: `start()` never settles, as `acp_start` does under the bridge's `--acp hang`. */
function hangingSession(): Session {
  return {
    status: 'starting',
    start: vi.fn(() => new Promise<void>(() => {})),
    send: vi.fn(async () => {}),
    cancel: vi.fn(),
    stop: vi.fn(async () => {}),
  };
}

const store = () => h.store as RoundStore & { text(): string | null };
const ledger = () => h.ledger as RoundLedger & { text(): string | null };
/** The ledger as written, not as a reader interprets it. */
const ledgerLines = () =>
  (ledger().text() ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ko" messages={ko}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  h.ledger = createMemoryRoundLedger();
  h.session = hangingSession();
});

describe('the rounds runner', () => {
  it('ends a pass stuck in the agent handshake on Pause, keeps the round paused, and runs the next round', async () => {
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [review('first', 'Ontology refinement'), review('second', 'Second review')] }));
    h.runtimes = [READY_CLAUDE];
    const session = h.session as Session;
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await waitFor(() => expect(result.current.rounds).toHaveLength(2));
    await waitFor(() => expect(result.current.agentReady).toBe(true));

    act(() => result.current.runNow('first'));
    await waitFor(() => expect(result.current.running).toMatchObject({ roundId: 'first', phase: 'agent' }));
    expect(session.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.setEnabled('first', false);
    });
    // The header's "running now · <name>" goes with the pass, and the pass says why it ended.
    await waitFor(() => expect(result.current.running).toBeNull());
    expect(ledgerLines()).toEqual([expect.objectContaining({ roundId: 'first', outcome: 'failed', note: 'stopped', summary: '' })]);
    expect(session.stop).toHaveBeenCalled();
    // The stopped pass's own bookkeeping does not undo the pause.
    expect((await store().read()).state.rounds.find((round) => round.id === 'first')?.enabled).toBe(false);

    // The one-pass lock is free: another round's own "Run now" starts its pass.
    act(() => result.current.runNow('second'));
    await waitFor(() => expect(result.current.running).toMatchObject({ roundId: 'second', phase: 'agent' }));
    await act(async () => {
      await result.current.remove('second');
    });
    await waitFor(() => expect(result.current.running).toBeNull());
    expect(ledgerLines().map((line) => [line.roundId, line.note])).toEqual([['first', 'stopped'], ['second', 'stopped']]);
    expect((await store().read()).state.rounds.map((round) => round.id)).toEqual(['first']);
  });

  it('records a review that had no agent as failed, with no summary claiming it completed', async () => {
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [review('first', 'Ontology refinement')] }));
    h.runtimes = [];
    const { detectAcpRuntimes } = await import('@/shared/lib/tauri-acp');
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await waitFor(() => expect(result.current.rounds).toHaveLength(1));
    // Both scans answered (the fast one and the login probe), and neither found an agent.
    await waitFor(() => expect(vi.mocked(detectAcpRuntimes).mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(result.current.agentReady).toBe(false);

    act(() => result.current.runNow('first'));
    await waitFor(() => expect(ledgerLines()).toHaveLength(1));
    expect(ledgerLines()[0]).toMatchObject({ roundId: 'first', outcome: 'failed', note: 'no-agent', agentTurns: 0, summary: '' });
    expect((h.session as Session).start).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.running).toBeNull());
  });
});
