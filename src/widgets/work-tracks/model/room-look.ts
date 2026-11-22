import { FULL_STAGES, NO_SESSION_FLOOR, type RoomEntry, type Track, type RoomPlan, type RoomStage, type RoomState } from '@/shared/lib/work-status/work-tracks';
import type { RoomMotion } from '@/shared/ui/marks/moru/moru-rows';

/** Moru's rows a room plays (`docs/design/brand.md`, "Contextual motion"): the room rows and the waiting row's neutral pose. */
export type RoomClip = RoomMotion | 'waiting';

/** A row a room plays once over its state, from the neutral pose back to it. */
export type RoomOnce = 'crate-send' | 'merge-cheer' | 'settle-in' | 'galumph' | 'galumph-left';

export type CrateKind = 'plain' | 'taped' | 'ghost' | 'dusty';

export interface RoomLook {
  /** The lamp is lit and the room's light moves only while something runs. */
  running: boolean;
  monitorOff: boolean;
  crate: CrateKind;
  /** No Moru when nobody ever held the folder. */
  cast: 'none' | 'one' | 'two';
  /** The row Moru loops in this state. */
  clip: RoomClip;
  /** The first Moru's row when two tools share the folder; the second plays `clip`. */
  backClip: RoomClip;
  /** A still Moru holds the row's neutral pose. */
  still: boolean;
  dozing: boolean;
}

/**
 * Every room's poses are chosen here, so a new Moru clip drops in at one place. Only what Git and
 * the locks show picks a row: working types at the desk, a pair reads the monitor behind, a room
 * quiet for long nods off, and a lock left behind or a folder gone sighs. Nothing here reads whether
 * a session waits on its person, so `heads-up` has no state to play yet.
 */
export function roomLook(state: RoomState): RoomLook {
  const quiet = { running: false, monitorOff: false, crate: 'plain', cast: 'one', clip: 'waiting', backClip: 'monitor-read', still: true, dozing: false } as const;
  switch (state.kind) {
    case 'working':
      return { ...quiet, running: true, cast: state.tools.length > 1 ? 'two' : 'one', clip: 'desk-type', still: false };
    case 'resting':
    case 'locked':
    case 'merged':
      return quiet;
    case 'dozing':
      return { ...quiet, clip: 'nod-off', still: false, dozing: true };
    case 'lockLeft':
      return { ...quiet, monitorOff: true, crate: 'taped', clip: 'sigh', still: false };
    case 'missing':
      return { ...quiet, monitorOff: true, crate: 'ghost', clip: 'sigh', still: false };
    case 'unheld':
      return { ...quiet, crate: 'dusty', cast: 'none' };
  }
}

/** What a room has just observed, each a row Moru plays once. */
export interface RoomMoments {
  /** The worktree's merge was just observed, and the room is about to retire. */
  merged: boolean;
  /** A commit beyond the base branch just reached the cart. */
  landed: boolean;
  /** The room is new to the building, or newly on the stage. */
  entered: boolean;
}

/** The one row to play now: a merge cheers, a landed commit is sent down, a new room is settled into. */
export function roomOnce(state: RoomState, { merged, landed, entered }: RoomMoments): RoomOnce | null {
  if (merged) return 'merge-cheer';
  if (landed && state.kind === 'working') return 'crate-send';
  return entered && roomLook(state).cast !== 'none' ? 'settle-in' : null;
}

/** Each room's Moru starts his loop at a pose of his own, so rooms side by side never move in step. */
const LOOP_POSES = 24;

/** The fraction of the loop a room's Moru starts at: a whole pose picked from its worktree's key. */
export function moruPhase(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % LOOP_POSES) / LOOP_POSES;
}

/** How many wall props a room may have; which one is its worktree's own. */
export const ROOM_PROPS = 6;

export interface RoomIdentity {
  /** The room drawn the other way round: Moru faces left, the lamp stands on his right. */
  mirrored: boolean;
  /** Which of the `ROOM_PROPS` props stands in the room. */
  prop: number;
}

/** What tells rooms apart at a glance, from the branch name alone, so a room keeps it for life. */
export function roomIdentity(branch: string): RoomIdentity {
  let hash = 0x811c9dc5;
  for (const char of branch) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return { mirrored: (hash & 8) !== 0, prop: hash % ROOM_PROPS };
}

/**
 * The Moru a room has: the grey original, or one of the cast, each a body palette and at most one head
 * piece (`docs/design/brand.md`, "Cast"). A costume only: every character plays the same rows, so
 * a pose means the same thing whoever wears it.
 */
export const MORU_CAST = ['horn', 'unicorn', 'dragon', 'rabbit', 'builder', 'scholar'] as const;
export type MoruCharacter = 'grey' | (typeof MORU_CAST)[number];

