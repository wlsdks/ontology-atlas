import { MOTION } from '@/shared/motion';
import { PIXEL_BEAT_MS, onPixelBeat } from '@/shared/motion/pixel-beat';
import { pixelStage, type PixelStage } from '@/shared/motion/pixel-stage';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { ROOM_ROW_FRAMES } from '@/shared/ui/marks/moru/moru-rows';
import { castClip, castStripUrl, tintedStripUrl } from './cast-strip';

export const MORU_CELL_PX = 128;
/** A room row's cell time: the page's pixel beat, which the lobby steps on too. */
export const MORU_STEP_MS = PIXEL_BEAT_MS;
/** Cells a Moru skips per step on his way back to the neutral pose before a row he plays once. */
const RETURN_CELLS = 2;
/** The longest a Moru takes from any cell back to the neutral pose. */
export const MORU_TO_NEUTRAL_MS = Math.ceil(Math.max(...Object.values(ROOM_ROW_FRAMES)) / 2 / RETURN_CELLS) * MORU_STEP_MS;
/** When a merged room's lights go out: once the crate is in, and once Moru has cheered the merge. */
export const MERGE_LIGHTS_OUT_MS = Math.max(
  (MOTION.choreography.duration + MOTION.slow.duration) * 1000,
  MORU_TO_NEUTRAL_MS + (ROOM_ROW_FRAMES['merge-cheer'] * MORU_STEP_MS),
);
/** Beats the clock sleeps while every room on screen rests; a change it observes wakes it at once. */
const RESTING_BEATS = 3;
/** A row asked for while its room was out of sight for this long is not played late. */
const ONCE_STALE_MS = 2000;

/** How many cells a row has: a cast clip's or a room row's own count, else the 24 of the waiting row. */
export const moruCells = (clip: string): number => castClip(clip)?.n ?? (ROOM_ROW_FRAMES as Record<string, number>)[clip] ?? 24;
/** A cell's width: 128px, wider for a cast clip whose tool or partner stands beside Moru. */
export const moruCellWidth = (clip: string): number => castClip(clip)?.w ?? MORU_CELL_PX;
/** A row's sheet: the grey original's, a cast character's (`pnpm brand:cast`), or a cast clip dressed for him (`cast-strip.ts`). */
export const moruRowSource = (clip: string, character = 'grey') =>
  (castClip(clip) ? castStripUrl(clip, character) : null) ?? withBasePath(`/brand/mascot-${clip}-row-128${character === 'grey' ? '' : `-${character}`}.png`);
export const moruRow = (clip: string, character = 'grey') => `url(${moruRowSource(clip, character)})`;
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
  /** A row his room's state just changed to: played through once at once, turn or not. */
  event?: boolean;
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
 *
 * A room is one actor on the page's stage (`pixel-stage.ts`): its Moru loop freely while the cast is
 * lively, and otherwise rest on the neutral pose until their room's turn, when each plays one loop
 * (or the pair one talk) and rests again. A loop is never cut: a rest starts where a loop ends, on the
 * neutral pose. A row the room asks to play once, and the new row of a changed state, play at once.
 */
