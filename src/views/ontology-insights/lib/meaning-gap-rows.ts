import {
  detectMeaningFindingGaps,
  detectMeaningGaps,
  resolveNodeAgentTarget,
  resolveNodeDocument,
  MEANING_FINDING_GAP_KINDS,
  type ConceptDocFacts,
  type KnowledgeGraphNode,
  type MeaningFindingGapKind,
  type MeaningGapKind,
} from "@/entities/knowledge-graph";
import { canonicalizeDomainRef } from "@/shared/lib/canonicalize-domain-ref";
import { fillHandoffTemplate, withDoNextVerification } from "./do-next-queue";

/**
 * The to-do queue's meaning rows: `missing-definition` and `missing-domain` are written here, one frontmatter key
 * each; the four findings name the node and open it, since prose or a file move answers
 * them: `missing-boundary`, `missing-uncertainty`, `epistemic-exclusion`, `slug-outside-kind-folder`.
 * A definition goes in frontmatter `description`: the schema (`mcp/src/schema.mjs`) gives every kind one, MCP,
 * CLI and the map popover read it, and it changes one field without rewriting the body. Whether a body already
 * defines the concept is the manifest's recorded finding (`VaultDoc.meaningFindings`,
 * from `src/shared/lib/meaning-findings.ts`), the same rule `validate_vault` reports. Only nodes with their own
 * document appear (`resolveNodeDocument`), so nothing is written into another concept's file.
 */

/**
 * The gap kinds and verdict belong to `@/entities/knowledge-graph`, shared with the agent panel's opening-line
 * chips so both name the same concepts; this only re-exports them.
 */
export type { ConceptDocFacts };

export interface MeaningGapRow {
  /** Unique row id, for the review loop and `key`. */
  id: string;
  gap: MeaningGapKind;
  /** The graph node id, for map and workshop deep links. */
  nodeId: string;
  /** The file to write, `resolveNodeDocument(node).ownSlug`; nothing else is written. */
  ownSlug: string;
  /** The name an agent is pointed at (`resolveNodeAgentTarget`). */
  agentRef: string;
  title: string;
  nodeKind: string;
  mtime: number | null;
  /** The sentence used when handing this row to an agent. */
  handoffPayload: string;
}

/**
 * A node reported by a finding answered with prose or a file move, so no handoff template or write form:
 * only what is needed to name the node and open it.
 */
interface MeaningFindingRow {
  /** Unique row id, `<section>:<slug>`, the shape the queue's other ids use. */
  id: string;
  gap: MeaningFindingGapKind;
  /** The graph node id, for map and workshop deep links. */
  nodeId: string;
  /** The document the finding is about. */
  ownSlug: string;
  title: string;
  nodeKind: string;
}

/** Row lists per finding section. */
export type MeaningFindingRows = Record<MeaningFindingGapKind, MeaningFindingRow[]>;
type MeaningFindingCounts = Record<MeaningFindingGapKind, number>;

export interface MeaningGapResult {
  definitionRows: MeaningGapRow[];
  domainRows: MeaningGapRow[];
  /** The four advisory finding sections, truncated to the display limit; `counts.findings` keeps their totals. */
  findingRows: MeaningFindingRows;
  counts: {
    missingDefinition: number;
    missingDomain: number;
    findings: MeaningFindingCounts;
  };
}

function emptyFindingRows(): MeaningFindingRows {
  return {
    "missing-boundary": [],
    "missing-uncertainty": [],
    "epistemic-exclusion": [],
    "slug-outside-kind-folder": [],
  };
}

export interface DomainChoice {
  /** The frontmatter value, the tail-slug form the vault uses. */
  value: string;
  label: string;
}

/** Meaning-gap templates (`%ref%` token) plus the shared verification gate. */
export interface MeaningGapProse {
  verificationGate: string;
  missingDefinition: string;
  missingDefinitionProof: string;
  missingDomain: string;
  missingDomainProof: string;
}

