import { BUILD_CHANGE, BUILD_CONCEPTS, BUILD_RELATIONS, type BuildConceptId } from '../model/build-cast';

/**
 * The build-with-Moru section as a reducer: open the folder, name each concept, link the two
 * relations in order, apply the agent's commit, look at the concept it changed, and finish.
 */
export type BuildPhase = 'closed' | 'reading' | 'naming' | 'linking' | 'commit' | 'impact' | 'inspect' | 'done';

export interface BuildState {
  phase: BuildPhase;
  /** The option the person chose for each concept, in `BUILD_CONCEPTS` order; null until named. */
  names: readonly (number | null)[];
  /** Relations drawn so far, in `BUILD_RELATIONS` order. */
  links: number;
  /** The concept tapped first while linking. */
  pick: BuildConceptId | null;
  /** Counts taps that did not fit, so the same miss twice still replays its nudge. */
  misses: number;
}

export type BuildAction =
  | { type: 'open' }
  | { type: 'read' }
  | { type: 'name'; option: number }
  | { type: 'tap'; concept: BuildConceptId }
  | { type: 'commit' }
  | { type: 'confirm' }
  | { type: 'restart' };

export const INITIAL_BUILD: BuildState = {
  phase: 'closed',
  names: BUILD_CONCEPTS.map(() => null),
  links: 0,
  pick: null,
  misses: 0,
};

/** The concept the person is naming now, or null outside naming. */
export function namingIndex(state: BuildState): number | null {
  if (state.phase !== 'naming') return null;
  const index = state.names.indexOf(null);
  return index === -1 ? null : index;
}

/** The relation the person is drawing now, or null outside linking. */
export function linkingRelation(state: BuildState) {
  return state.phase === 'linking' ? (BUILD_RELATIONS[state.links] ?? null) : null;
}

/** The five steps the progress row names; reading belongs to opening the folder. */
export function stepOf(phase: BuildPhase): 0 | 1 | 2 | 3 | 4 {
  switch (phase) {
    case 'closed':
    case 'reading':
      return 0;
    case 'naming':
      return 1;
    case 'linking':
      return 2;
    case 'commit':
    case 'impact':
    case 'inspect':
      return 3;
    case 'done':
      return 4;
  }
}

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case 'restart':
      return INITIAL_BUILD;
    case 'open':
      return state.phase === 'closed' ? { ...state, phase: 'reading' } : state;
    case 'read':
      return state.phase === 'reading' ? { ...state, phase: 'naming' } : state;
    case 'name': {
      const index = namingIndex(state);
      if (index === null) return state;
      const names = state.names.map((chosen, at) => (at === index ? action.option : chosen));
      return { ...state, names, phase: names.includes(null) ? 'naming' : 'linking' };
    }
    case 'tap':
      return tap(state, action.concept);
    case 'commit':
      return state.phase === 'commit' ? { ...state, phase: 'impact' } : state;
    case 'confirm':
      return state.phase === 'inspect' ? { ...state, phase: 'done' } : state;
  }
}

function tap(state: BuildState, concept: BuildConceptId): BuildState {
  if (state.phase === 'impact' || state.phase === 'inspect') {
    if (concept !== BUILD_CHANGE.concept) return { ...state, misses: state.misses + 1 };
    return { ...state, phase: state.phase === 'impact' ? 'inspect' : 'impact' };
  }
  const relation = linkingRelation(state);
  if (!relation) return state;
  if (state.pick === null) {
    return concept === relation.from ? { ...state, pick: concept } : { ...state, misses: state.misses + 1 };
  }
  if (concept === state.pick) return { ...state, pick: null };
  if (concept !== relation.to) return { ...state, misses: state.misses + 1 };
  const links = state.links + 1;
  return { ...state, links, pick: null, phase: links === BUILD_RELATIONS.length ? 'commit' : 'linking' };
}