export function createMoruClock(board: HTMLElement, stage: PixelStage = pixelStage) {
  let leave: (() => void) | null = null, ticks = 0, changes = 0;
  /** The rooms on the stage, and in a room holding a turn, the Moru who have played their loop. */
  const actors = new Set<string>();
  const played = new WeakSet<HTMLElement>();
  const turnMoved = new Set<string>();
  /** When each room holding a turn first stepped in it, in ticks. */
  const turnFrom = new Map<string, number>();
  const actorOf = (room: string) => `room:${room}`;
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
    // A strip already carrying the session's ink replaces the board's filter, so a step repaints only pixels.
    const source = moruRowSource(state.clip, sprite.dataset.moruCast), ink = sprite.dataset.moruInk;
    const inked = ink ? tintedStripUrl(source, ink) : null;
    if (state.drawn !== `${state.clip}@${state.offset}@${inked ?? ''}`) {
      sprite.style.backgroundImage = `url(${inked ?? source})`;
      const figure = sprite.parentElement;
      if (figure && sprite.dataset.moruFilter) figure.style.filter = inked ? 'none' : sprite.dataset.moruFilter;
      sprite.style.backgroundSize = `${state.cells * width}px ${MORU_CELL_PX}px`;
      // A wider cell paints past the 128px box on the screen's side; the figure around it keeps 128px, and so the room's layout.
      // A talk is shown through two 128px windows, one per Moru, so neither draws the other twice.
      const beyond = castClip(state.clip)?.kind === 'talk' ? 0 : width - MORU_CELL_PX - state.offset;
      sprite.style.width = beyond > 0 ? `${MORU_CELL_PX + beyond}px` : '';
      sprite.style.flexShrink = beyond > 0 ? '0' : '';
      state.drawn = `${state.clip}@${state.offset}@${inked ?? ''}`;
      changes += 1;
    }
    // A Moru holding a pose is not written again, so a held room costs the page nothing per step.
    const position = `${-(state.cell * width + state.offset)}px`;
    if (sprite.style.backgroundPositionX !== position) {
      sprite.style.backgroundPositionX = position;
      changes += 1;
    }
    shown.set(sprite, state);
  };
  const initial = (sprite: HTMLElement) => {
    const known = shown.get(sprite);
    if (known) return known;
    const state = loopOf(sprite, sprite.dataset.moruHold === 'true' ? 0 : Number(sprite.dataset.moruPhase ?? 0), sprite.dataset.moruClip ?? 'waiting');
    // React draws a live Moru's first row; the clock draws every row after it.
    return { ...state, drawn: sprite.style.backgroundImage.includes(`mascot-${state.clip}-row`) ? `${state.clip}@0@` : '' };
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

  /**
   * One step. `may` says whether he may start a loop, `mayTalk` whether his pair may start a talk (in a
   * turn, after his loop too), `turn` whether his room holds a turn.
   */
  const step = (sprite: HTMLElement, now: number, may: boolean, mayTalk: boolean, turn: boolean) => {
    const state = initial(sprite);
    if (state.playingOnce) {
      state.cell += 1;
      return draw(sprite, state.cell >= state.cells ? loopOf(sprite, 0) : state);
    }
    if (mayTalk && talking(sprite, state)) return;
    const asked = pending(sprite, now);
    if (asked?.stale) finish(sprite, asked.request);
    const once = asked && !asked.stale ? asked.request : null;
    const loop = loopFor(sprite, state.clip);
    if (once || state.clip !== loop) {
      if (state.cell === 0) {
        // His room's state changed: the new row plays through once now, turn or not.
        if (!once) return draw(sprite, { ...loopOf(sprite, 0), event: sprite.dataset.moruHold !== 'true' });
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
    // Resting: on the neutral pose, between his room's turns.
    if (state.cell === 0 && !may && !state.event) {
      if (!shown.has(sprite)) draw(sprite, state);
      return;
    }
    state.cell = sprite.dataset.moruHold === 'true' ? 0 : (state.cell + 1) % state.cells;
    if (state.cell === 0 && sprite.dataset.moruHold !== 'true') {
      // A loop ended on the neutral pose: the next clip of his list, when it is dressed for him.
      state.loops += 1;
      state.event = false;
      if (turn) played.add(sprite);
      const loops = loopsOf(sprite), at = loops.indexOf(state.clip);
      const next = loops.length > 1 ? loops.slice(at + 1).concat(loops.slice(0, at + 1)).find(clip => ready(clip, sprite.dataset.moruCast)) : undefined;
      // Behind a working pair, now and then the two talk.
      const talk = sprite.dataset.moruTalks?.split(' ') ?? [];
      if (mayTalk && sprite.dataset.moruSlot === 'back' && talk.length && pairAtWork(sprite) && state.loops % TALK_EVERY === 0 && !talks.has(roomOf(sprite))) {
        const clip = talk[(state.loops / TALK_EVERY) % talk.length];
        if (ready(clip, sprite.dataset.moruCast)) talks.set(roomOf(sprite), { clip, ready: new Set(), startAt: null });
      }
      if (next && next !== state.clip) return draw(sprite, { ...loopOf(sprite, 0, next), loops: state.loops });
      if (may && !turn && talking(sprite, state)) return;
    }
    return draw(sprite, state);
  };

  /** A Moru standing on his neutral pose with nothing to play. */
  const atRest = (sprite: HTMLElement) => {
    const state = shown.get(sprite);
    return !state || (state.cell === 0 && !state.playingOnce && !state.event);
  };
  /**
   * One beat of one room on the stage: its Moru step, the room reports whether anything moved, a room
   * holding a turn gives it back once its Moru are on the neutral pose again, and a resting room whose
   * Moru loop asks for the next one.
   */
  const act = (room: string, sprites: HTMLElement[], now: number) => {
    const actor = actorOf(room);
    if (!actors.has(room)) {
      actors.add(room);
      stage.join(actor, now);
    }
    const turn = stage.holds(actor) && !stage.lively(now), may = stage.may(actor, now);
    const before = changes;
    for (const sprite of sprites) step(sprite, now, may && !(turn && played.has(sprite)), may, turn);
    const moved = changes > before;
    if (moved) stage.moved(now);
    const resting = sprites.every(atRest);
    if (stage.holds(actor)) {
      if (!turnFrom.has(room)) turnFrom.set(room, ticks);
      if (moved) turnMoved.add(room);
      // Back on the neutral pose after his loop, or nothing to play after a few beats; a pair due to talk
      // keeps the turn for it while the turn is young.
      if (resting && !(may && talks.has(room)) && (turnMoved.has(room) || ticks - turnFrom.get(room)! > 3)) {
        stage.release(actor, now);
        turnMoved.delete(room);
        turnFrom.delete(room);
        for (const sprite of sprites) played.delete(sprite);
      }
    } else if (resting && sprites.some(sprite => sprite.dataset.moruHold !== 'true')) stage.ask(actor, now);
    return !moved && resting && !stage.holds(actor) && !stage.lively(now);
  };
  const leaveStage = (room: string, now: number) => {
    actors.delete(room);
    turnMoved.delete(room);
    turnFrom.delete(room);
    stage.leave(actorOf(room), now);
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
      // A change the board observed (a row to play once, a new state) is stepped on the next beat.
      if (wanted && leave) leave();
      if (wanted) leave = onPixelBeat(at => {
        ticks += 1;
        const rooms = new Map<string, HTMLElement[]>();
        for (const sprite of board.querySelectorAll<HTMLElement>(STEPPING)) {
          const room = roomOf(sprite);
          rooms.set(room, [...(rooms.get(room) ?? []), sprite]);
        }
        let resting = true;
        for (const [room, sprites] of rooms) resting = act(room, sprites, at) && resting;
        for (const room of [...actors]) if (!rooms.has(room)) leaveStage(room, at);
        return resting ? RESTING_BEATS : 1;
      });
      if (!wanted && leave) {
        leave();
        leave = null;
        for (const room of [...actors]) leaveStage(room, now);
      }
    },
    stop() {
      leave?.();
      leave = null;
      for (const room of [...actors]) leaveStage(room, performance.now());
    },
  };
}
