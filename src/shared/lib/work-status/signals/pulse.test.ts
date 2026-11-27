import { describe, expect, it } from 'vitest';
import type { FilePulseRead, WorktreePulse } from '../tauri-work-status';
import { buildWorkTracks, planRooms } from '../work-tracks';
import { DOZE_AFTER_MS } from '../work-tracks';
import {
  FLASH_MIN_GAP_MS,
  PULSE_HOUR_MS,
  PULSE_STEP_MS,
  changesWithoutAgent,
  nextFlashes,
  pulseFactsOf,
  tickHeightOf,
  withChangeSigns,
  type FlashMark,
} from './pulse';

const NOW_MS = 1_795_300_000_000;

const pulse = (lastChangeAtMs: number | null, steps: WorktreePulse['steps'] = [], watched = true): WorktreePulse => ({ watched, lastChangeAtMs, steps });
const answer = (worktrees: Record<string, WorktreePulse>): FilePulseRead => ({ worktrees });

describe('pulseFactsOf', () => {
  it('counts the last minute and the last hour, and draws a tick per step in three heights', () => {
    const steps = [
      { atMs: NOW_MS - PULSE_HOUR_MS - PULSE_STEP_MS, count: 50 },
      { atMs: NOW_MS - 30 * 60_000, count: 1 },
      { atMs: NOW_MS - 5 * 60_000, count: 4 },
      { atMs: NOW_MS - 20_000, count: 99 },
    ];
    const facts = pulseFactsOf(pulse(NOW_MS - 15_000, steps), NOW_MS);
    expect(facts).toMatchObject({ changedJustNow: true, lastMinute: 99, lastHour: 104, watched: true });
    expect(facts.ticks.map(tick => tick.height)).toEqual([1, 2, 3]);
  });

  it('says nothing changed just now once the last change is a minute old', () => {
    const facts = pulseFactsOf(pulse(NOW_MS - 60_000, [{ atMs: NOW_MS - 70_000, count: 2 }]), NOW_MS);
    expect(facts).toMatchObject({ changedJustNow: false, lastMinute: 0, lastHour: 2 });
  });

  it('keeps a folder macOS cannot watch apart, with no count', () => {
    expect(pulseFactsOf(pulse(null, [], false), NOW_MS)).toMatchObject({ watched: false, lastHour: 0, ticks: [] });
  });

  it('gives a tick its height by count: 1, 2 to 5, 6 or more', () => {
    expect([1, 2, 5, 6, 99].map(tickHeightOf)).toEqual([1, 2, 2, 3, 3]);
  });
});

describe('changesWithoutAgent', () => {
  it('speaks only for a room where no agent program is at work', () => {
    const facts = pulseFactsOf(pulse(NOW_MS - 1000), NOW_MS);
    expect(changesWithoutAgent(facts, false)).toBe(true);
    expect(changesWithoutAgent(facts, true)).toBe(false);
  });
});

describe('nextFlashes', () => {
  it('flashes a room only for an answer that carries a new change for it, never for the first', () => {
    const first = nextFlashes(new Map(), answer({ a: pulse(NOW_MS - 5000), b: pulse(null) }), NOW_MS);
    expect(first.get('a')?.count).toBe(0);

    const same = nextFlashes(first, answer({ a: pulse(NOW_MS - 5000), b: pulse(null) }), NOW_MS + 2000);
    expect(same).toBe(first);

    const changed = nextFlashes(same, answer({ a: pulse(NOW_MS + 3000), b: pulse(null) }), NOW_MS + 4000);
    expect(changed.get('a')?.count).toBe(1);
    expect(changed.get('b')).toBe(first.get('b'));
  });

  it('flashes once for a burst of five changes in ten seconds, and never later for the burst', () => {
    let marks: ReadonlyMap<string, FlashMark> = nextFlashes(new Map(), answer({ a: pulse(null) }), 0);
    for (const atMs of [1000, 3000, 5500, 8000, 11_000]) marks = nextFlashes(marks, answer({ a: pulse(atMs) }), atMs + 500);
    expect(marks.get('a')?.count).toBe(1);
    marks = nextFlashes(marks, answer({ a: pulse(11_000) }), 1500 + FLASH_MIN_GAP_MS + 2000);
    expect(marks.get('a')?.count).toBe(1);
  });

  it('flashes again for a change sixteen seconds after the last flash', () => {
    let marks: ReadonlyMap<string, FlashMark> = nextFlashes(new Map(), answer({ a: pulse(null) }), 0);
    marks = nextFlashes(marks, answer({ a: pulse(1000) }), 1500);
    marks = nextFlashes(marks, answer({ a: pulse(17_000) }), 17_500);
    expect(marks.get('a')?.count).toBe(2);
  });

  it('counts a change in room A for A and for no other of 40 rooms', () => {
    const rooms = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`w${index}`, pulse(null)]));
    const before = nextFlashes(new Map(), answer(rooms), 0);
    const after = nextFlashes(before, answer({ ...rooms, w7: pulse(500) }), 2000);
    const flashed = [...after].filter(([, mark]) => mark.count > 0).map(([key]) => key);
    expect(flashed).toEqual(['w7']);
  });
});

describe('withChangeSigns', () => {
  it('keeps a held room from dozing while files change in it, and promotes no room', () => {
    const snapshot = {
      status: 'ready' as const, root: '/repo', repository: 'repo', host: null, baseBranch: 'main',
      worktrees: [{
        id: 'held', path: '/repo/held', branch: 'feat/held', head: 'a', mainCheckout: false, missing: false, standing: 'ahead' as const,
        ahead: 1, lastCommitAt: (NOW_MS - DOZE_AFTER_MS * 2) / 1000, lastCommitAuthor: null,
        lock: { state: 'live' as const, tool: 'claudeCode' as const, agentId: 'a1', pid: 9, sessionStartedAt: 1, lockedAt: NOW_MS - DOZE_AFTER_MS * 2 },
        acpPid: null, agentProcesses: [],
      }],
    };
    const tracks = buildWorkTracks(snapshot);
    const roomState = (signs: ReadonlyMap<string, number>) => planRooms(tracks, NOW_MS, signs).stage.find(room => room.key === 'held')?.state.kind;
    expect(roomState(new Map())).toBe('dozing');
    const signs = withChangeSigns(new Map(), new Map([['held', pulse(NOW_MS - 30_000)]]));
    expect(roomState(signs)).toBe('resting');
  });

  it('returns the same map when no change is newer than a running program seen', () => {
    const seen = new Map([['a', NOW_MS]]);
    expect(withChangeSigns(seen, new Map([['a', pulse(NOW_MS - 1)], ['b', pulse(null)]]))).toBe(seen);
  });
});
