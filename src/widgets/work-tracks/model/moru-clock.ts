import { MOTION } from '@/shared/motion';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { ROOM_ROW_FRAMES } from '@/shared/ui/marks/moru/moru-rows';

export const MORU_CELL_PX = 128;
/** A room row's cell time: the catalogue's play pace, six expressive beats per 24 cells. */
export const MORU_STEP_MS = (MOTION.expressive.duration * 1000 * 6) / 24;
/** Cells a Moru skips per step on his way back to the neutral pose before a row he plays once. */
const RETURN_CELLS = 2;
/** The longest a Moru takes from any cell back to the neutral pose. */
export const MORU_TO_NEUTRAL_MS = Math.ceil(Math.max(...Object.values(ROOM_ROW_FRAMES)) / 2 / RETURN_CELLS) * MORU_STEP_MS;
/** When a merged room's lights go out: once the crate is in, and once Moru has cheered the merge. */
export const MERGE_LIGHTS_OUT_MS = Math.max(
  (MOTION.choreography.duration + MOTION.slow.duration) * 1000,
  MORU_TO_NEUTRAL_MS + (ROOM_ROW_FRAMES['merge-cheer'] * MORU_STEP_MS),
);
/** A row asked for while its room was out of sight for this long is not played late. */
const ONCE_STALE_MS = 2000;

/** How many cells a row has: a room row's own count, else the 24 of the waiting row. */
export const moruCells = (clip: string): number => (ROOM_ROW_FRAMES as Record<string, number>)[clip] ?? 24;
/** A row's sheet: the grey original's, or a cast character's (`pnpm brand:cast`). */
export const moruRow = (clip: string, character = 'grey') =>
  `url(${withBasePath(`/brand/mascot-${clip}-row-128${character === 'grey' ? '' : `-${character}`}.png`)})`;

/** A looping Moru in a room on screen in a visible window. */
const STEPPING = "[data-room-seen='true'] [data-moru-live]";
const LIVE = '[data-moru-live]';

/** What one Moru shows: the row, the cell, and the one-shot it is playing. */
interface Shown {
  clip: string;
  cells: number;
  cell: number;
  playingOnce: boolean;
  drawn: string;
}

/** A row asked to play once: `clip@token`, from the room (`data-moru-once`) or its move (`data-moru-travel`). */
const requestsOf = (sprite: HTMLElement) => [sprite.dataset.moruOnce, sprite.dataset.moruTravel].filter((request): request is string => Boolean(request));

/**
 * One clock steps every Moru in a large room on screen, a cell at a time. A CSS sprite loop would make
 * the browser restyle the board on every display frame; this clock wakes when a cell changes and only
 * while one is on screen. A Moru loops his state's row from a pose of his own; a row he plays once
 * starts from the neutral pose, which he reaches by the shorter way, and hands back to the loop on it,
 * so no change of row ever jumps a pose. A row his room asked for while out of sight is dropped.
 */
