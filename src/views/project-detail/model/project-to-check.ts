import type { ReviewQueueRow } from "@/entities/docs-vault";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/** Rank order: a person's open decision first, then drift a person confirmed, then code drift, then gaps. */
export const TO_CHECK_REASONS = ["raised", "changed-since-review", "stale", "unverifiable", "definition-missing"] as const;
export type ToCheckReason = (typeof TO_CHECK_REASONS)[number];

export const TO_CHECK_SLOTS = 3;
const SLOTS_PER_REASON = 2;
const MISSING_DEFINITION_CODE = "definition-missing";

export interface ToCheckRow {
  reason: ToCheckReason;
  nodeId: string;
  docSlug: string | null;
  name: string;
  kind: string;
  domainName: string | null;
  note?: string;
  reviewedBy?: string;
  path?: string;
  pathGone?: boolean;
  pathChangedAt?: string | null;
}

export interface StaleEvidenceInput {
  path: string;
  gone: boolean;
  changedAt: string | null;
}

export interface ProjectToCheckInput {
  nodes: readonly KnowledgeGraphNode[];
  projectSlug: string;
  reviewRows: readonly ReviewQueueRow[];
  /** Only a measured walk passes stale paths; any other availability passes an empty map. */
  stalePaths: ReadonlyMap<string, StaleEvidenceInput>;
  findingsBySlug: ReadonlyMap<string, { findings: readonly string[] }>;
  domainNameById: ReadonlyMap<string, string>;
}

export interface ProjectToCheck {
  /** Every row, grouped by reason in rank order; a concept appears once per reason it has. */
  rows: ToCheckRow[];
  conceptCount: number;
  /** At most `TO_CHECK_SLOTS`, one per concept under its highest-ranked reason, in `rows` order. */
  visible: ToCheckRow[];
}

export function isProjectConcept(node: Pick<KnowledgeGraphNode, "id" | "projectIds">, projectSlug: string): boolean {
  return node.projectIds.includes(projectSlug) || node.id === `project:${projectSlug}`;
}

const nameOf = (node: KnowledgeGraphNode) => node.display ?? node.title;
const byName = (a: ToCheckRow, b: ToCheckRow) => a.name.localeCompare(b.name);

/** Gone before moved, then the newest code change first, then by name. */
function byStaleUrgency(a: ToCheckRow, b: ToCheckRow): number {
  if (a.pathGone !== b.pathGone) return a.pathGone ? -1 : 1;
  const at = a.pathChangedAt ? Date.parse(a.pathChangedAt) : Number.NEGATIVE_INFINITY;
  const bt = b.pathChangedAt ? Date.parse(b.pathChangedAt) : Number.NEGATIVE_INFINITY;
  if (at !== bt) return bt - at;
  return byName(a, b);
}

/** O(n) over the project's concepts plus a sort per reason. */
export function buildProjectToCheck(input: ProjectToCheckInput): ProjectToCheck {
  const concepts = input.nodes.filter((node) => isProjectConcept(node, input.projectSlug));
  const conceptBySlug = new Map<string, KnowledgeGraphNode>();
  for (const node of concepts) {
    const slug = node.evidenceIds[0];
    if (slug && node.hasOwnDocument !== false && !conceptBySlug.has(slug)) conceptBySlug.set(slug, node);
  }
  const rowFor = (node: KnowledgeGraphNode, reason: ToCheckReason): ToCheckRow => ({
    reason,
    nodeId: node.id,
    docSlug: node.evidenceIds[0] ?? null,
    name: nameOf(node),
    kind: node.kind,
    domainName: input.domainNameById.get(node.id) ?? null,
  });

  const groups = new Map<ToCheckReason, ToCheckRow[]>(TO_CHECK_REASONS.map((reason) => [reason, []]));
  for (const review of input.reviewRows) {
    const node = conceptBySlug.get(review.slug);
    if (!node) continue;
    groups.get(review.reason)!.push({
      ...rowFor(node, review.reason),
      ...(review.note ? { note: review.note } : {}),
      ...(review.reviewedBy ? { reviewedBy: review.reviewedBy } : {}),
    });
  }
  for (const node of concepts) {
    const stale = node.kind === "capability" ? input.stalePaths.get(node.id) : undefined;
    if (stale) {
      groups.get("stale")!.push({ ...rowFor(node, "stale"), path: stale.path, pathGone: stale.gone, pathChangedAt: stale.changedAt });
    }
    // A concept without its own document borrows the slug of the document that named it.
    const slug = node.hasOwnDocument === false ? undefined : node.evidenceIds[0];
    if (slug && input.findingsBySlug.get(slug)?.findings.includes(MISSING_DEFINITION_CODE)) {
      groups.get("definition-missing")!.push(rowFor(node, "definition-missing"));
    }
  }

  const rows = TO_CHECK_REASONS.flatMap((reason) => groups.get(reason)!.sort(reason === "stale" ? byStaleUrgency : byName));
  const firstRowPerConcept = new Map<string, ToCheckRow>();
  for (const row of rows) if (!firstRowPerConcept.has(row.nodeId)) firstRowPerConcept.set(row.nodeId, row);
  const highestReasonRows = [...firstRowPerConcept.values()];
  return { rows, conceptCount: highestReasonRows.length, visible: selectVisibleRows(highestReasonRows) };
}

export function groupRowsByReason(rows: readonly ToCheckRow[]): { reason: ToCheckReason; rows: ToCheckRow[] }[] {
  return TO_CHECK_REASONS.map((reason) => ({ reason, rows: rows.filter((row) => row.reason === reason) })).filter(
    (group) => group.rows.length > 0,
  );
}

/**
 * Fills the slots in rank order, holding each reason to `SLOTS_PER_REASON` while another reason
 * waits; a slot nobody else can use goes back to the held rows.
 */
export function selectVisibleRows(rows: readonly ToCheckRow[], slots = TO_CHECK_SLOTS): ToCheckRow[] {
  const taken = new Set<ToCheckRow>();
  const perReason = new Map<ToCheckReason, number>();
  for (const row of rows) {
    if (taken.size === slots) break;
    const used = perReason.get(row.reason) ?? 0;
    if (used >= SLOTS_PER_REASON) continue;
    taken.add(row);
    perReason.set(row.reason, used + 1);
  }
  for (const row of rows) {
    if (taken.size === slots) break;
    taken.add(row);
  }
  return rows.filter((row) => taken.has(row));
}
