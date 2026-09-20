import { describe, expect, it } from 'vitest';

import { type RoundRecord, serializeRoundState } from './round-record';
import { createMemoryRoundStore, createRoundStore } from './round-store';

function round(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: 'r1',
    name: 'Pages still match',
    kind: 'consistency',
    cadence: { every: 'hour' },
    enabled: true,
    createdAt: '2026-09-17T00:00:00.000Z',
    nextDueAt: '2026-09-17T01:00:00.000Z',
    ...overrides,
  };
}

describe('round store', () => {
  it('starts empty, then upserts, patches and removes by id', async () => {
    const store = createMemoryRoundStore();
    expect((await store.read()).status).toBe('missing');

    const saved = await store.upsert(round());
    expect(saved.status).toBe('saved');
    expect(saved.state.rounds).toHaveLength(1);

    const patched = await store.patch('r1', { enabled: false, lastPassAt: '2026-09-17T01:00:00.000Z' });
    expect(patched.state.rounds[0]).toMatchObject({ enabled: false, lastPassAt: '2026-09-17T01:00:00.000Z' });

    const replaced = await store.upsert(round({ name: 'renamed' }));
    expect(replaced.state.rounds).toHaveLength(1);
    expect(replaced.state.rounds[0].name).toBe('renamed');

    const removed = await store.remove('r1');
    expect(removed.state.rounds).toEqual([]);
  });

  it('refuses to write over a file it could not read', async () => {
    const store = createMemoryRoundStore('{ not json');
    const result = await store.upsert(round());
    expect(result.status).toBe('blocked_malformed');
    expect(store.text()).toBe('{ not json');
  });

  it('reports an unreadable medium and writes nothing', async () => {
    const store = createRoundStore({
      read: async () => {
        throw new Error('disk');
      },
      write: async () => {
        throw new Error('should not write');
      },
    });
    expect((await store.read()).status).toBe('unavailable');
    expect((await store.upsert(round())).status).toBe('blocked_unavailable');
  });

  it('serializes concurrent mutations so neither is lost', async () => {
    const store = createMemoryRoundStore(serializeRoundState({ v: 1, rounds: [] }));
    await Promise.all([store.upsert(round({ id: 'a' })), store.upsert(round({ id: 'b' }))]);
    const state = (await store.read()).state;
    expect(state.rounds.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('opens an absence once, and closes it into the last completed span', async () => {
    const store = createMemoryRoundStore();
    await store.upsert(round());
    const away = await store.markAway('2026-09-16T18:30:00.000Z');
    expect(away.state.awayFrom).toBe('2026-09-16T18:30:00.000Z');
    expect(away.state.rounds).toHaveLength(1);
    // A second hide while already away keeps the first moment: the span starts when they left.
    const again = await store.markAway('2026-09-16T19:00:00.000Z');
    expect(again.state.awayFrom).toBe('2026-09-16T18:30:00.000Z');
    const back = await store.markBack('2026-09-17T09:02:00.000Z');
    expect(back.state.awayFrom).toBeUndefined();
    expect(back.state.lastAway).toEqual({ from: '2026-09-16T18:30:00.000Z', to: '2026-09-17T09:02:00.000Z' });
    expect(store.text()).not.toContain('awayFrom');
    // Back without an open absence changes nothing.
    const noop = await store.markBack('2026-09-17T09:03:00.000Z');
    expect(noop.state.lastAway?.to).toBe('2026-09-17T09:02:00.000Z');
  });

  it('does not believe an absence left behind by a crash: the span starts at the last pass', async () => {
    // Written by a process that went hidden and never came back; the pass that ran afterwards
    // is the folder's own proof the app was awake long after that moment.
    const store = createMemoryRoundStore(
      serializeRoundState({
        v: 1,
        rounds: [round({ lastPassAt: '2026-09-17T08:00:00.000Z' })],
        awayFrom: '2026-09-14T22:00:00.000Z',
      }),
    );
    const back = await store.markBack('2026-09-17T09:02:00.000Z');
    expect(back.state.awayFrom).toBeUndefined();
    expect(back.state.lastAway).toEqual({ from: '2026-09-17T08:00:00.000Z', to: '2026-09-17T09:02:00.000Z' });
  });

  it('falls back to this process when nothing else dates the stale absence', async () => {
    const constructedAfter = Date.now();
    const store = createMemoryRoundStore(serializeRoundState({ v: 1, rounds: [round()], awayFrom: '2020-01-01T00:00:00.000Z' }));
    const at = new Date(Date.now() + 1_000).toISOString();
    const back = await store.markBack(at);
    expect(back.state.lastAway?.to).toBe(at);
    expect(Date.parse(back.state.lastAway!.from)).toBeGreaterThanOrEqual(constructedAfter);
  });
});
