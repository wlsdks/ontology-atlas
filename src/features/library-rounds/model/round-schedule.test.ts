import { describe, expect, it } from 'vitest';

import type { RoundRecord } from '@/entities/library-round';

import { afterPass, planTick, triggerFor } from './round-schedule';

function round(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: 'r1',
    name: 'Pages still match',
    kind: 'consistency',
    cadence: { every: 'hour' },
    enabled: true,
    createdAt: '2026-09-17T00:00:00.000Z',
    nextDueAt: '2026-09-17T09:00:00.000Z',
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);

describe('plan tick', () => {
  it('runs nothing while a pass is running, even when rounds are due', () => {
    const plan = planTick({ rounds: [round()], now: at('2026-09-17T09:00:30Z'), lastTickAt: at('2026-09-17T08:59:30Z'), running: true });
    expect(plan.due).toEqual([]);
    expect(plan.asleep).toBeNull();
  });

  it('puts a consistency round before a service round when both are due', () => {
    const service = round({ id: 's', kind: 'service', connectorId: 'c', nextDueAt: '2026-09-17T08:00:00.000Z' });
    const local = round({ id: 'l', nextDueAt: '2026-09-17T09:00:00.000Z' });
    const plan = planTick({ rounds: [service, local], now: at('2026-09-17T09:00:30Z'), lastTickAt: at('2026-09-17T08:59:30Z'), running: false });
    expect(plan.due.map((r) => r.id)).toEqual(['l', 's']);
  });

  it('skips a paused round and one not yet due', () => {
    const paused = round({ id: 'p', enabled: false });
    const later = round({ id: 'x', nextDueAt: '2026-09-17T10:00:00.000Z' });
    const plan = planTick({ rounds: [paused, later, round()], now: at('2026-09-17T09:00:30Z'), lastTickAt: null, running: false });
    expect(plan.due.map((r) => r.id)).toEqual(['r1']);
  });

  it('records one asleep gap when the clock jumped, and still runs what is due', () => {
    const plan = planTick({ rounds: [round()], now: at('2026-09-17T08:55:00Z'), lastTickAt: at('2026-09-17T01:12:00Z'), running: false });
    expect(plan.asleep).toEqual({ from: at('2026-09-17T01:12:00Z'), to: at('2026-09-17T08:55:00Z') });
    expect(plan.due).toEqual([]);
    const late = planTick({ rounds: [round({ nextDueAt: '2026-09-17T02:00:00.000Z' })], now: at('2026-09-17T08:55:00Z'), lastTickAt: at('2026-09-17T01:12:00Z'), running: false });
    expect(late.due).toHaveLength(1);
  });

  it('a gap shorter than three ticks is not sleep', () => {
    const plan = planTick({ rounds: [], now: at('2026-09-17T09:02:59Z'), lastTickAt: at('2026-09-17T09:00:00Z'), running: false });
    expect(plan.asleep).toBeNull();
  });
});

describe('after a pass', () => {
  it('a late run catches up once: the next due time is the first boundary after now', () => {
    const r = round({ nextDueAt: new Date(2026, 8, 17, 2, 0).toISOString() });
    const now = new Date(2026, 8, 17, 8, 55);
    expect(triggerFor(r, now)).toBe('catch-up');
    const next = afterPass(r, now);
    expect(next.lastPassAt).toBe(now.toISOString());
    expect(new Date(next.nextDueAt)).toEqual(new Date(2026, 8, 17, 9, 0));
  });

  it('an on-time run is on the clock', () => {
    const r = round({ nextDueAt: new Date(2026, 8, 17, 9, 0).toISOString() });
    expect(triggerFor(r, new Date(2026, 8, 17, 9, 0, 40))).toBe('clock');
  });
});
