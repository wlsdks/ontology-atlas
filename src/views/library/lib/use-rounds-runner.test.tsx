import { act, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import {
  type RoundLedger,
  type RoundPassEntry,
  type RoundRecord,
  type RoundStore,
  createMemoryRoundLedger,
  createMemoryRoundStore,
  createRoundStore,
  nextDueAt,
  parseRoundLedger,
  roundFingerprint,
} from '@/entities/library-round';
import { recordApproval } from '@/shared/lib/machine-approvals';
import { WIKI_PAGE_TEMPLATE } from '@/shared/lib/wiki-page-schema';

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
  options: null as null | Record<string, unknown>,
  vault: {
    status: 'loaded',
    handle: { name: 'vault' },
    manifest: { docs: [], sources: [] } as unknown,
    agentConfigStatus: null,
  },
  agentServer: { launch: { command: '/Applications/Ontology Atlas.app/mcp', args: [] } },
  connectors: { connectors: [], allowedHere: () => false, isOnHere: () => false },
  pages: [] as { slug: string }[],
  files: {} as Record<string, string>,
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
  buildLibraryModel: vi.fn(() => ({ sources: [], wikiPages: [], notCompiledCount: 0 })),
  isWikiPage: () => false,
  selectWikiPages: () => h.pages,
}));
vi.mock('@/features/acp-session', async () => ({
  VAULT_MCP_SERVER_NAME: 'atlas-vault',
  atlasToolMode: (await import('@/features/acp-session/model/atlas-tool-policy')).atlasToolMode,
  connectorAcpServers: () => [],
  isGuardedRuntime: () => true,
  runtimeOwnsWriteGate: () => true,
  useAcpSession: (options: Record<string, unknown>) => {
    h.options = options;
    return h.session;
  },
  vaultMcpServers: () => [],
  vaultSelfReadSlot: () => null,
}));
vi.mock('@/features/library', async () => ({
  appendWikiLog: vi.fn(async () => undefined),
  buildCompileBrief: () => 'compile brief',
  judgePageWrite: (await import('@/features/library/lib/judge-page-write')).judgePageWrite,
}));
vi.mock('@/features/mcp-connectors', () => ({ useVaultConnectors: () => h.connectors }));
vi.mock('@/shared/lib/tauri-acp', () => ({
  detectAcpRuntimes: vi.fn(async () => h.runtimes),
  isAcpBridgeAvailable: () => true,
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: () => '/vault',
  nativeVaultFileHashes: async () => new Map(),
  readTauriVaultText: async (_root: string, path: string) => h.files[path] ?? null,
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
  window.localStorage.clear();
});

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

describe('a round the folder switched on, on a Mac that never allowed it', () => {
  it('opens no agent session on the first tick, and runs once this Mac allows it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const overdue = { ...review('shared', 'Tidy the map'), query: 'a focus the folder chose', nextDueAt: '2026-01-01T00:00:00.000Z' };
      h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [overdue] }));
      h.runtimes = [READY_CLAUDE];
      const session = h.session as Session;
      const { result } = renderHook(() => useRoundsRunner(), { wrapper });
      await flush();
      await flush();
      expect(result.current.rounds).toHaveLength(1);
      expect(result.current.agentReady).toBe(true);

      await act(() => vi.advanceTimersByTimeAsync(2_100));
      expect(session.start).not.toHaveBeenCalled();
      expect(ledgerLines()).toEqual([]);
      expect([...result.current.notAllowedHere]).toEqual(['shared']);
      act(() => result.current.runNow('shared'));
      await flush();
      expect(session.start).not.toHaveBeenCalled();

      act(() => {
        expect(result.current.allow('shared')).toBe(true);
      });
      await flush();
      await flush();
      expect(session.start).toHaveBeenCalledTimes(1);
      expect(result.current.running).toMatchObject({ roundId: 'shared', phase: 'agent' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks again when somebody else changes a round this Mac allowed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const check: RoundRecord = {
        id: 'check',
        name: 'Pages still match',
        kind: 'consistency',
        cadence: { every: 'hour' },
        enabled: true,
        onStale: 'mark',
        createdAt: '2026-09-25T00:00:00.000Z',
        nextDueAt: '2026-01-01T00:00:00.000Z',
      };
      h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [check] }));
      h.runtimes = [];
      const { result } = renderHook(() => useRoundsRunner(), { wrapper });
      await flush();
      await flush();
      act(() => {
        result.current.allow('check');
      });
      await flush();
      await flush();
      expect(ledgerLines()).toHaveLength(1);
      expect(result.current.notAllowedHere.size).toBe(0);

      await store().upsert({ ...check, onStale: 'redraft', nextDueAt: '2026-01-01T00:00:00.000Z' });
      await act(async () => {
        await result.current.refresh();
      });
      expect([...result.current.notAllowedHere]).toEqual(['check']);
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(ledgerLines()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the rounds runner', () => {
  it('ends a pass stuck in the agent handshake on Pause, keeps the round paused, and runs the next round', async () => {
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [review('first', 'Ontology refinement'), review('second', 'Second review')] }));
    h.runtimes = [READY_CLAUDE];
    const session = h.session as Session;
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await waitFor(() => expect(result.current.rounds).toHaveLength(2));
    await waitFor(() => expect(result.current.agentReady).toBe(true));
    act(() => {
      result.current.allow('first');
      result.current.allow('second');
    });

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
    act(() => {
      result.current.allow('first');
    });

    act(() => result.current.runNow('first'));
    await waitFor(() => expect(ledgerLines()).toHaveLength(1));
    expect(ledgerLines()[0]).toMatchObject({ roundId: 'first', outcome: 'failed', note: 'no-agent', agentTurns: 0, summary: '' });
    expect((h.session as Session).start).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.running).toBeNull());
  });
});

