import { PIXEL_BEAT_MS } from './pixel-beat';

/**
 * Turns for the pixel cast of one screen. Every visible step costs the page one rendering update,
 * about 0.7 % CPU in WKWebView for each update a second whatever it draws, and it costs the same
 * whether one Moru steps on it or four. So the cast moves, then rests: on arrival, and on a return
 * to the window, everybody is lively for a moment; after that the actors (each room's Moru, and the
 * lobby) take turns in the order they have waited, two at a time on one update, each playing one
 * short thing, and the screen rests until the time since the turn began holds about four times what
 * moved in it, so about a quarter of the time moves (less in a window that is not key); a rest is
 * cut short when every actor would otherwise wait past `ROTATION_MS`. A rest never stands still for
 * long in the key window: past `BREATH_MS` with nothing changing, one lobby Moru blinks, and with no
 * lobby on the stage the next turn comes then. What an observed event plays (a commit, a state change) cuts in
 * at once and takes no turn. Motion is counted as a viewer sees it: a pose shows from its change
 * until the next, up to `HELD_MS`.
 */

/** How long the cast is lively on arrival and on a return to the window. */
export const LIVELY_MS = 8_000;
/** The share of the time the cast aims to move in the key window, and in one that is not. */
export const MOTION_SHARE = 0.25;
export const MOTION_SHARE_AWAY = 0.15;
export const SHARE_WINDOW_MS = 60_000;
/** Actors playing in one turn: they step on the same updates, so a second costs nothing more. */
export const TURN_ACTORS = 2;
/** A turn starts its things within this long; a loop under way when it ends is played out. */
export const TURN_MS = 3_000;
/** A second actor may join a turn this long after it was granted. */
const JOIN_MS = 500;
/** The rest after a turn: as long as the share asks, within these bounds. */
export const REST_MIN_MS = 3_000;
export const REST_MAX_MS = 20_000;
const REST_MAX_AWAY_MS = 30_000;
/** In the key window every actor's turn comes round within this long. */
export const ROTATION_MS = 55_000;
/** The rest after the lively stretch, before the first turn. */
const REST_AFTER_LIVELY_MS = 5_000;
/** Nothing has changed this long: one lobby Moru blinks, or, with no lobby, the next turn comes. */
export const BREATH_MS = 5_000;
/** A pose held longer than this after a change reads as still. */
const HELD_MS = 4 * PIXEL_BEAT_MS;
/** An asker that has not asked again this long has stopped wanting a turn (a resting lobby asks every 1.2 s, 2.4 s in a window that is not key). */
const ASK_FRESH_MS = 5_000;
/** One that offered to breathe this recently can be asked to. */
const BREATHER_FRESH_MS = 4_000;
/** Holders that neither move nor give their turn back this long lose it. */
const HOLD_STUCK_MS = TURN_MS + 12_000;

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
  /** Gives a turn back; once every holder has, the screen rests. */
  release(actor: string, now: number): void;
  /** An actor that can blink offers to; true when the screen has been still too long and it should. */
  breathe(actor: string, now: number): boolean;
  /** Something changed on screen on this beat; actors on one beat count it once. */
  moved(now: number): void;
  /** The lively stretch starts again. */
  wake(now: number): void;
  /** The share of the last minute in which anything moved. */
  share(now: number): number;
}

