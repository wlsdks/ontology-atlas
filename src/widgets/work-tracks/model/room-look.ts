import { FULL_STAGES, NO_SESSION_FLOOR, type RoomEntry, type RoomPlan, type RoomStage, type RoomState } from '@/shared/lib/work-status/work-tracks';

/** Moru's rows a room plays, all existing catalogue rows (`docs/design/brand.md`, "Contextual motion"). */
export type RoomClip = 'code' | 'read' | 'waiting' | 'clap';

export type CrateKind = 'plain' | 'taped' | 'ghost' | 'dusty';

export interface RoomLook {
  /** The lamp is lit and the room's light moves only while something runs. */
  running: boolean;
  monitorOff: boolean;
  crate: CrateKind;
  /** No Moru when nobody is in the room: a session ended, the folder is gone, or none ever held it. */
  cast: 'none' | 'one' | 'two';
  clip: RoomClip;
  /** A still Moru holds the clip's neutral pose. */
  still: boolean;
  dozing: boolean;
}

export function roomLook(state: RoomState): RoomLook {
  const quiet = { running: false, monitorOff: false, crate: 'plain', cast: 'one', clip: 'waiting', still: true, dozing: false } as const;
  switch (state.kind) {
    case 'working':
      return { ...quiet, running: true, cast: state.tools.length > 1 ? 'two' : 'one', clip: 'code', still: false };
    case 'resting':
    case 'locked':
      return quiet;
    case 'dozing':
      return { ...quiet, dozing: true };
    case 'merged':
      return { ...quiet, clip: 'clap', still: false };
    case 'lockLeft':
      return { ...quiet, monitorOff: true, crate: 'taped', cast: 'none' };
    case 'missing':
      return { ...quiet, monitorOff: true, crate: 'ghost', cast: 'none' };
    case 'unheld':
      return { ...quiet, crate: 'dusty', cast: 'none' };
  }
}

/** Moru's work loop has 24 poses; each room starts at its own, so rooms side by side never type in step. */
const LOOP_POSES = 24;

/** The fraction of the loop a room's Moru starts at: a whole pose picked from its worktree's key. */
export function moruPhase(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % LOOP_POSES) / LOOP_POSES;
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
