import { describe, expect, it } from 'vitest';
import { ACTIVITY_BEAT_MS, ACTIVITY_MIN_GAP_MS, activityDue, beatFor } from './use-worktree-activity';

describe('activityDue', () => {
  const read = { atMs: 0, stamp: 's1' };

  it('reads a worktree first, then only when its stamp moves or its beat comes', () => {
    expect(activityDue(undefined, 's1', null, 0)).toBe(true);
    expect(activityDue(read, 's1', null, ACTIVITY_BEAT_MS * 10)).toBe(false);
    expect(activityDue(read, 's2', null, ACTIVITY_MIN_GAP_MS)).toBe(true);
    expect(activityDue(read, 's1', ACTIVITY_BEAT_MS, ACTIVITY_BEAT_MS)).toBe(true);
    expect(activityDue(read, 's1', ACTIVITY_BEAT_MS, ACTIVITY_BEAT_MS - 1)).toBe(false);
  });

  it('never reads one worktree twice within ten seconds, however its stamp moves', () => {
    expect(activityDue(read, 's2', ACTIVITY_BEAT_MS, ACTIVITY_MIN_GAP_MS - 1)).toBe(false);
  });

  it('reads a worktree again once a file change is counted after its last read, still not within ten seconds', () => {
    expect(activityDue(read, 's1', null, ACTIVITY_MIN_GAP_MS, 1)).toBe(true);
    expect(activityDue(read, 's1', null, ACTIVITY_MIN_GAP_MS, 0)).toBe(false);
    expect(activityDue(read, 's1', null, ACTIVITY_MIN_GAP_MS - 1, 1)).toBe(false);
  });

  it('shares about four beat reads a minute across every running worktree', () => {
    for (const running of [1, 6, 40]) expect(running * (60_000 / beatFor(running))).toBeLessThanOrEqual(4);
  });
});