export function createPixelStage({ share = () => MOTION_SHARE, onFirstJoin, onLastLeave }: {
  /** The share of the time the cast aims to move now. */
  share?: () => number;
  onFirstJoin?: () => void;
  onLastLeave?: () => void;
} = {}): PixelStage {
  const actors = new Set<string>();
  /** The beats of the last minute that changed something on screen, with the motion each one ended. */
  const beats: { at: number; ms: number }[] = [];
  /** Askers in the order they first asked, with when they last asked. */
  const line = new Map<string, number>();
  const holders = new Set<string>();
  const breathers = new Map<string, number>();
  let livelyUntil = Number.NEGATIVE_INFINITY, lastMoved = Number.NEGATIVE_INFINITY;
  let grantedAt = 0, restFrom = Number.NEGATIVE_INFINITY, restFor = 0;

  const movedWithin = (now: number) => {
    while (beats.length && beats[0].at <= now - SHARE_WINDOW_MS) beats.shift();
    return beats.reduce((total, beat) => total + beat.ms, 0);
  };
  /** Somebody on the stage can blink a rest awake. */
  const canBreathe = (now: number) => [...breathers.values()].some(at => now - at <= BREATHER_FRESH_MS);
  const awayNow = () => share() < MOTION_SHARE;
  /** What moved from `from` on, as a viewer sees it. */
  const movedSince = (from: number) => beats.reduce((total, beat) => (beat.at >= from ? total + beat.ms : total), 0);
  /**
   * Rested: the least rest is over, and either the time since the turn began holds the share's worth
   * of what moved since, or the longest rest is over, or the screen has stood still too long with
   * nobody to blink.
   */
  const rested = (now: number) => {
    const since = now - restFrom;
    if (since < REST_MIN_MS) return false;
    if (since >= restFor || movedSince(grantedAt) <= share() * (now - grantedAt)) return true;
    return !awayNow() && !canBreathe(now) && now - Math.max(lastMoved, restFrom) >= BREATH_MS;
  };
  const endTurn = (now: number) => {
    holders.clear();
    restFrom = now;
    const played = Math.max(0, now - grantedAt), rounds = Math.ceil(actors.size / TURN_ACTORS);
    restFor = awayNow() ? REST_MAX_AWAY_MS : Math.max(REST_MIN_MS, Math.min(REST_MAX_MS, ROTATION_MS / Math.max(1, rounds) - played));
  };
  /** The longest in line, once those that stopped asking have left it. */
  const firstInLine = (now: number) => {
    for (const [waiting, askedAt] of line) {
      if (now - askedAt <= ASK_FRESH_MS) return waiting;
      line.delete(waiting);
    }
    return null;
  };
  const grant = (actor: string, now: number) => {
    if (holders.size === 0) grantedAt = now;
    holders.add(actor);
    line.delete(actor);
    return true;
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
      breathers.delete(actor);
      if (holders.delete(actor) && holders.size === 0) endTurn(now);
      if (actors.size === 0) onLastLeave?.();
    },
    lively: now => now < livelyUntil,
    may: (actor, now) => now < livelyUntil || (holders.has(actor) && now - grantedAt < TURN_MS),
    holds: actor => holders.has(actor),
    ask(actor, now) {
      if (now < livelyUntil) return true;
      if (holders.has(actor)) return now - grantedAt < TURN_MS;
      // An asker keeps its place in line and notes that it still wants a turn.
      line.set(actor, now);
      // A turn never given back ended long ago.
      if (holders.size > 0 && now - grantedAt > HOLD_STUCK_MS) endTurn(grantedAt + TURN_MS);
      if (holders.size > 0) {
        // The next in line joins a turn just granted, so two actors play on the same updates.
        return holders.size < TURN_ACTORS && now - grantedAt <= JOIN_MS && firstInLine(now) === actor && grant(actor, now);
      }
      if (!rested(now) || firstInLine(now) !== actor) return false;
      return grant(actor, now);
    },
    release(actor, now) {
      if (holders.delete(actor) && holders.size === 0) endTurn(now);
    },
    breathe(actor, now) {
      breathers.set(actor, now);
      // Nobody looks at a window that is not key: it rests without blinking.
      if (awayNow() || now < livelyUntil || holders.size > 0 || now - lastMoved < BREATH_MS) return false;
      // Counted as moving now, so the next breath waits its own while.
      lastMoved = now;
      return true;
    },
    moved(now) {
      lastMoved = now;
      const last = beats.at(-1)?.at ?? Number.NEGATIVE_INFINITY;
      if (now - last < PIXEL_BEAT_MS / 2) return;
      beats.push({ at: now, ms: Math.min(Math.max(now - last, PIXEL_BEAT_MS), HELD_MS) });
    },
    wake(now) {
      livelyUntil = now + LIVELY_MS;
      grantedAt = restFrom = livelyUntil;
      restFor = REST_AFTER_LIVELY_MS;
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
