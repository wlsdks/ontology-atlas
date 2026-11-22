import { PIXEL_BEAT_MS } from './pixel-beat';

/**
 * Turns for the pixel cast of one screen. Every visible step costs the page one rendering update,
 * about 0.7 % CPU in WKWebView for each update a second whatever it draws, so a screen whose cast
 * moves all the time cannot stay quiet. The cast moves, then rests: on arrival, and on a return to
 * the window, everybody is lively for a while; after that one actor at a time (a room's Moru, or the
 * lobby with one walk or one pair) takes a short turn and the screen rests between turns. Turns are
 * granted only while the time anything moved in the last minute leaves room for one more, so the
 * cast moves at most a quarter of any minute, less in a window that is not key. What an observed
 * event plays (a commit, a state change) cuts in at once and takes no turn; its motion still counts.
 * Motion is counted as a viewer sees it: a pose shows from its change until the next, up to `HELD_MS`.
 */

/** How long the cast is lively on arrival and on a return to the window. */
export const LIVELY_MS = 15_000;
/**
 * The most of any minute the cast moves in the key window, and in one that is not. A turn is granted
 * only while the last minute's motion and a whole turn stay within four fifths of it, since a turn may
 * run past its reserve (a walk through a doorway finishes) and a resting floor still blinks.
 */
export const MOTION_SHARE = 0.25;
export const MOTION_SHARE_AWAY = 0.15;
const GRANT_SHARE = 0.8;
export const SHARE_WINDOW_MS = 60_000;
/** A turn is one short thing; an actor that is still moving after this finishes its step and stops. */
export const TURN_MS = 5_000;
/** The room in the budget a turn needs before it is granted. */
const TURN_ROOM_MS = TURN_MS;
/** A pose held longer than this after a change reads as still. */
const HELD_MS = 4 * PIXEL_BEAT_MS;
/** The least rest between two turns. */
export const REST_MS = 2_000;
/** An asker that has not asked again this long has stopped wanting a turn (a resting lobby asks every 1.8 s, 3.6 s in a window that is not key). */
const ASK_FRESH_MS = 5_000;
/** A holder that neither moves nor gives its turn back this long loses it. */
const HOLD_STUCK_MS = TURN_MS + 10_000;

export interface PixelStage {
  /** An actor starts or stops taking part; the first on an empty stage makes the cast lively. */
  join(actor: string, now: number): void;
  leave(actor: string, now: number): void;
  /** The cast is in its lively stretch. */
  lively(now: number): boolean;
  /** The actor may start a loop or a walk now: the cast is lively, or the actor holds a young turn. */
  may(actor: string, now: number): boolean;
  holds(actor: string): boolean;
  /** Asks for the next turn, standing in line; true when the actor may act now. */
  ask(actor: string, now: number): boolean;
  /** Gives a turn back; the screen rests from here. */
  release(actor: string, now: number): void;
  /** Something changed on screen on this beat; actors on one beat count it once. */
  moved(now: number): void;
  /** The lively stretch starts again. */
  wake(now: number): void;
  /** The share of the last minute in which anything moved. */
  share(now: number): number;
}

export function createPixelStage({ share = () => MOTION_SHARE, onFirstJoin, onLastLeave }: {
  /** The share of a minute the cast may move now. */
  share?: () => number;
  onFirstJoin?: () => void;
  onLastLeave?: () => void;
} = {}): PixelStage {
  const actors = new Set<string>();
  /** The beats of the last minute that changed something on screen, with the motion each one ended. */
  const beats: { at: number; ms: number }[] = [];
  /** Askers in the order they first asked, with when they last asked. */
  const line = new Map<string, number>();
  let livelyUntil = Number.NEGATIVE_INFINITY;
  let holder: string | null = null, grantedAt = 0, restFrom = Number.NEGATIVE_INFINITY;

  const movedWithin = (now: number) => {
    while (beats.length && beats[0].at <= now - SHARE_WINDOW_MS) beats.shift();
    return beats.reduce((total, beat) => total + beat.ms, 0);
  };
  const giveBack = (now: number) => {
    holder = null;
    restFrom = now;
  };

  const stage: PixelStage = {
    join(actor, now) {
      if (actors.has(actor)) return;
      actors.add(actor);
      if (actors.size === 1) {
        stage.wake(now);
        onFirstJoin?.();
      }
    },
    leave(actor, now) {
      if (!actors.delete(actor)) return;
      line.delete(actor);
      if (holder === actor) giveBack(now);
      if (actors.size === 0) onLastLeave?.();
    },
    lively: now => now < livelyUntil,
    may: (actor, now) => now < livelyUntil || (holder === actor && now - grantedAt < TURN_MS),
    holds: actor => holder === actor,
    ask(actor, now) {
      if (now < livelyUntil) return true;
      if (holder === actor) return now - grantedAt < TURN_MS;
      // An asker keeps its place in line and notes that it still wants a turn.
      line.set(actor, now);
      // A turn never given back ended long ago, and its rest with it.
      if (holder !== null && now - grantedAt > HOLD_STUCK_MS) giveBack(grantedAt + TURN_MS);
      if (holder !== null || now - restFrom < REST_MS) return false;
      // The longest in line goes first; one that stopped asking leaves the line.
      for (const [waiting, askedAt] of line) {
        if (waiting === actor || now - askedAt <= ASK_FRESH_MS) break;
        line.delete(waiting);
      }
      if (line.keys().next().value !== actor) return false;
      if (movedWithin(now) + TURN_ROOM_MS > GRANT_SHARE * share() * SHARE_WINDOW_MS) return false;
      line.delete(actor);
      holder = actor;
      grantedAt = now;
      return true;
    },
    release(actor, now) {
      if (holder === actor) giveBack(now);
    },
    moved(now) {
      const last = beats.at(-1)?.at ?? Number.NEGATIVE_INFINITY;
      if (now - last < PIXEL_BEAT_MS / 2) return;
      beats.push({ at: now, ms: Math.min(Math.max(now - last, PIXEL_BEAT_MS), HELD_MS) });
    },
    wake(now) {
      livelyUntil = now + LIVELY_MS;
    },
    share: now => movedWithin(now) / SHARE_WINDOW_MS,
  };
  return stage;
}

const away = () => typeof document !== 'undefined' && document.hasFocus?.() === false;
const wakeNow = () => pixelStage.wake(performance.now());
const wakeIfShown = () => {
  if (!document.hidden) wakeNow();
};

/**
 * The page's one stage: Work status's rooms and lobby take turns on it. A return to the window
 * (focus, or the page shown again) makes the cast lively again.
 */
export const pixelStage: PixelStage = createPixelStage({
  share: () => (away() ? MOTION_SHARE_AWAY : MOTION_SHARE),
  onFirstJoin() {
    window.addEventListener('focus', wakeNow);
    document.addEventListener('visibilitychange', wakeIfShown);
  },
  onLastLeave() {
    window.removeEventListener('focus', wakeNow);
    document.removeEventListener('visibilitychange', wakeIfShown);
  },
});
