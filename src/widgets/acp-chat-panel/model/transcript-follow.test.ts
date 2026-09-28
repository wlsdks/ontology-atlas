import { describe, expect, it } from 'vitest';

import {
  FOLLOWING,
  afterScroll,
  afterUpwardIntent,
  afterWrite,
  distanceFromEnd,
  followStep,
  resumeFollowing,
  showsJump,
  type FollowState,
  type ScrollBox,
} from './transcript-follow';

const box = (scrollTop: number, scrollHeight = 5_000, clientHeight = 600): ScrollBox => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});
const END = 4_400;
const following = (lastTop: number): FollowState => ({ following: true, lastTop });
const reading = (lastTop: number): FollowState => ({ following: false, lastTop });

describe('distanceFromEnd', () => {
  it('measures what is below the fold and never goes negative', () => {
    expect(distanceFromEnd(box(END))).toBe(0);
    expect(distanceFromEnd(box(4_000))).toBe(400);
    expect(distanceFromEnd(box(0, 300, 600))).toBe(0);
  });
});

describe('a person scrolling up stops the follow', () => {
  it('stops at the first upward scroll, however small, while the tail is still in view', () => {
    expect(afterScroll(following(END), box(END - 6)).following).toBe(false);
  });

  it('stops on upward intent before the box has moved', () => {
    expect(afterUpwardIntent(following(END), box(END)).following).toBe(false);
  });

  it('ignores upward intent when there is nothing above to scroll to', () => {
    expect(afterUpwardIntent(following(0), box(0, 400, 600)).following).toBe(true);
    expect(afterUpwardIntent(following(0), box(0)).following).toBe(true);
  });

  it('stays stopped when the follower’s own pending scroll arrives after the stop', () => {
    const stopped = afterUpwardIntent(following(END - 11), box(END - 11));
    expect(afterScroll(stopped, box(END - 11)).following).toBe(false);
  });

  it('stays stopped while the person scrolls down short of the end', () => {
    expect(afterScroll(reading(3_000), box(3_900)).following).toBe(false);
  });

  it('does not resume on an upward move that happens to end near the tail', () => {
    // A box at its end is clamped when content shrinks; that keeps the state.
    expect(afterScroll(reading(END), box(END - 1, 4_999)).following).toBe(false);
    expect(afterScroll(following(END), box(END - 40, 4_960)).following).toBe(true);
  });
});

describe('returning to the end resumes the follow', () => {
  it('resumes when a downward scroll reaches the end', () => {
    expect(afterScroll(reading(3_000), box(END))).toEqual({ following: true, lastTop: END });
  });

  it('resumes when the person stops within a line of the end', () => {
    expect(afterScroll(reading(3_000), box(END - 6)).following).toBe(true);
    expect(afterScroll(reading(3_000), box(END - 40)).following).toBe(false);
  });

  it('resumes on the explicit door without touching the recorded position', () => {
    expect(resumeFollowing(reading(1_234))).toEqual({ following: true, lastTop: 1_234 });
  });
});

describe('the follower moving the box itself', () => {
  it('records where it left the box, so its own scroll event is not read as the person', () => {
    const moved = afterWrite(following(4_000), 4_100);
    expect(moved.lastTop).toBe(4_100);
    expect(afterScroll(moved, box(4_100)).following).toBe(true);
  });
});

describe('followStep — distance decides how the transcript follows (2026-09-06)', () => {
  const frame = 1000 / 60;

  it('glides part of the way when the new text is within one viewport', () => {
    const top = followStep(box(END - 200), { instant: false, elapsedMs: frame });
    expect(top).not.toBeNull();
    expect(top!).toBeGreaterThan(END - 200);
    expect(top!).toBeLessThan(END);
  });

  it('reaches the end within the base motion duration', () => {
    let top = END - 300;
    let elapsed = 0;
    while (elapsed < 180) {
      top = followStep(box(top), { instant: false, elapsedMs: frame }) ?? top;
      elapsed += frame;
    }
    expect(distanceFromEnd(box(top))).toBeLessThanOrEqual(300 * 0.05 + 1);
  });

  it('jumps when the new text is more than one viewport away', () => {
    expect(followStep(box(END - 601), { instant: false, elapsedMs: frame })).toBe(END);
  });

  it('jumps under reduced motion or on a restore', () => {
    expect(followStep(box(END - 200), { instant: true, elapsedMs: frame })).toBe(END);
  });

  it('ends a glide exactly on the end, never a fraction of a pixel short', () => {
    for (const elapsedMs of [3.7, frame, 9.1, 23.4]) {
      let top = END - 200;
      for (let steps = 0; steps < 200; steps += 1) {
        const next = followStep(box(top), { instant: false, elapsedMs });
        if (next === null) break;
        top = next;
      }
      expect(top).toBe(END);
    }
  });

  it('always makes progress, so a snapped offset cannot stall the glide', () => {
    const top = followStep(box(END - 3), { instant: false, elapsedMs: 0.001 });
    expect(top).toBeGreaterThanOrEqual(END - 2);
  });

  it('leaves a box that is already at its end alone', () => {
    expect(followStep(box(END), { instant: false, elapsedMs: frame })).toBeNull();
    expect(followStep(box(0, 300, 600), { instant: true, elapsedMs: frame })).toBeNull();
  });
});

describe('showsJump', () => {
  it('stands only for a person who left the end and has text below', () => {
    expect(showsJump(reading(3_000), box(3_000))).toBe(true);
    expect(showsJump(following(3_000), box(3_000))).toBe(false);
    expect(showsJump(reading(END), box(END))).toBe(false);
  });

  it('starts out following', () => {
    expect(FOLLOWING.following).toBe(true);
  });
});