describe('the clock, the lock and the folder', () => {
  type Decision = string | { reject: string } | null;

  const at = (id: string, overrides: Partial<RoundRecord> = {}): RoundRecord => ({
    id,
    name: `Round ${id}`,
    kind: 'ontology',
    cadence: { every: 'hour' },
    enabled: true,
    query: '',
    createdAt: '2026-09-20T00:00:00.000Z',
    nextDueAt: '2026-09-28T06:00:00.000Z',
    ...overrides,
  });
  const allowHere = (record: RoundRecord) => recordApproval('round', '/vault', record.id, roundFingerprint(record));
  const lines = () => parseRoundLedger((h.ledger as RoundLedger & { text(): string | null }).text());
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  function scriptedSession(requests: Record<string, unknown>[], decisions: Decision[]) {
    return {
      status: 'ready',
      start: vi.fn(async () => {}),
      send: vi.fn(async () => {
        const options = h.options!;
        const autoDecide = options.autoDecide as (request: Record<string, unknown>) => Decision;
        const onTurnStarted = options.onTurnStarted as (turn: Record<string, unknown>) => ((completion: unknown) => void) | null;
        const start = { runtimeId: 'claude-acp', sessionId: 's-1', vaultRoot: '/vault', userEventId: 'u-1', text: 'brief', startedAt: new Date().toISOString() };
        const observer = onTurnStarted(start);
        const events: Record<string, unknown>[] = [];
        for (const request of requests) {
          const decided = autoDecide(request);
          decisions.push(decided);
          if (decided && typeof decided === 'object') events.push({ kind: 'notice', id: `n${events.length}`, text: 'auto-refused', detail: decided.reject });
          else if (typeof decided === 'string') events.push({ kind: 'notice', id: `n${events.length}`, text: 'auto-allowed', detail: decided });
        }
        events.push({ kind: 'agent', id: 'a1', text: 'Two capabilities lack a source path.' });
        observer?.({ ...start, endedAt: new Date().toISOString(), outcome: 'completed', stopReason: 'end_turn', events });
      }),
      cancel: vi.fn(),
      stop: vi.fn(async () => {}),
    };
  }

  beforeEach(() => {
    h.options = null;
    h.runtimes = [];
    h.vault = { status: 'loaded', handle: { name: 'vault' }, manifest: { docs: [], sources: [] }, agentConfigStatus: null };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-09-28T09:10:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an overdue document round for the first tick after the folder is read', async () => {
    const check = at('check', { kind: 'consistency', onStale: 'mark', nextDueAt: '2026-09-28T02:00:00.000Z' });
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [check] }));
    allowHere(check);
    h.vault = { status: 'loading', handle: { name: 'vault' }, manifest: null, agentConfigStatus: null };
    const { rerender } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await advance(2_100);
    expect(lines()).toEqual([]);
    h.vault = { status: 'loaded', handle: h.vault.handle, manifest: { docs: [], sources: [] }, agentConfigStatus: null };
    rerender();
    await advance(60_000);
    expect(lines().map((line) => [line.roundId, line.outcome, line.trigger])).toEqual([['check', 'held', 'catch-up']]);
  });

  it('does not run a round that was paused while it waited behind another pass', async () => {
    const first = at('a', { nextDueAt: '2026-09-28T08:00:00.000Z' });
    const second = at('b', { nextDueAt: '2026-09-28T09:00:00.000Z' });
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [first, second] }));
    h.runtimes = [READY_CLAUDE];
    allowHere(first);
    allowHere(second);
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await flush();
    await advance(2_100);
    expect(result.current.running?.roundId).toBe('a');
    await act(async () => {
      await result.current.setEnabled('b', false);
    });
    await act(async () => {
      await result.current.setEnabled('a', false);
    });
    await flush();
    expect(result.current.running).toBeNull();
    expect((h.session as Session).start).toHaveBeenCalledTimes(1);
    expect(lines().map((line) => [line.roundId, line.note])).toEqual([['a', 'stopped']]);
  });

  it('resumes a round whose time passed while paused at its next boundary, with no catch-up', async () => {
    const paused = at('p', { kind: 'consistency', onStale: 'mark', enabled: false, nextDueAt: '2026-09-21T09:00:00.000Z' });
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [paused] }));
    allowHere(paused);
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await advance(2_100);
    await act(async () => {
      await result.current.setEnabled('p', true);
    });
    expect(result.current.rounds[0].nextDueAt).toBe('2026-09-28T10:00:00.000Z');
    await advance(60_000);
    expect(lines()).toEqual([]);
  });

  it('gives the lock back and throws nothing when the folder disappears mid-pass', async () => {
    let gone = false;
    const disk = { rounds: JSON.stringify({ v: 1, rounds: [at('o', { nextDueAt: '2099-01-01T00:00:00.000Z' })] }), ledger: '' };
    const missing = () => {
      if (gone) throw 'No such file or directory (os error 2)';
    };
    h.store = createRoundStore({
      read: async () => {
        missing();
        return disk.rounds;
      },
      write: async (text) => {
        missing();
        disk.rounds = text;
      },
    });
    h.ledger = {
      read: async () => {
        missing();
        return parseRoundLedger(disk.ledger);
      },
      append: async (entry: RoundPassEntry) => {
        missing();
        disk.ledger += `${JSON.stringify(entry)}\n`;
      },
      text: () => disk.ledger,
    };
    h.runtimes = [READY_CLAUDE];
    h.session = scriptedSession([], []);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { result } = renderHook(() => useRoundsRunner(), { wrapper });
      await flush();
      await flush();
      allowHere(at('o', { nextDueAt: '2099-01-01T00:00:00.000Z' }));
      gone = true;
      act(() => result.current.runNow('o'));
      await flush();
      await advance(10_000);
      expect(result.current.running).toBeNull();
      expect(result.current.storeStatus).toBe('unavailable');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('moves a next run left by another time zone onto this clock and keeps it there while an hourly round runs beside it', async () => {
    const zone = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      vi.setSystemTime(new Date('2026-09-29T18:00:00.000Z'));
      const morning = at('m', { kind: 'consistency', onStale: 'mark', cadence: { daily: '09:00', weekdaysOnly: false }, nextDueAt: '2026-09-30T00:00:00.000Z' });
      const hourly = at('h', { kind: 'consistency', onStale: 'mark', nextDueAt: '2026-09-29T19:00:00.000Z' });
      h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [morning, hourly] }));
      allowHere(morning);
      allowHere(hourly);
      const { result } = renderHook(() => useRoundsRunner(), { wrapper });
      await flush();
      await flush();
      expect(result.current.rounds.find((round) => round.id === 'm')?.nextDueAt).toBe('2026-09-30T07:00:00.000Z');
      expect((await store().read()).state.rounds.find((round) => round.id === 'm')?.nextDueAt).toBe('2026-09-30T07:00:00.000Z');
      await advance(7 * 60 * 60_000);
      expect(lines().filter((line) => line.roundId === 'h').length).toBeGreaterThan(0);
      expect(lines().filter((line) => line.roundId === 'm')).toEqual([]);
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });

  it('moves the schedule on when the run history cannot be written, runs the window once, and says so on the round', async () => {
    const check = at('c', { kind: 'consistency', onStale: 'mark', nextDueAt: '2026-09-28T09:00:00.000Z' });
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [check] }));
    const append = vi.fn(async () => {
      throw new Error('ledger locked by a sync client');
    });
    h.ledger = { read: async () => [], append };
    allowHere(check);
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await flush();
    await advance(2_100 + 4 * 60_000);
    expect(append).toHaveBeenCalledTimes(1);
    const saved = (await store().read()).state.rounds[0];
    expect(saved.lastPassAt).toBeDefined();
    expect(saved.nextDueAt).toBe('2026-09-28T10:00:00.000Z');
    expect(result.current.unrecorded.get('c')).toMatchObject({ outcome: 'held', files: ['.ontology-atlas/rounds-ledger.jsonl'] });
  });

  it('holds the next time on this Mac when rounds.json refuses the write, so the window still runs once', async () => {
    const check = at('c', { kind: 'consistency', onStale: 'mark', nextDueAt: '2026-09-28T09:00:00.000Z' });
    const text = JSON.stringify({ v: 1, rounds: [check] });
    h.store = createRoundStore({
      read: async () => text,
      write: async () => {
        throw new Error('read-only volume');
      },
    });
    allowHere(check);
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await flush();
    await advance(2_100 + 4 * 60_000);
    expect(lines().map((line) => [line.roundId, line.trigger])).toEqual([['c', 'catch-up']]);
    expect(result.current.rounds[0].nextDueAt).toBe('2026-09-28T10:00:00.000Z');
    expect(result.current.unrecorded.get('c')).toMatchObject({ files: ['.ontology-atlas/rounds.json'] });
  });

  it('refuses every write an ontology review asks for and names each in the ledger', async () => {
    const reviewRound = at('review', { nextDueAt: '2099-01-01T00:00:00.000Z' });
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [reviewRound] }));
    h.runtimes = [READY_CLAUDE];
    allowHere(reviewRound);
    const writes = [
      { filePath: '/vault/capabilities/checkout.md', toolName: 'Write', toolKind: 'edit', rawInput: {}, reviewKind: 'permission' },
      { filePath: '/vault/wiki/checkout.md', toolName: 'Edit', toolKind: 'edit', rawInput: {}, reviewKind: 'permission' },
      { filePath: null, toolName: 'mcp__atlas-vault__add_concept', toolKind: 'other', rawInput: {}, reviewKind: 'ontology-write' },
      { filePath: null, toolName: 'Bash', toolKind: 'execute', rawInput: {}, reviewKind: 'permission' },
    ];
    const reads = [
      { filePath: null, toolName: 'mcp__atlas-vault__list_concepts', toolKind: 'read', rawInput: {}, reviewKind: 'permission' },
      { filePath: '/vault/capabilities/checkout.md', toolName: 'Read', toolKind: 'read', rawInput: {}, reviewKind: 'permission' },
    ];
    const decisions: Decision[] = [];
    h.session = scriptedSession([...writes, ...reads], decisions);
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await flush();
    act(() => result.current.runNow('review'));
    await flush();
    await advance(6_000);
    expect(decisions.slice(writes.length)).toEqual(['call mcp__atlas-vault__list_concepts', 'read capabilities/checkout.md']);
    expect(lines()[0]).toMatchObject({
      outcome: 'refused',
      written: [],
      refused: ['capabilities/checkout.md', 'wiki/checkout.md', 'mcp__atlas-vault__add_concept', 'Bash'],
    });
  });

  it('edits a schedule in place: same id, its history kept, the next run recomputed, and this Mac allowing the new version', async () => {
    const check = at('e', { kind: 'consistency', onStale: 'mark', lastPassAt: '2026-09-28T08:00:00.000Z', nextDueAt: '2026-09-28T10:00:00.000Z' });
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [check] }));
    h.ledger = createMemoryRoundLedger(`${JSON.stringify({ v: 1, id: 'old', roundId: 'e', roundName: 'Round e', kind: 'consistency', startedAt: '2026-09-28T08:00:00.000Z', endedAt: '2026-09-28T08:00:01.000Z', outcome: 'held', checked: 3, stale: [], written: [], refused: [], called: [], agentTurns: 0, summary: '', trigger: 'clock' })}\n`);
    allowHere(check);
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await flush();
    let ok = false;
    const morning = { daily: '07:30', weekdaysOnly: false };
    const nextRun = nextDueAt(morning, new Date()).toISOString();
    await act(async () => {
      ok = await result.current.update({ ...check, name: 'Morning check', cadence: morning, onStale: 'redraft', nextDueAt: nextRun });
    });
    expect(ok).toBe(true);
    const saved = (await store().read()).state.rounds;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'e', name: 'Morning check', cadence: morning, onStale: 'redraft', createdAt: check.createdAt, lastPassAt: check.lastPassAt, nextDueAt: nextRun });
    expect(result.current.notAllowedHere.size).toBe(0);
    expect(result.current.ledger.map((entry) => entry.roundId)).toEqual(['e']);
  });

  it('stops a pass in flight when an edit changes what the schedule may do', async () => {
    const review = at('r', { nextDueAt: '2099-01-01T00:00:00.000Z' });
    h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [review] }));
    h.runtimes = [READY_CLAUDE];
    allowHere(review);
    const { result } = renderHook(() => useRoundsRunner(), { wrapper });
    await flush();
    await flush();
    act(() => result.current.runNow('r'));
    await flush();
    expect(result.current.running?.roundId).toBe('r');
    const nextSix = nextDueAt({ every: '6h' }, new Date()).toISOString();
    await act(async () => {
      await result.current.update({ ...review, cadence: { every: '6h' }, nextDueAt: nextSix });
    });
    await flush();
    expect(result.current.running).toBeNull();
    expect(lines().map((line) => [line.roundId, line.note])).toEqual([['r', 'stopped']]);
    expect((await store().read()).state.rounds[0]).toMatchObject({ cadence: { every: '6h' }, nextDueAt: nextSix });
  });

  describe('a document pass judges each write against the page as its earlier writes left it', () => {
    const PAGE = '/vault/wiki/plan.md';
    const onDisk = WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/plan.pdf');
    const lead = '<Two or three sentences. What a reader needs before the facts.>';
    const serviceRound = at('svc', {
      kind: 'service',
      connectorId: 'c1',
      connectorName: 'confluence',
      nextDueAt: '2099-01-01T00:00:00.000Z',
      places: [{ kind: 'vault', paths: [] }, { kind: 'service', connectorId: 'c1', connectorName: 'confluence' }],
    });
    const write = (path: string, content: string) => ({ filePath: path, toolName: 'Write', toolKind: 'edit', rawInput: { file_path: path, content }, reviewKind: 'permission' });
    const edit = (path: string, oldString: string, newString: string) => ({ filePath: path, toolName: 'Edit', toolKind: 'edit', rawInput: { file_path: path, old_string: oldString, new_string: newString }, reviewKind: 'permission' });

    async function pass(requests: Record<string, unknown>[]) {
      h.pages = [{ slug: 'wiki/plan' }];
      h.files = { 'wiki/plan.md': onDisk };
      h.vault = { status: 'loaded', handle: { name: 'vault' }, manifest: { docs: [], sources: [{ path: 'sources/plan.pdf' }] }, agentConfigStatus: null };
      h.store = createMemoryRoundStore(JSON.stringify({ v: 1, rounds: [serviceRound] }));
      h.runtimes = [READY_CLAUDE];
      allowHere(serviceRound);
      const decisions: Decision[] = [];
      h.session = scriptedSession(requests, decisions);
      const { result } = renderHook(() => useRoundsRunner(), { wrapper });
      await flush();
      await flush();
      act(() => result.current.runNow('svc'));
      await flush();
      await advance(6_000);
      return decisions;
    }

    afterEach(() => {
      h.pages = [];
      h.files = {};
    });

    it('refuses an edit that would make the page an earlier write left in this pass read as reviewed', async () => {
      const moved = onDisk.replace('summary: <one sentence about what this page is about>', `summary: ${lead}`).replace(`\n${lead}\n`, '\nA reader needs this first.\n');
      const decisions = await pass([
        write(PAGE, moved),
        edit(PAGE, lead, `${lead}\nstatus: reviewed\ndescribes: [capabilities/checkout]`),
      ]);
      expect(decisions).toEqual(['write wiki/plan.md', { reject: 'wiki/plan.md' }]);
    });

    it('still allows a later edit that keeps the page a draft', async () => {
      const decisions = await pass([
        write(PAGE, onDisk.replace('<Anything you could not ground in a source. It goes here and nowhere else.>', 'Nothing yet.')),
        edit(PAGE, 'Nothing yet.', 'Pricing is not in the sources.'),
      ]);
      expect(decisions).toEqual(['write wiki/plan.md', 'write wiki/plan.md']);
    });

    it('counts a document the pass brought in as a known source for the page that cites it', async () => {
      const decisions = await pass([
        write('/vault/sources/refunds.md', '---\nsource_url: https://example.atlassian.net/wiki/9\n---\n# Refunds\n'),
        write('/vault/wiki/refunds.md', WIKI_PAGE_TEMPLATE.replace(/sources\/<file>/g, 'sources/refunds.md')),
      ]);
      expect(decisions).toEqual(['write sources/refunds.md', 'write wiki/refunds.md']);
    });
  });
});
