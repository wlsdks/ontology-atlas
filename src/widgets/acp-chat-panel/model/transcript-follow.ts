import { MOTION } from '@/shared/motion';

/**
 * Follow the transcript's end only while the person is there: any upward move stops it and only a
 * return to the end resumes it. The follower glides itself, never through `scroll-behavior`, so its
 * own scroll events cannot be mistaken for the person's.
 */

export interface ScrollBox {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export interface FollowState {
  readonly following: boolean;
  /** Last offset seen, by a scroll event or the follower's own write. */
  readonly lastTop: number;
}

export const FOLLOWING: FollowState = { following: true, lastTop: 0 };

const END_SLACK_PX = 2;
/** A downward scroll that stops within a line of the end has come back to it. */
const RETURN_SLACK_PX = 24;
const MOVE_EPSILON_PX = 0.5;
const GLIDE_TIME_CONSTANT_MS = (MOTION.base.duration * 1000) / 3;

export function distanceFromEnd(box: ScrollBox): number {
  return Math.max(0, box.scrollHeight - box.clientHeight - box.scrollTop);
}

export function afterScroll(state: FollowState, box: ScrollBox, grownPx = 0): FollowState {
  const top = box.scrollTop;
  const distance = distanceFromEnd(box);
  if (top < state.lastTop - MOVE_EPSILON_PX) {
    // Up never starts a follow; at the end it is a clamp, which keeps the state.
    return { following: state.following && distance <= END_SLACK_PX, lastTop: top };
  }
  // Only a move down resumes: a stop's own pending scroll event lands where the box already was.
  if (top > state.lastTop + MOVE_EPSILON_PX && distance <= RETURN_SLACK_PX + Math.max(0, grownPx)) {
    return { following: true, lastTop: top };
  }
  return { following: state.following, lastTop: top };
}

/** Upward intent arrives before the box moves; the next chunk must not win. */
export function afterUpwardIntent(state: FollowState, box: ScrollBox): FollowState {
  if (box.scrollTop <= 0 || box.scrollHeight <= box.clientHeight) return state;
  return { ...state, following: false };
}

/** Engines snap offsets, so the follower records where its write landed. */
export function afterWrite(state: FollowState, landedTop: number): FollowState {
  return { ...state, lastTop: landedTop };
}

export function resumeFollowing(state: FollowState): FollowState {
  return { ...state, following: true };
}

/**
 * This frame's position, or `null` to leave the box: a restore, reduced motion or a gap over one
 * viewport lands at once; a smaller gap glides. No step is under a pixel or leaves one behind.
 */
export function followStep(
  box: ScrollBox,
  options: { instant: boolean; elapsedMs: number },
): number | null {
  const target = Math.max(0, box.scrollHeight - box.clientHeight);
  const gap = target - box.scrollTop;
  if (gap <= MOVE_EPSILON_PX) return null;
  if (options.instant || gap > box.clientHeight || gap <= 1) return target;
  const share = 1 - Math.exp(-Math.max(0, options.elapsedMs) / GLIDE_TIME_CONSTANT_MS);
  const next = box.scrollTop + Math.max(1, gap * share);
  return target - next < 1 ? target : next;
}

export function showsJump(state: FollowState, box: ScrollBox): boolean {
  return !state.following && distanceFromEnd(box) > RETURN_SLACK_PX;
}
