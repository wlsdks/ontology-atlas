/** The single source for meaning gaps, read by the agent panel's chips. */

/** Gaps a person can fill once they know what the thing means. */
type MeaningGapKind = "missing-definition" | "missing-domain";

export interface ConceptDocFacts {
  /** `VaultDoc.meaningFindings` verbatim; empty means asked and none found. */
  findings: readonly string[];
  /** Raw `domain:`; empty means no parent. */
  domainRef: string | null;
  /** For the concurrent-edit guard when a gap is filled; null for static samples. */
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
  // The definition result is the validator's; a caller without findings gets no rows, never a clean
  // claim.
  const findings = doc.findings ?? [];
  if (findings.includes("definition-missing")) gaps.push("missing-definition");
  if (DOMAIN_REQUIRED_KINDS.has(node.kind) && !doc.domainRef) {
    gaps.push("missing-domain");
  }
  return gaps;
}
