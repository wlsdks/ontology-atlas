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

/**
 * The rest of what the validator hears about one document's body and position.
 *
 * Kept apart from `MeaningGapKind` on purpose. That type is the opening-line chip's
 * vocabulary too (`features/vault-agent/model/first-words.ts`), and a chip can only
 * offer a sentence it has prose for; these four are queue rows that open a node, not
 * fields a panel can offer to fill. One list would have made every new finding a new
 * chip the panel cannot speak.
 */
export type MeaningFindingGapKind =
  | "missing-boundary"
  | "missing-uncertainty"
  | "epistemic-exclusion"
  | "slug-outside-kind-folder";

/**
 * Finding code → the queue section that shows it. Written out rather than derived, so
 * a code the manifest starts emitting is either mapped here on purpose or ignored —
 * never renamed into a section by accident.
 */
const FINDING_GAP_BY_CODE: Readonly<Record<string, MeaningFindingGapKind>> = {
  "boundary-missing": "missing-boundary",
  "uncertainty-missing": "missing-uncertainty",
  "epistemic-exclusion": "epistemic-exclusion",
  "slug-outside-kind-folder": "slug-outside-kind-folder",
};

/** The order the sections are read in — the validator's own order, minus the definition. */
export const MEANING_FINDING_GAP_KINDS: readonly MeaningFindingGapKind[] = [
  "missing-boundary",
  "missing-uncertainty",
  "epistemic-exclusion",
  "slug-outside-kind-folder",
];

/** Only the facts a gap verdict needs, read from one vault document. */
export interface ConceptDocFacts {
  /**
   * The document's meaning findings as portable codes, carried verbatim from
   * `VaultDoc.meaningFindings` — the same judgement `validate_vault` and the CLI
   * report. Empty means the question was asked and nothing came back.
   */
  findings: readonly string[];
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
  // The definition verdict is the validator's, not this screen's. It used to be
  // "`description` or any excerpt", which counted a heading and a placeholder as a
  // definition and let the queue call a body clean that `validate_vault` was already
  // reporting as `definition-missing` to the agent reading the same folder.
  if (doc.findings.includes("definition-missing")) gaps.push("missing-definition");
  if (DOMAIN_REQUIRED_KINDS.has(node.kind) && !doc.domainRef) {
    gaps.push("missing-domain");
  }
  return gaps;
}

/**
 * The remaining findings for this document, deduplicated and in a fixed order.
 *
 * Deduplicated because a section here is **one row per node**: `boundary-missing`
 * arrives once per missing side, so a capability stating neither what it includes nor
 * what it excludes would otherwise be two rows pointing at one file.
 */
export function detectMeaningFindingGaps(
  doc: ConceptDocFacts,
): MeaningFindingGapKind[] {
  const seen = new Set<MeaningFindingGapKind>();
  for (const code of doc.findings) {
    const gap = FINDING_GAP_BY_CODE[code];
    if (gap) seen.add(gap);
  }
  return MEANING_FINDING_GAP_KINDS.filter((gap) => seen.has(gap));
}
