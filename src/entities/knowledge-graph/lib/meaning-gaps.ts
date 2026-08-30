/**
 * **One verdict on meaning gaps** — the single source deciding which blanks in a
 * concept a person could fill on the spot.
 *
 * This lived only inside the insights queue
 * (`views/ontology-insights/lib/meaning-gap-rows.ts`), but the agent panel's
 * opening-line chips ask the same question: where is this folder emptiest right now?
 * Two surfaces deciding independently means a day when the queue calls a concept
 * undefined and the panel calls it fine. That a second verdict diverges the moment
 * it is written is something this repository has already learned twice
 * (`resolveNodeDocument` and `resolveNodeAgentTarget` are single-sourced for the
 * same reason).
 *
 * Only the verdict lives here. Row assembly, handoff sentences, and limits belong
 * to each surface.
 */

/** The kinds of blank a person can fill as soon as they know what the thing means. */
export type MeaningGapKind = "missing-definition" | "missing-domain";

/** Only the facts a gap verdict needs, read from one vault document. */
export interface ConceptDocFacts {
  /** `description` or a body summary — either one means the meaning is written down. */
  hasDefinition: boolean;
  /** The raw `domain:` value, before normalization. Empty means no parent yet. */
  domainRef: string | null;
  /** `file.lastModified`, for the concurrent-edit guard. Null for static samples. */
  mtime: number | null;
}

/**
 * Kinds that require a `domain:` — the same set as `requiredExtras` in the schema
 * (`mcp/src/schema.mjs`). Projects, domains, and documents are complete concepts
 * without a parent.
 */
const DOMAIN_REQUIRED_KINDS: ReadonlySet<string> = new Set([
  "capability",
  "element",
]);

/**
 * The blanks in this concept, in priority order: meaning first, membership second.
 *
 * Meaning comes first because membership cannot be decided until you know what the
 * thing is. Reversed, the user is asked a question they cannot answer.
 */
export function detectMeaningGaps(
  node: { kind: string },
  doc: ConceptDocFacts,
): MeaningGapKind[] {
  const gaps: MeaningGapKind[] = [];
  if (!doc.hasDefinition) gaps.push("missing-definition");
  if (DOMAIN_REQUIRED_KINDS.has(node.kind) && !doc.domainRef) {
    gaps.push("missing-domain");
  }
  return gaps;
}