/**
 * The room's Moru, from its branch name alone, so a room always has the same one. The base branch's
 * room, the main checkout, keeps the grey original; every other branch draws from the cast by a hash
 * of its own, so the character says nothing the mirror or the wall prop already say.
 */
export function moruCharacter(branch: string, base: boolean): MoruCharacter {
  if (base) return 'grey';
  let hash = 0x9e3779b9;
  for (const char of branch) hash = Math.imul(hash ^ char.charCodeAt(0), 0x85ebca6b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
  return MORU_CAST[((hash ^ (hash >>> 16)) >>> 0) % MORU_CAST.length];
}

/** The character of the room a worktree has. */
export const roomCharacter = (track: Pick<Track, 'branch' | 'standing'>, key: string): MoruCharacter =>
  moruCharacter(track.branch ?? key, track.standing === 'base');

/** A warning the page header counts: two tools in one folder, or a worktree to clean up. */
export type RoomAlert = 'sameFolder' | 'cleanup';

export function roomAlertOf(state: RoomState): RoomAlert | null {
  if (state.kind === 'working' && state.tools.length > 1) return 'sameFolder';
  return state.kind === 'lockLeft' || state.kind === 'missing' ? 'cleanup' : null;
}

/** Where a stage puts the crate along the belt, as a fraction of its length. */
export const STAGE_AT: Record<RoomStage, number> = { worktree: 0.04, commits: 0.2, main: 1 };

/** The most crates a cart carries before the rest are counted as `+n`. */
export const CART_CRATES = 6;

/**
 * The cart's load: one crate per commit beyond the base branch, at most six, and how many more.
 * A merged worktree's cart still carries what it delivered, at least one crate.
 */
export function cartLoad(ahead: number | null, merged: boolean): { crates: number; more: number } {
  const count = Math.max(ahead ?? 0, merged ? 1 : 0);
  return { crates: Math.min(count, CART_CRATES), more: Math.max(0, count - CART_CRATES) };
}

/** Where the known part of the belt ends: the commits station, plus a step of rail. */
export const KNOWN_UNTIL = 0.27;

/** A room on its way out after its worktree merged: drawn once more where it stood. */
export interface Retiree {
  entry: RoomEntry;
  /** The floor it stood on, or `null` for the front stage. */
  floor: string | null;
  index: number;
}

/** A retiring room shows its merge: the crate rides to main and the room is no longer at work. */
export function retireeOf(entry: RoomEntry, floor: string | null, index: number): Retiree {
  return { entry: { ...entry, state: { kind: 'merged' }, stage: 'main' }, floor, index };
}

/**
 * The plan with rooms that just merged kept where they stood until their merge has been shown, so
 * the rooms around them do not move in early. A front stage that grows past its limit hands its
 * last rooms back to the front of their floors.
 */
export function withRetirees(plan: RoomPlan, retirees: readonly Retiree[], stageLimit: number): RoomPlan {
  if (retirees.length === 0) return plan;
  const insert = (rooms: RoomEntry[], retiree: Retiree) => rooms.splice(Math.min(retiree.index, rooms.length), 0, retiree.entry);
  const stage = [...plan.stage];
  const floors = plan.floors.map(floor => ({ ...floor, rooms: [...floor.rooms] }));
  for (const retiree of [...retirees].sort((a, b) => a.index - b.index)) {
    if (retiree.floor === null) {
      insert(stage, retiree);
      continue;
    }
    let floor = floors.find(candidate => candidate.key === retiree.floor);
    if (!floor) {
      floor = { key: retiree.floor, session: retiree.entry.session, rooms: [], total: 0, working: 0, attention: 0 };
      floors.push(floor);
    }
    insert(floor.rooms, retiree);
  }
  const retiring = new Set(retirees.map(retiree => retiree.entry.key));
  // A retiring room keeps its old slot; the stage stays a whole grid by handing back an idle room,
  // then a stuck one, before any at work, so the rooms around it move once, after it has gone.
  const fits = FULL_STAGES.filter(size => size <= Math.min(stage.length, stageLimit)).at(-1) ?? stageLimit;
  while (stage.length > fits) {
    const last = (tier: RoomEntry['tier'] | null) => stage.findLastIndex(room => !retiring.has(room.key) && (tier === null || room.tier === tier));
    const index = [last('held'), last('attention'), last(null)].find(found => found >= 0) ?? -1;
    if (index < 0) break;
    const [room] = stage.splice(index, 1);
    const key = room.session?.key ?? NO_SESSION_FLOOR;
    let floor = floors.find(candidate => candidate.key === key);
    if (!floor) {
      floor = { key, session: room.session, rooms: [], total: 0, working: 0, attention: 0 };
      floors.push(floor);
    }
    floor.rooms.unshift(room);
  }
  return { ...plan, stage, floors };
}
