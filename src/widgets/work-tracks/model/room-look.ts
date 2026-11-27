import { MOTION } from '@/shared/motion';
import { FULL_STAGES, NO_SESSION_FLOOR, type RoomEntry, type RoomPlan, type RoomStage, type RoomState } from '@/shared/lib/work-status/work-tracks';

export type CrateKind = 'plain' | 'taped' | 'ghost' | 'dusty';

export interface RoomLook {
  /** The lamp is lit and the room's light moves only while something runs. */
  running: boolean;
  monitorOff: boolean;
  crate: CrateKind;
}

/**
 * What a room draws of its state beside its words, picked only by what Git and the locks show: work
 * running lights it, a lock left behind tapes its crate and dims its screen, a folder gone leaves a
 * dashed crate, and a folder nobody ever held a dusty one.
 */
export function roomLook(state: RoomState): RoomLook {
  const quiet = { running: false, monitorOff: false, crate: 'plain' } as const;
  switch (state.kind) {
    case 'working':
      return { ...quiet, running: true };
    case 'lockLeft':
      return { ...quiet, monitorOff: true, crate: 'taped' };
    case 'missing':
      return { ...quiet, monitorOff: true, crate: 'ghost' };
    case 'unheld':
      return { ...quiet, crate: 'dusty' };
    default:
      return quiet;
  }
}

/**
 * When a merged room's lights go out: its crate has ridden past the stop, the stop has turned green
 * and blinked twice (`.hatch` in `rooms.module.css`), and it has stayed green for a beat.
 */
export const MERGE_LIGHTS_OUT_MS = (1.6 * MOTION.choreography.duration + MOTION.expressive.duration + MOTION.slow.duration) * 1000;

/** What the page header counts: a session waiting for its person, two tools in one folder, or a worktree to clean up. */
export type RoomAlert = 'waiting' | 'sameFolder' | 'cleanup';

export function roomAlertOf(state: RoomState): RoomAlert | null {
  if (state.kind === 'waiting') return 'waiting';
  if (state.kind === 'working' && state.tools.length > 1) return 'sameFolder';
  return state.kind === 'lockLeft' || state.kind === 'missing' ? 'cleanup' : null;
}

/** How far along a mini room's track its work has come, as a fraction of the track. */
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
      floor = { key: retiree.floor, session: retiree.entry.session, rooms: [], total: 0, working: 0, attention: 0, waiting: 0 };
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
      floor = { key, session: room.session, rooms: [], total: 0, working: 0, attention: 0, waiting: 0 };
      floors.push(floor);
    }
    floor.rooms.unshift(room);
  }
  return { ...plan, stage, floors };
}
