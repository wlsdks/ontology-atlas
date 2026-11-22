import { MOTION } from '@/shared/motion';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { ROOM_ROW_FRAMES } from '@/shared/ui/marks/moru/moru-rows';
import { castClip, castStripUrl } from './cast-strip';

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

/** How many cells a row has: a cast clip's or a room row's own count, else the 24 of the waiting row. */
export const moruCells = (clip: string): number => castClip(clip)?.n ?? (ROOM_ROW_FRAMES as Record<string, number>)[clip] ?? 24;
/** A cell's width: 128px, wider for a cast clip whose tool or partner stands beside Moru. */
export const moruCellWidth = (clip: string): number => castClip(clip)?.w ?? MORU_CELL_PX;
/** A row's sheet: the grey original's, a cast character's (`pnpm brand:cast`), or a cast clip dressed for him (`cast-strip.ts`). */
export const moruRow = (clip: string, character = 'grey') => {
  const dressed = castClip(clip) ? castStripUrl(clip, character) : null;
  return `url(${dressed ?? withBasePath(`/brand/mascot-${clip}-row-128${character === 'grey' ? '' : `-${character}`}.png`)})`;
};
/** A clip can be shown: a room row always, a cast clip once it is dressed for this Moru. */
const ready = (clip: string, character = 'grey') => !castClip(clip) || castStripUrl(clip, character) !== null;
/** Where the room's second Moru stands from the first, in drawn pixels: the front one shows a talk from there. */
export const PAIR_APART = 120;
/** A working pair talks after every this many loops of the one behind. */
const TALK_EVERY = 3;

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
  /** How far into a wide cell this Moru's own 128px window starts. */
  offset: number;
  /** Loops played, so a working Moru walks his list and a pair talks now and then. */
  loops: number;
}

/** A talk a working pair is about to have: each Moru waits on his neutral pose until both are there. */
interface Talk {
  clip: string;
  ready: Set<HTMLElement>;
  startAt: number | null;
}

/** A row asked to play once: `clip@token`, from the room (`data-moru-once`) or its move (`data-moru-travel`). */
const requestsOf = (sprite: HTMLElement) => [...(sprite.dataset.moruOnce?.split(' ') ?? []), sprite.dataset.moruTravel].filter((request): request is string => Boolean(request));
/** The clips a Moru loops through, one per loop (`data-moru-loops`), else his one row. */
const loopsOf = (sprite: HTMLElement) => sprite.dataset.moruLoops?.split(' ') ?? [sprite.dataset.moruClip ?? 'waiting'];
/** The clip he should be looping now: the one he is on while it is in his list, else his list's first. */
const loopFor = (sprite: HTMLElement, clip: string) => { const loops = loopsOf(sprite); return loops.includes(clip) ? clip : loops[0]; };

/**
 * One clock steps every Moru in a large room on screen, a cell at a time. A CSS sprite loop would make
 * the browser restyle the board on every display frame; this clock wakes when a cell changes and only
 * while one is on screen. A Moru loops his state's row from a pose of his own; a row he plays once
 * starts from the neutral pose, which he reaches by the shorter way, and hands back to the loop on it,
 * so no change of row ever jumps a pose. A row his room asked for while out of sight is dropped.
 */
