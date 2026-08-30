/**
 * The answer to "what should I even ask" — derived from **this folder's current state**.
 *
 * Why (owner instruction, 2026-08-17). Opening the conversation gives you one empty input. Having an
 * agent attached and not knowing what to ask it makes that connection worth nothing.
 *
 * But the common answer — pinning three example sentences — is decoration, not a recommendation.
 * *"Ask me anything"* and *"explain the code"* could be attached to any app, and so carry no value.
 * Worse, a user who presses one gets an answer unrelated to their folder and stops trusting the
 * recommendations at all.
 *
 * So one rule: **a recommendation about a fact appears only when that fact is actually observed in
 * the current vault.** With no disconnected cluster, "connect them" never appears. The material is
 * already computed (`computeVaultHealth`'s `islands` and `missingContainment`) — the same values the
 * map and the analysis screen use.
 *
 * **Why keys and values rather than sentences.** This function stays pure and the screen does the
 * translation. Building sentences here would, in a repository with two locales, either emit Korean
 * only or let the translation files and this file diverge.
 */

/** How many are shown at once. Given too many choices, people choose none (Hick). */
export const SUGGESTION_LIMIT = 3;

export type SuggestionKind =
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
  | 'explain';

export interface ChatSuggestion {
  kind: SuggestionKind;
  /** The values the screen passes straight to `t(...)`. Real slugs and counts go in here. */
  params: Record<string, string | number>;
}

export interface SuggestionInput {
  nodeCount: number;
  /** Groups that fell outside the main cluster (`VaultHealthResult.islands`) */
  islands: readonly (readonly string[])[];
  missingContainment: readonly { slug: string; domain: string }[];
  /** Capability slugs matching maintenance_plan's capability_without_evidence predicate */
  unevidenced: readonly string[];
  sourceState?: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects';
}

/**
 * The boundary of "not started yet". `init` plants five starter nodes, so at or below that nobody has
 * built this map yet.
 */
const STARTER_NODE_CEILING = 5;

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
      params: { first: biggestIsland[0], count: biggestIsland.length },
    });
  }

  const gap = input.missingContainment[0];
  if (gap) {
    out.push({ kind: 'containment', params: { slug: gap.slug, domain: gap.domain } });
  }

  if (input.unevidenced.length > 0) {
    out.push({
      kind: 'evidence',
      params: { first: input.unevidenced[0], count: input.unevidenced.length },
    });
  }

  // This is the fallback when fewer than three observed repairs fill the list. A vault with three
  // concrete repairs keeps those ahead of a generic explanation; a clean vault never leaves empty hands.
  out.push({ kind: 'explain', params: { count: input.nodeCount } });

  return out.slice(0, SUGGESTION_LIMIT);
}
