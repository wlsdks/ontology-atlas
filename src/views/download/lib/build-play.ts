import { BUILD_CHANGE, CODE_NAMED, PERSON_RELATION, type BuildConceptId } from '../model/build-cast';

/**
 * The build-with-Moru section as a reducer, in the order Atlas is used: the agent writes the first
 * map while the person watches, Atlas finds two things to fix (a concept named like code and one
 * left standing alone), the person fixes them, then an agent's commit lands and the person looks
 * at the concept it changed.
 */
export type BuildPhase = 'closed' | 'building' | 'rename' | 'renaming' | 'linking' | 'commit' | 'impact' | 'inspect' | 'done';

/**
 * The agent's first map, one beat at a time: 1 gathers the files by job, 2-4 name the concepts in
 * `BUILD_CONCEPTS` order, 5 draws its relation. The next beat hands the map to the person.
 */
export const AGENT_BEATS = 5;

export interface BuildState {
  phase: BuildPhase;
  /** How far the agent's first map has come, 0 to `AGENT_BEATS`. */
  built: number;
  /** The word the person chose for the code-named concept; null until renamed. */
  renamed: number | null;
  /** Relations the person has drawn. */
  links: number;
  /** The concept pressed first while linking. */
  pick: BuildConceptId | null;
  /** Counts taps that did not fit; the line keys on it, so a second miss in a row replays. */
  misses: number;
}

export type BuildAction =
  | { type: 'open' }
  | { type: 'beat' }
  | { type: 'rename'; option: number }
  | { type: 'tap'; concept: BuildConceptId }
  | { type: 'commit' }
  | { type: 'confirm' }
  | { type: 'restart' };

export const INITIAL_BUILD: BuildState = { phase: 'closed', built: 0, renamed: null, links: 0, pick: null, misses: 0 };

/** Whether the concept at `order` has been written onto the map yet. */
export function isNamed(state: BuildState, order: number): boolean {
  if (state.phase === 'closed') return false;
  return state.phase !== 'building' || state.built >= order + 2;
}

/** Whether the agent's own relation is on the map. */
export const agentRelationDrawn = (state: BuildState) => state.phase !== 'closed' && (state.phase !== 'building' || state.built >= AGENT_BEATS);

/** The concept that glows for the next tap, or null when no tap is asked for. */
export function targetConcept(state: BuildState): BuildConceptId | null {
  if (state.phase === 'rename') return CODE_NAMED.concept;
  const relation = linkingRelation(state);
  if (relation) return state.pick === null ? relation.from : relation.to;
  return state.phase === 'impact' ? BUILD_CHANGE.concept : null;
}

/** The relation the person is drawing now, or null outside linking. */
export function linkingRelation(state: BuildState) {
  return state.phase === 'linking' ? PERSON_RELATION : null;
}

export const BUILD_STEPS = ['open', 'build', 'rename', 'link', 'change', 'done'] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

/** The step the progress row marks as now. */
export function stepOf(phase: BuildPhase): number {
  const step: Record<BuildPhase, BuildStep> = {
    closed: 'open',
    building: 'build',
    rename: 'rename',
    renaming: 'rename',
    linking: 'link',
    commit: 'change',
    impact: 'change',
    inspect: 'change',
    done: 'done',
  };
  return BUILD_STEPS.indexOf(step[phase]);
}

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case 'restart':
      return INITIAL_BUILD;
    case 'open':
      return state.phase === 'closed' ? { ...state, phase: 'building' } : state;
    case 'beat':
      if (state.phase !== 'building') return state;
      return state.built < AGENT_BEATS ? { ...state, built: state.built + 1 } : { ...state, phase: 'rename' };
    case 'rename':
      return state.phase === 'renaming' ? { ...state, renamed: action.option, phase: 'linking' } : state;
    case 'tap':
      return tap(state, action.concept);
    case 'commit':
      return state.phase === 'commit' ? { ...state, phase: 'impact' } : state;
    case 'confirm':
      return state.phase === 'inspect' ? { ...state, phase: 'done' } : state;
  }
}

function tap(state: BuildState, concept: BuildConceptId): BuildState {
  const miss = { ...state, misses: state.misses + 1 };
  if (state.phase === 'rename') return concept === CODE_NAMED.concept ? { ...state, phase: 'renaming' } : miss;
  if (state.phase === 'impact') return concept === BUILD_CHANGE.concept ? { ...state, phase: 'inspect' } : miss;
  const relation = linkingRelation(state);
  if (!relation) return state;
  if (state.pick === null) return concept === relation.from ? { ...state, pick: concept } : miss;
  if (concept === state.pick) return { ...state, pick: null };
  if (concept !== relation.to) return miss;
  return { ...state, links: state.links + 1, pick: null, phase: 'commit' };
}

