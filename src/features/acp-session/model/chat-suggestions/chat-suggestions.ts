/** Next steps measured from this folder's map: a row exists only when its number is counted from the graph and is above zero. */

import type { NotMappedAreas } from '@/shared/lib/vault-document/not-mapped-areas';

import type { UnreadCapability } from './measured-facts';

/** How many measured fixes are shown at once, before the whole-map check. Given too many choices, people choose none (Hick). */
export const SUGGESTION_LIMIT = 3;

const NAMED_SLUG_LIMIT = 12;

/** The agent finishes a read request of this size in one turn; a whole-map read is never done in one. */
export const READ_BATCH_LIMIT = 8;

type SuggestionKind =
  /** Starter vault whose project has no source binding: connect before building. */
  | 'connectSource'
  /** Nothing beyond the starter nodes has been built. */
  | 'build'
  /** Abilities the project records as not on the map yet: map the next areas that hold them. */
  | 'mapArea'
  /** Capabilities whose body cites no lines read from the code. */
  | 'readRules'
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
  /** Not a choice: the quiet line shown when every fact was measured and none is left. */
  | 'nothingLeft'
  /** Not a choice: nothing counted, while one fact (changed source) could not be measured. */
  | 'nothingCounted'
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
  islands: readonly (readonly string[])[];
  /** The project with the most abilities not on the map yet, from its `## Uncertainty` line. */
  notMappedAreas?: NotMappedAreas | null;
  withoutReadRule?: { unread: readonly UnreadCapability[]; measured: number };
  withoutDependency: readonly string[];
  codeShaped: readonly string[];
  /** Concepts whose cited file changed after their document; `null` when not measured. */
  changedSource: readonly string[] | null;
}

// `init` plants five starter nodes, so at or below that nobody has built this map yet.
const STARTER_NODE_CEILING = 5;

/**
 * The only shape a slug may have to be named in a request sent without the person reading it: a flat
 * kind folder or root name in lower-case words. Frontmatter is the folder's text, so anything else
 * (a sentence, a quote, a newline) is counted but never named.
 */
const SAFE_SLUG = /^(?:(?:domains|capabilities|elements|documents)\/)?[a-z0-9][a-z0-9-]{0,63}$/;

export function isSafeSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SAFE_SLUG.test(slug);
}

export function isPressableSuggestion(suggestion: ChatSuggestion): boolean {
  return suggestion.kind !== 'nothingLeft' && suggestion.kind !== 'nothingCounted';
}

/** A picked-concept row sends only its validated slug; one whose slug fails the shape fills the message box so the person reads it first. */
export function isSendableSuggestion(suggestion: ChatSuggestion): boolean {
  if (suggestion.kind === 'explainSubject' || suggestion.kind === 'subjectImpact') {
    return isSafeSlug(suggestion.params.slug);
  }
  return true;
}

export function subjectSuggestions(subject: { slug: string; label: string }): ChatSuggestion[] {
  const params = { slug: subject.slug.replace(/^ontology\//, ''), subject: subject.label };
  return [
    { kind: 'explainSubject', params },
    { kind: 'subjectImpact', params },
  ];
}

function slugsParams(slugs: readonly string[]): { count: number; named: number; slugs: string; rest: number } {
  const unique = [...new Set(slugs.map((slug) => slug.replace(/^ontology\//, '')))].sort();
  const named = unique.filter(isSafeSlug).slice(0, NAMED_SLUG_LIMIT);
  return { count: unique.length, named: named.length, slugs: named.join(', '), rest: unique.length - named.length };
}

const bySlug = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The capabilities one read request names: the domain with the most nameable unread capabilities
 * first, filled from the next domains only when it holds fewer than the batch. Slugs that fail
 * `isSafeSlug` are counted, never named. O(n log n) in the unread capabilities.
 */
export function readRuleBatch(unread: readonly UnreadCapability[]): string[] {
  const groups = new Map<string, Set<string>>();
  for (const { slug, domain } of unread) {
    const bare = slug.replace(/^ontology\//, '');
    if (!isSafeSlug(bare)) continue;
    const group = groups.get(domain) ?? new Set<string>();
    group.add(bare);
    groups.set(domain, group);
  }
  const ordered = [...groups.entries()].sort(([domainA, a], [domainB, b]) =>
    b.size - a.size || Number(domainA === '') - Number(domainB === '') || bySlug(domainA, domainB));
  return ordered.flatMap(([, slugs]) => [...slugs].sort(bySlug)).slice(0, READ_BATCH_LIMIT);
}

function readRulesParams({ unread, measured }: { unread: readonly UnreadCapability[]; measured: number }) {
  const named = readRuleBatch(unread);
  const count = new Set(unread.map(({ slug }) => slug.replace(/^ontology\//, ''))).size;
  return { count, total: measured, named: named.length, slugs: named.join(', ') };
}

/** Whole percent of the surveyed abilities on the map; 100 would say "done" while some are still off it. */
function mappedPercent(abilitiesUncovered: number, abilitiesTotal: number): number {
  return Math.min(99, Math.round((100 * (abilitiesTotal - abilitiesUncovered)) / abilitiesTotal));
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
  // Breadth before depth: an area not on the map has no capability to read or repair yet.
  if (input.notMappedAreas && input.notMappedAreas.abilitiesUncovered > 0) {
    const { abilitiesUncovered, abilitiesTotal } = input.notMappedAreas;
    repairs.push({ kind: 'mapArea', params: { percent: mappedPercent(abilitiesUncovered, abilitiesTotal), total: abilitiesTotal } });
  }
  // A rule read from code is what the other repairs build on, so it comes next.
  if (input.withoutReadRule && input.withoutReadRule.unread.length > 0) {
    repairs.push({ kind: 'readRules', params: readRulesParams(input.withoutReadRule) });
  }
  const measured: Array<[SuggestionKind, readonly string[]]> = [
    ['dependencies', input.withoutDependency],
    ['standAlone', input.islands.flat()],
    ['rename', input.codeShaped],
    ['update', input.changedSource ?? []],
  ];
  for (const [kind, slugs] of measured) {
    if (slugs.length > 0) repairs.push({ kind, params: slugsParams(slugs) });
  }

  if (repairs.length === 0) {
    return [{ kind: input.changedSource === null ? 'nothingCounted' : 'nothingLeft', params: {} }];
  }
  const check: ChatSuggestion = { kind: 'check', params: { count: input.nodeCount } };
  return [...repairs.slice(0, SUGGESTION_LIMIT), check];
}
