import { BUILD_CHANGE, BUILD_RELATIONS, CODE_NAMED, loneEndOf, PERSON_RELATIONS, type BuildConcept, type BuildConceptId, type CodeNamedId } from '../model/build-cast';

/**
 * The build-with-Moru section as a reducer, in the order Atlas is used: the person asks for the
 * first map, the agent reads the repository and writes it cluster by cluster, Atlas counts what to
 * fix (concepts named like code, concepts standing alone), the person fixes them, then an agent's
 * commit lands and the person looks at the concept it changed.
 */
export type BuildPhase = 'closed' | 'building' | 'rename' | 'renaming' | 'linking' | 'commit' | 'impact' | 'inspect' | 'done';

/**
 * The agent's first map, one beat at a time: 1 reads the files, 2-6 write the concepts whose
 * `beat` it is, 7 draws its relations, 8 is Atlas counting what to fix. The next beat hands over.
 */
export const AGENT_BEATS = 8;
export const RELATIONS_BEAT = 7;
export const MEASURE_BEAT = 8;

export interface BuildState {
  phase: BuildPhase;
  built: number;
  renamed: Partial<Record<CodeNamedId, number>>;
  renaming: CodeNamedId | null;
  links: readonly number[];
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

export const INITIAL_BUILD: BuildState = { phase: 'closed', built: 0, renamed: {}, renaming: null, links: [], pick: null, misses: 0 };

const past = (state: BuildState, beat: number) => state.phase !== 'closed' && (state.phase !== 'building' || state.built >= beat);

export const isWritten = (state: BuildState, concept: BuildConcept) => past(state, concept.beat);
export const agentRelationsDrawn = (state: BuildState) => past(state, RELATIONS_BEAT);
export const isMeasured = (state: BuildState) => past(state, MEASURE_BEAT);

export const codeNamedLeft = (state: BuildState) => CODE_NAMED.filter((entry) => state.renamed[entry.concept] === undefined);
export const relationsLeft = (state: BuildState) => PERSON_RELATIONS.filter((_, index) => !state.links.includes(index));
export const isLinked = (state: BuildState, relation: (typeof PERSON_RELATIONS)[number]) => state.links.includes(PERSON_RELATIONS.indexOf(relation));

export function partnerOf(state: BuildState): BuildConceptId | null {
  if (state.pick === null) return null;
  const relation = relationsLeft(state).find((rel) => rel.from === state.pick || rel.to === state.pick);
  if (!relation) return null;
  return relation.from === state.pick ? relation.to : relation.from;
}

export function targetConcepts(state: BuildState): BuildConceptId[] {
  switch (state.phase) {
    case 'rename':
      return codeNamedLeft(state).map((entry) => entry.concept);
    case 'linking': {
      const partner = partnerOf(state);
      return partner ? [partner] : relationsLeft(state).map(loneEndOf);
    }
    case 'impact':
      return [BUILD_CHANGE.concept];
    default:
      return [];
  }
}

export const linkEnds = (state: BuildState): BuildConceptId[] =>
  state.phase === 'linking' && state.pick === null ? relationsLeft(state).flatMap((rel) => [rel.to, rel.from]) : [];

export const BUILD_STEPS = ['open', 'build', 'rename', 'link', 'change', 'done'] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

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
    case 'rename': {
      if (state.phase !== 'renaming' || state.renaming === null) return state;
      const renamed = { ...state.renamed, [state.renaming]: action.option };
      const done = CODE_NAMED.every((entry) => renamed[entry.concept] !== undefined);
      return { ...state, renamed, renaming: null, phase: done ? 'linking' : 'rename' };
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
  const miss = { ...state, misses: state.misses + 1 };
  if (state.phase === 'rename') {
    const entry = codeNamedLeft(state).find((left) => left.concept === concept);
    return entry ? { ...state, phase: 'renaming', renaming: entry.concept } : miss;
  }
  if (state.phase === 'impact') return concept === BUILD_CHANGE.concept ? { ...state, phase: 'inspect' } : miss;
  if (state.phase !== 'linking') return state;
  if (state.pick === null) return linkEnds(state).includes(concept) ? { ...state, pick: concept } : miss;
  if (concept === state.pick) return { ...state, pick: null };
  if (concept !== partnerOf(state)) return miss;
  const relation = relationsLeft(state).find((rel) => rel.from === state.pick || rel.to === state.pick)!;
  const links = [...state.links, PERSON_RELATIONS.indexOf(relation)];
  return { ...state, links, pick: null, phase: links.length === PERSON_RELATIONS.length ? 'commit' : 'linking' };
}

export const isRelationDrawn = (state: BuildState, relation: (typeof BUILD_RELATIONS)[number]) =>
  relation.by === 'agent' ? agentRelationsDrawn(state) : isLinked(state, relation);
