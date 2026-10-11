/**
 * Suggestions derived from this folder's state: a recommendation appears only when its fact
 * is observed (`computeVaultHealth`: `islands`, `missingContainment`). Returns keys, not
 * sentences, so the screen translates.
 */

/** How many are shown at once. Given too many choices, people choose none (Hick). */
export const SUGGESTION_LIMIT = 3;

type SuggestionKind =
  /** starter vault has a project but no source binding — connect before analysis */
  | 'connectSource'
  /** The vault is empty — nothing to fix, so recommend making something */
  | 'bootstrap'
  /** There is a cluster detached from the map */
  | 'island'
  /** A node points at a domain but the domain does not point back */
  | 'containment'
  /** A capability has neither canonical `path:` nor a resolved `elements:` implementation relation */
  | 'evidence'
  /** The one that is always there — have it explain this folder from the map alone */
  | 'explain'
  /** A concept is picked — explain that concept from its own record and relations */
  | 'explainSubject'
  /** A concept is picked — name what a change to it would reach */
  | 'subjectImpact';

export interface ChatSuggestion {
  kind: SuggestionKind;
  /** Values passed to `t(...)`: readable labels for UI plus canonical slugs for agent prompts. */
  params: Record<string, string | number>;
}

export interface SuggestionInput {
  nodeCount: number;
  /** Groups that fell outside the main cluster (`VaultHealthResult.islands`) */
  islands: readonly (readonly string[])[];
  missingContainment: readonly { slug: string; domain: string }[];
  /** Capability slugs matching maintenance_plan's capability_without_evidence predicate */
  unevidenced: readonly string[];
  /** Human-facing names keyed by canonical ontology slug; prompts still keep the slug itself. */
  displayNames?: Readonly<Record<string, string>>;
  sourceState?: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects';
}

/**
 * The boundary of "not started yet". `init` plants five starter nodes, so at or below that nobody has
 * built this map yet.
 */
const STARTER_NODE_CEILING = 5;

function displayName(input: SuggestionInput, slug: string): string {
  const recorded = input.displayNames?.[slug]?.trim();
  if (recorded) return recorded;
  const tail = slug.replace(/^ontology\//, '').split('/').at(-1) ?? slug;
  return tail.replaceAll('-', ' ');
}

/** Asks about one picked concept; the folder-wide list returns when nothing is picked. */
export function subjectSuggestions(subject: { slug: string; label: string }): ChatSuggestion[] {
  const params = { slug: subject.slug, subject: subject.label };
  return [
    { kind: 'explainSubject', params },
    { kind: 'subjectImpact', params },
  ];
}

export function chatSuggestions(input: SuggestionInput): ChatSuggestion[] {
  // Recommending "fix this" to a vault with nothing built yet invents a problem that does not exist.
  if (input.nodeCount <= STARTER_NODE_CEILING) {
    if (input.sourceState === 'unbound') {
      return [{ kind: 'connectSource', params: { count: input.nodeCount } }];
    }
    if (
      input.sourceState === 'loading'
      || input.sourceState === 'unavailable'
      || input.sourceState === 'no-projects'
    ) {
      return [];
    }
    return [{ kind: 'bootstrap', params: { count: input.nodeCount } }];
  }

  const out: ChatSuggestion[] = [];

  // Whatever is most tangible first — something with a name to fix leads.
  const biggestIsland = input.islands[0];
  if (biggestIsland && biggestIsland.length > 0) {
    out.push({
      kind: 'island',
      params: {
        first: biggestIsland[0],
        firstLabel: displayName(input, biggestIsland[0]),
        count: biggestIsland.length,
      },
    });
  }

  const gap = input.missingContainment[0];
  if (gap) {
    out.push({
      kind: 'containment',
      params: {
        slug: gap.slug,
        slugLabel: displayName(input, gap.slug),
        domain: gap.domain,
        domainLabel: displayName(input, gap.domain),
      },
    });
  }

  if (input.unevidenced.length > 0) {
    out.push({
      kind: 'evidence',
      params: {
        first: input.unevidenced[0],
        firstLabel: displayName(input, input.unevidenced[0]),
        count: input.unevidenced.length,
      },
    });
  }

  // This is the fallback when fewer than three observed repairs fill the list. A vault with three
  // concrete repairs keeps those ahead of a generic explanation; a clean vault never leaves empty hands.
  out.push({ kind: 'explain', params: { count: input.nodeCount } });

  return out.slice(0, SUGGESTION_LIMIT);
}
