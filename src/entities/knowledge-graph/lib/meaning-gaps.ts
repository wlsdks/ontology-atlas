/** The single verdict on meaning gaps, shared by the insights queue and the agent panel's chips. */

/** Gaps a person can fill once they know what the thing means. */
export type MeaningGapKind = "missing-definition" | "missing-domain";

/** Other validator findings: queue rows only, kept apart because chips need prose for each kind. */
export type MeaningFindingGapKind =
  | "missing-boundary"
  | "missing-uncertainty"
  | "epistemic-exclusion"
  | "slug-outside-kind-folder";

/** Written out so a new code is mapped on purpose or ignored. */
const FINDING_GAP_BY_CODE: Readonly<Record<string, MeaningFindingGapKind>> = {
  "boundary-missing": "missing-boundary",
  "uncertainty-missing": "missing-uncertainty",
  "epistemic-exclusion": "epistemic-exclusion",
  "slug-outside-kind-folder": "slug-outside-kind-folder",
};

/** The validator's order, minus the definition. */
export const MEANING_FINDING_GAP_KINDS: readonly MeaningFindingGapKind[] = [
  "missing-boundary",
  "missing-uncertainty",
  "epistemic-exclusion",
  "slug-outside-kind-folder",
];

export interface ConceptDocFacts {
  /** `VaultDoc.meaningFindings` verbatim; empty means asked and none found. */
  findings: readonly string[];
  /** Raw `domain:`; empty means no parent. */
  domainRef: string | null;
  /** Null for static samples. */
  mtime: number | null;
}

/** Same set as `requiredExtras` in `mcp/src/schema.mjs`. */
const DOMAIN_REQUIRED_KINDS: ReadonlySet<string> = new Set([
  "capability",
  "element",
]);

/** Meaning first, then membership, since membership depends on meaning. */
export function detectMeaningGaps(
  node: { kind: string },
  doc: ConceptDocFacts,
): MeaningGapKind[] {
  const gaps: MeaningGapKind[] = [];
  // The definition verdict is the validator's; a caller without findings gets no rows, never a clean claim.
  const findings = doc.findings ?? [];
  if (findings.includes("definition-missing")) gaps.push("missing-definition");
  if (DOMAIN_REQUIRED_KINDS.has(node.kind) && !doc.domainRef) {
    gaps.push("missing-domain");
  }
  return gaps;
}

/** Deduplicated because a row is per node and `boundary-missing` arrives once per side. */
export function detectMeaningFindingGaps(
  doc: ConceptDocFacts,
): MeaningFindingGapKind[] {
  const seen = new Set<MeaningFindingGapKind>();
  for (const code of doc.findings ?? []) {
    const gap = FINDING_GAP_BY_CODE[code];
    if (gap) seen.add(gap);
  }
  return MEANING_FINDING_GAP_KINDS.filter((gap) => seen.has(gap));
}
