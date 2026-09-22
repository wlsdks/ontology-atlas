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
 * **The meaning rows of the to-do queue** — the two gaps someone who does not read code can close
 * on the spot, plus the four findings that name a node and open it.
 *
 * - `missing-definition` — nowhere states what this concept means.
 * - `missing-domain` — a capability or element with no stated parent area.
 *
 * Those two are written from here, one frontmatter key each. The other four —
 * `missing-boundary`, `missing-uncertainty`, `epistemic-exclusion` and
 * `slug-outside-kind-folder` — are `MeaningFindingRow`s: they name the node and open it,
 * because each is answered by writing prose or moving a file, not by filling a field.
 *
 * **Where the definition is written.** It goes in the **frontmatter `description` key**. Because:
 * ① the schema source of truth (`mcp/src/schema.mjs`) gives all four kinds a `description` and
 * places it immediately after title in `preferredOrder`; ② MCP `patch_concept`, the CLI, and the
 * map popover already read that key; ③ being one scalar it can be fixed without touching the body —
 * writing into the body's first paragraph would mean rewriting the whole document, breaking this
 * row's promise that only one field changes.
 *
 * **What does not count as missing a definition.** Even with no `description`, **a body that
 * explains the concept counts as a definition.** Measured 2026-07-26: 91 of the dogfood vault's 92
 * concepts stated their meaning in the body with no `description`. Judging by key presence alone
 * would raise 91 false to-dos on a well-written vault, which makes the queue unusable.
 *
 * Which body counts is no longer decided here. Until 2026-09-22 the test was "a `description` or
 * any excerpt at all", so a heading and a placeholder bullet passed, and the queue called a node
 * defined while `validate_vault` was reporting `definition-missing` on the same file to the agent
 * standing next to the person. The verdict is now the manifest's recorded finding
 * (`VaultDoc.meaningFindings`), which both manifest builders take from
 * `src/shared/lib/meaning-findings.ts` — the port the parity contract holds to the canonical rule.
 *
 * **A concept with no document never appears here.** The verdict on where to write uses
 * `resolveNodeDocument` **alone**. A derived concept with no `.md` of its own has no file to fix
 * and is excluded from this list — its first step is "create the document", which another queue row
 * already hands off. Writing a second verdict reopens the accident of writing into someone else's
 * document.
 */

/**
 * The kinds of gap and the verdict are owned by `@/entities/knowledge-graph` — the agent panel's
 * opening-line chips ask the same question, so a second verdict would eventually have the queue and
 * the panel naming different concepts. This only re-exports the names.
 */
export type { ConceptDocFacts };

export interface MeaningGapRow {
  /** The row's unique id — for the review loop and for `key`. */
  id: string;
  gap: MeaningGapKind;
  /** The graph node id — for map and workshop deeplinks. */
  nodeId: string;
  /** **The file to write** — `resolveNodeDocument(node).ownSlug`. Nothing is written to any other path. */
  ownSlug: string;
  /** The name to point an agent at for this concept — `resolveNodeAgentTarget`. */
  agentRef: string;
  title: string;
  nodeKind: string;
  mtime: number | null;
  /** The sentence used when handing this row to an agent. */
  handoffPayload: string;
}

/**
 * One node reported by a finding the person cannot close by typing into a field.
 *
 * Narrower than `MeaningGapRow` on purpose: there is no handoff template and no write
 * form, because answering "what does this exclude?" or "where should this file sit?"
 * means opening the node and writing prose, not filling one frontmatter key. The row
 * carries only what is needed to name the node and open it.
 */
interface MeaningFindingRow {
  /** The row's unique id — `<section>:<slug>`, the same shape the queue's other ids use. */
  id: string;
  gap: MeaningFindingGapKind;
  /** The graph node id — for map and workshop deeplinks. */
  nodeId: string;
  /** The document the finding is about. */
  ownSlug: string;
  title: string;
  nodeKind: string;
}

/** Per-section row lists and pre-truncation totals, one entry per finding section. */
export type MeaningFindingRows = Record<MeaningFindingGapKind, MeaningFindingRow[]>;
type MeaningFindingCounts = Record<MeaningFindingGapKind, number>;

export interface MeaningGapResult {
  definitionRows: MeaningGapRow[];
  domainRows: MeaningGapRow[];
  /**
   * The four advisory finding sections, already truncated to the display limit.
   * Their totals live in `counts.findings`, so a shortened list still states its scale.
   */
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

/** One area available when assigning a parent. */
export interface DomainChoice {
  /** The value written into the frontmatter — the tail-slug form the whole vault uses. */
  value: string;
  /** The name shown on screen. */
  label: string;
}

/** The meaning-gap templates (`%ref%` token) plus the shared verification gate. */
export interface MeaningGapProse {
  verificationGate: string;
  missingDefinition: string;
  missingDefinitionProof: string;
  missingDomain: string;
  missingDomainProof: string;
}

export interface BuildMeaningGapOptions {
  prose: MeaningGapProse;
  /** The display limit per kind. Defaults to 3 (the same rhythm as the queue card's other sections). */
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
    if (!ownSlug) continue; // no document means no file to fix
    const doc = facts.get(ownSlug);
    if (!doc) continue; // never write to a document absent from the manifest
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

  // By name — if the order changed between two visits to the same screen, the row just seen would have to be found again.
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

/**
 * Parent candidates — only domain documents that actually exist in the vault. A new area is not
 * created from this slot (creating an area means establishing new meaning, which is the workshop's job).
 */
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