export function createMoruClock(board: HTMLElement) {
  let timer = 0;
  const shown = new WeakMap<HTMLElement, Shown>();
  /** Requests played or dropped, per room and Moru, so a face drawn again does not replay them. */
  const done = new Map<string, string[]>();
  const askedAt = new Map<string, number>();

  const slotOf = (sprite: HTMLElement) => `${sprite.closest<HTMLElement>('[data-room-key]')?.dataset.roomKey ?? ''}#${sprite.dataset.moruSlot ?? ''}`;
  const finish = (sprite: HTMLElement, request: string) => {
    const slot = slotOf(sprite);
    done.set(slot, [...(done.get(slot) ?? []), request].slice(-8));
    askedAt.delete(`${slot}|${request}`);
  };
  const pending = (sprite: HTMLElement, now: number) => {
    const slot = slotOf(sprite);
    for (const request of requestsOf(sprite)) {
      if (done.get(slot)?.includes(request)) continue;
      const key = `${slot}|${request}`;
      if (!askedAt.has(key)) askedAt.set(key, now);
      return { request, stale: now - askedAt.get(key)! > ONCE_STALE_MS };
    }
    return null;
  };
  const loopOf = (sprite: HTMLElement, cell: number): Shown => {
    const clip = sprite.dataset.moruClip ?? 'waiting';
    return { clip, cells: moruCells(clip), cell, playingOnce: false, drawn: shown.get(sprite)?.drawn ?? '' };
  };
  const draw = (sprite: HTMLElement, state: Shown) => {
    if (state.drawn !== state.clip) {
      sprite.style.backgroundImage = moruRow(state.clip, sprite.dataset.moruCast);
      sprite.style.backgroundSize = `${state.cells * MORU_CELL_PX}px ${MORU_CELL_PX}px`;
      state.drawn = state.clip;
    }
    // A Moru holding a pose is not written again, so a held room costs the page nothing per step.
    const position = `${-state.cell * MORU_CELL_PX}px`;
    if (sprite.style.backgroundPositionX !== position) sprite.style.backgroundPositionX = position;
    shown.set(sprite, state);
  };
  const initial = (sprite: HTMLElement) => {
    const known = shown.get(sprite);
    if (known) return known;
    const state = loopOf(sprite, sprite.dataset.moruHold === 'true' ? 0 : Number(sprite.dataset.moruPhase ?? 0));
    // React draws a live Moru's first row; the clock draws every row after it.
    return { ...state, drawn: sprite.style.backgroundImage.includes(`mascot-${state.clip}-row`) ? state.clip : '' };
  };

  const step = (sprite: HTMLElement, now: number) => {
    const state = initial(sprite);
    if (state.playingOnce) {
      state.cell += 1;
      return draw(sprite, state.cell >= state.cells ? loopOf(sprite, 0) : state);
    }
    const asked = pending(sprite, now);
    if (asked?.stale) finish(sprite, asked.request);
    const once = asked && !asked.stale ? asked.request : null;
    const loop = sprite.dataset.moruClip ?? 'waiting';
    if (once || state.clip !== loop) {
      if (state.cell === 0) {
        if (!once) return draw(sprite, loopOf(sprite, 0));
        finish(sprite, once);
        const clip = once.slice(0, once.indexOf('@'));
        return draw(sprite, { clip, cells: moruCells(clip), cell: 0, playingOnce: true, drawn: state.drawn });
      }
      // On his way to the neutral pose: forward when nearer the row's end, back when nearer its start.
      state.cell = state.cell >= state.cells / 2 ? state.cell + RETURN_CELLS : state.cell - RETURN_CELLS;
      if (state.cell >= state.cells || state.cell <= 0) state.cell = 0;
      return draw(sprite, state);
    }
    state.cell = sprite.dataset.moruHold === 'true' ? 0 : (state.cell + 1) % state.cells;
    return draw(sprite, state);
  };

  /** A Moru out of sight, or with motion not allowed, takes his state's row at its neutral pose at once. */
  const rest = (sprite: HTMLElement, now: number, allowed: boolean) => {
    const asked = pending(sprite, now);
    if (asked && (!allowed || asked.stale)) finish(sprite, asked.request);
    const state = initial(sprite);
    if (!allowed || (!state.playingOnce && state.clip !== (sprite.dataset.moruClip ?? 'waiting'))) draw(sprite, loopOf(sprite, 0));
    else if (!shown.has(sprite)) draw(sprite, state);
  };

  return {
    /** Runs the clock while a Moru is on screen in a visible window, and settles every other one. */
    sync(allowed: boolean) {
      const now = performance.now();
      const stepping = new Set(allowed && !document.hidden ? board.querySelectorAll<HTMLElement>(STEPPING) : []);
      for (const sprite of board.querySelectorAll<HTMLElement>(LIVE)) if (!stepping.has(sprite)) rest(sprite, now, allowed);
      const wanted = stepping.size > 0;
      if (wanted && !timer) timer = window.setInterval(() => {
        const at = performance.now();
        for (const sprite of board.querySelectorAll<HTMLElement>(STEPPING)) step(sprite, at);
      }, MORU_STEP_MS);
      if (!wanted && timer) {
        window.clearInterval(timer);
        timer = 0;
      }
    },
    stop() {
      window.clearInterval(timer);
      timer = 0;
    },
  };
}