export interface BuildMeaningGapOptions {
  prose: MeaningGapProse;
  /** Display limit per kind; defaults to 3, the queue card's rhythm. */
  perKindLimit?: number;
}

export function buildMeaningGapRows(
  nodes: readonly KnowledgeGraphNode[],
  facts: ReadonlyMap<string, ConceptDocFacts>,
  options: BuildMeaningGapOptions,
): MeaningGapResult {
  const prose = options.prose;
  const perKindLimit = options.perKindLimit ?? 3;
  const definitionRows: MeaningGapRow[] = [];
  const domainRows: MeaningGapRow[] = [];
  const findingRows = emptyFindingRows();

  for (const node of nodes) {
    const { ownSlug } = resolveNodeDocument(node);
    if (!ownSlug) continue; // No document means no file to fix.
    const doc = facts.get(ownSlug);
    if (!doc) continue; // Never write to a document absent from the manifest.
    const agentRef = resolveNodeAgentTarget(node).ref ?? ownSlug;
    const base = {
      nodeId: node.id,
      ownSlug,
      agentRef,
      title: node.display ?? node.title,
      nodeKind: node.kind,
      mtime: doc.mtime,
    };
    const gaps = detectMeaningGaps(node, doc);
    if (gaps.includes("missing-definition")) {
      definitionRows.push({
        ...base,
        id: `missing-definition:${ownSlug}`,
        gap: "missing-definition",
        handoffPayload: withDoNextVerification(
          fillHandoffTemplate(prose.missingDefinition, { ref: agentRef }),
          fillHandoffTemplate(prose.missingDefinitionProof, { ref: agentRef }),
          prose.verificationGate,
        ),
      });
    }
    for (const finding of detectMeaningFindingGaps(doc)) {
      findingRows[finding].push({
        id: `${finding}:${ownSlug}`,
        gap: finding,
        nodeId: base.nodeId,
        ownSlug,
        title: base.title,
        nodeKind: base.nodeKind,
      });
    }
    if (gaps.includes("missing-domain")) {
      domainRows.push({
        ...base,
        id: `missing-domain:${ownSlug}`,
        gap: "missing-domain",
        handoffPayload: withDoNextVerification(
          fillHandoffTemplate(prose.missingDomain, { ref: agentRef }),
          fillHandoffTemplate(prose.missingDomainProof, { ref: agentRef }),
          prose.verificationGate,
        ),
      });
    }
  }

  // By name, so the row just seen stays in place between visits.
  const byTitle = (a: { title: string }, b: { title: string }) =>
    a.title.localeCompare(b.title);
  definitionRows.sort(byTitle);
  domainRows.sort(byTitle);

  const findingCounts = {} as MeaningFindingCounts;
  const shownFindingRows = emptyFindingRows();
  for (const section of MEANING_FINDING_GAP_KINDS) {
    const rows = findingRows[section];
    rows.sort(byTitle);
    findingCounts[section] = rows.length;
    shownFindingRows[section] = rows.slice(0, perKindLimit);
  }

  return {
    definitionRows: definitionRows.slice(0, perKindLimit),
    domainRows: domainRows.slice(0, perKindLimit),
    findingRows: shownFindingRows,
    counts: {
      missingDefinition: definitionRows.length,
      missingDomain: domainRows.length,
      findings: findingCounts,
    },
  };
}

/** Parent candidates: only domain documents in the vault. Creating an area is new meaning, the workshop's job. */
export function buildDomainChoices(
  nodes: readonly KnowledgeGraphNode[],
): DomainChoice[] {
  const choices = new Map<string, DomainChoice>();
  for (const node of nodes) {
    if (node.kind !== "domain") continue;
    const { ownSlug } = resolveNodeDocument(node);
    if (!ownSlug) continue;
    const value = canonicalizeDomainRef(ownSlug);
    if (!value || choices.has(value)) continue;
    choices.set(value, { value, label: node.display ?? node.title });
  }
  return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label));
}
