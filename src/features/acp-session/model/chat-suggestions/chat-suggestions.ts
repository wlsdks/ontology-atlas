/**
 * Next steps measured from this folder's map. A row exists only when its number is counted from the
 * graph and is above zero; the screen translates the keys, and a press sends the request at once.
 */

/** How many measured fixes are shown at once, before the whole-map check. Given too many choices, people choose none (Hick). */
export const SUGGESTION_LIMIT = 3;

/** How many slugs a request names before it says only the count. */
const NAMED_SLUG_LIMIT = 12;

type SuggestionKind =
  /** Starter vault whose project has no source binding: connect before building. */
  | 'connectSource'
  /** Nothing beyond the starter nodes has been built. */
  | 'build'
  /** Capabilities that record neither `depends_on` nor an element. */
  | 'dependencies'
  /** Concepts in groups detached from the main map. */
  | 'standAlone'
  /** Titles shaped like a path, a file name or an identifier. */
  | 'rename'
  /** Concepts whose cited source changed after their document. */
  | 'update'
  /** Read-only review of the whole map, always last. */
  | 'check'
  /** Not a choice: the quiet line shown when nothing measured is left. */
  | 'nothingLeft'
  /** A concept is picked: explain it from its own record and relations. */
  | 'explainSubject'
  /** A concept is picked: name what a change to it would reach. */
  | 'subjectImpact';

export interface ChatSuggestion {
  kind: SuggestionKind;
  /** Values passed to `t(...)`: counts for labels, canonical slugs for requests. */
  params: Record<string, string | number>;
}

export interface SuggestionInput {
  nodeCount: number;
  sourceState?: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects';
  /** Groups that fell outside the main cluster, as canonical slugs. */
  islands: readonly (readonly string[])[];
  /** Capabilities with neither `depends_on` nor `elements`. */
  withoutDependency: readonly string[];
  /** Concepts whose title reads like code. */
  codeShaped: readonly string[];
  /** Concepts whose cited file changed after their document; `null` when not measured. */
  changedSource: readonly string[] | null;
}

/**
 * The boundary of "not started yet". `init` plants five starter nodes, so at or below that nobody has
 * built this map yet.
 */
const STARTER_NODE_CEILING = 5;

export function isPressableSuggestion(suggestion: ChatSuggestion): boolean {
  return suggestion.kind !== 'nothingLeft';
}

/** Asks about one picked concept; the folder-wide list returns when nothing is picked. */
export function subjectSuggestions(subject: { slug: string; label: string }): ChatSuggestion[] {
  const params = { slug: subject.slug, subject: subject.label };
  return [
    { kind: 'explainSubject', params },
    { kind: 'subjectImpact', params },
  ];
}

function slugsParams(slugs: readonly string[]): { count: number; slugs: string; rest: number } {
  const unique = [...new Set(slugs)].sort();
  const named = unique.slice(0, NAMED_SLUG_LIMIT);
  return { count: unique.length, slugs: named.join(', '), rest: unique.length - named.length };
}

export function chatSuggestions(input: SuggestionInput): ChatSuggestion[] {
  if (input.nodeCount <= STARTER_NODE_CEILING) {
    if (input.sourceState === 'unbound') {
      return [{ kind: 'connectSource', params: { count: input.nodeCount } }];
    }
    // Still reading, or no code to build from: nothing is measured yet, so nothing is offered.
    if (
      input.sourceState === 'loading'
      || input.sourceState === 'unavailable'
      || input.sourceState === 'no-projects'
    ) {
      return [];
    }
    return [{ kind: 'build', params: { count: input.nodeCount } }];
  }

  const repairs: ChatSuggestion[] = [];
  const measured: Array<[SuggestionKind, readonly string[]]> = [
    ['dependencies', input.withoutDependency],
    ['standAlone', input.islands.flat()],
    ['rename', input.codeShaped],
    ['update', input.changedSource ?? []],
  ];
  for (const [kind, slugs] of measured) {
    if (slugs.length > 0) repairs.push({ kind, params: slugsParams(slugs) });
  }

  if (repairs.length === 0) return [{ kind: 'nothingLeft', params: {} }];
  const check: ChatSuggestion = { kind: 'check', params: { count: input.nodeCount } };
  return [...repairs.slice(0, SUGGESTION_LIMIT), check];
}