export function createMoruClock(board: HTMLElement) {
  let timer = 0, ticks = 0;
  const shown = new WeakMap<HTMLElement, Shown>();
  const talks = new Map<string, Talk>();
  const roomOf = (sprite: HTMLElement) => sprite.closest<HTMLElement>('[data-room-key]')?.dataset.roomKey ?? '';
  /** A pair at work: two Moru in a room whose light is on. */
  const pairAtWork = (sprite: HTMLElement) => sprite.closest<HTMLElement>('[data-cast]')?.dataset.cast === 'two' && sprite.closest<HTMLElement>('[data-room-running]')?.dataset.roomRunning === 'true';
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
  const loopOf = (sprite: HTMLElement, cell: number, clip = loopFor(sprite, shown.get(sprite)?.clip ?? '')): Shown => {
    const known = shown.get(sprite);
    return { clip, cells: moruCells(clip), cell, playingOnce: false, drawn: known?.drawn ?? '', offset: 0, loops: known?.loops ?? 0 };
  };
  const draw = (sprite: HTMLElement, state: Shown) => {
    const width = moruCellWidth(state.clip);
    if (state.drawn !== `${state.clip}@${state.offset}`) {
      sprite.style.backgroundImage = moruRow(state.clip, sprite.dataset.moruCast);
      sprite.style.backgroundSize = `${state.cells * width}px ${MORU_CELL_PX}px`;
      // A wider cell paints past the 128px box on the screen's side; the figure around it keeps 128px, and so the room's layout.
      // A talk is shown through two 128px windows, one per Moru, so neither draws the other twice.
      const beyond = castClip(state.clip)?.kind === 'talk' ? 0 : width - MORU_CELL_PX - state.offset;
      sprite.style.width = beyond > 0 ? `${MORU_CELL_PX + beyond}px` : '';
      sprite.style.flexShrink = beyond > 0 ? '0' : '';
      state.drawn = `${state.clip}@${state.offset}`;
    }
    // A Moru holding a pose is not written again, so a held room costs the page nothing per step.
    const position = `${-(state.cell * width + state.offset)}px`;
    if (sprite.style.backgroundPositionX !== position) sprite.style.backgroundPositionX = position;
    shown.set(sprite, state);
  };
  const initial = (sprite: HTMLElement) => {
    const known = shown.get(sprite);
    if (known) return known;
    const state = loopOf(sprite, sprite.dataset.moruHold === 'true' ? 0 : Number(sprite.dataset.moruPhase ?? 0), sprite.dataset.moruClip ?? 'waiting');
    // React draws a live Moru's first row; the clock draws every row after it.
    return { ...state, drawn: sprite.style.backgroundImage.includes(`mascot-${state.clip}-row`) ? `${state.clip}@0` : '' };
  };

  /** On the neutral pose with a talk pending for his room: waits there, and starts with his partner. */
  const talking = (sprite: HTMLElement, state: Shown) => {
    const talk = talks.get(roomOf(sprite));
    if (!talk || state.cell !== 0 || state.playingOnce) return false;
    if (!pairAtWork(sprite)) { talks.delete(roomOf(sprite)); return false; }
    talk.ready.add(sprite);
    if (talk.ready.size >= 2 && talk.startAt === null) talk.startAt = ticks + 1;
    if (talk.startAt === null || ticks < talk.startAt) { draw(sprite, state); return true; }
    talk.ready.delete(sprite);
    if (talk.ready.size === 0) talks.delete(roomOf(sprite));
    const offset = sprite.dataset.moruSlot === 'front' ? PAIR_APART : 0;
    draw(sprite, { clip: talk.clip, cells: moruCells(talk.clip), cell: 0, playingOnce: true, drawn: state.drawn, offset, loops: state.loops });
    return true;
  };

  const step = (sprite: HTMLElement, now: number) => {
    const state = initial(sprite);
    if (state.playingOnce) {
      state.cell += 1;
      return draw(sprite, state.cell >= state.cells ? loopOf(sprite, 0) : state);
    }
    if (talking(sprite, state)) return;
    const asked = pending(sprite, now);
    if (asked?.stale) finish(sprite, asked.request);
    const once = asked && !asked.stale ? asked.request : null;
    const loop = loopFor(sprite, state.clip);
    if (once || state.clip !== loop) {
      if (state.cell === 0) {
        if (!once) return draw(sprite, loopOf(sprite, 0));
        finish(sprite, once);
        const clip = once.slice(0, once.indexOf('@'));
        // A cast clip not yet dressed for this Moru is let go, as one asked for out of sight is.
        if (!ready(clip, sprite.dataset.moruCast)) return draw(sprite, loopOf(sprite, 0));
        return draw(sprite, { clip, cells: moruCells(clip), cell: 0, playingOnce: true, drawn: state.drawn, offset: 0, loops: state.loops });
      }
      // On his way to the neutral pose: forward when nearer the row's end, back when nearer its start.
      state.cell = state.cell >= state.cells / 2 ? state.cell + RETURN_CELLS : state.cell - RETURN_CELLS;
      if (state.cell >= state.cells || state.cell <= 0) state.cell = 0;
      return draw(sprite, state);
    }
    state.cell = sprite.dataset.moruHold === 'true' ? 0 : (state.cell + 1) % state.cells;
    if (state.cell === 0 && sprite.dataset.moruHold !== 'true') {
      // A loop ended on the neutral pose: the next clip of his list, when it is dressed for him.
      state.loops += 1;
      const loops = loopsOf(sprite), at = loops.indexOf(state.clip);
      const next = loops.length > 1 ? loops.slice(at + 1).concat(loops.slice(0, at + 1)).find(clip => ready(clip, sprite.dataset.moruCast)) : undefined;
      // Behind a working pair, now and then the two talk.
      const talk = sprite.dataset.moruTalks?.split(' ') ?? [];
      if (sprite.dataset.moruSlot === 'back' && talk.length && pairAtWork(sprite) && state.loops % TALK_EVERY === 0 && !talks.has(roomOf(sprite))) {
        const clip = talk[(state.loops / TALK_EVERY) % talk.length];
        if (ready(clip, sprite.dataset.moruCast)) talks.set(roomOf(sprite), { clip, ready: new Set(), startAt: null });
      }
      if (next && next !== state.clip) return draw(sprite, { ...loopOf(sprite, 0, next), loops: state.loops });
      if (talking(sprite, state)) return;
    }
    return draw(sprite, state);
  };

  /** A Moru out of sight, or with motion not allowed, takes his state's row at its neutral pose at once. */
  const rest = (sprite: HTMLElement, now: number, allowed: boolean) => {
    const asked = pending(sprite, now);
    if (asked && (!allowed || asked.stale)) finish(sprite, asked.request);
    const state = initial(sprite);
    talks.delete(roomOf(sprite));
    // A talk is the pair's together, so one Moru out of sight ends it for both.
    const talk = state.playingOnce && castClip(state.clip)?.kind === 'talk';
    if (!allowed || talk || (!state.playingOnce && state.clip !== loopFor(sprite, state.clip))) draw(sprite, loopOf(sprite, 0));
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
        ticks += 1;
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
