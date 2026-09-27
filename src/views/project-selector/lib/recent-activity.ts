import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { VaultDoc } from "@/entities/docs-vault";
import { nearestDomainId } from "@/entities/knowledge-graph";
import { resolveAuthoredDescription } from "./authored-description";

export interface RecentActivityRow {
  slug: string;
  kind: string;
  /** Null for a dangling doc, whose row renders without a link. */
  nodeId: string | null;
  title: string;
  domainTitle: string | null;
  what: string;
  updatedAt: Date;
}

export type RecentActivityAgo =
  | { unit: "today" }
  | { unit: "yesterday" }
  | { unit: "daysAgo"; days: number };

/** Translated at the UI layer. */
export function resolveRecentActivityAgo(updatedAt: Date, now: Date): RecentActivityAgo {
  const ageMs = Math.max(0, now.getTime() - updatedAt.getTime());
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays <= 0) return { unit: "today" };
  if (ageDays === 1) return { unit: "yesterday" };
  return { unit: "daysAgo", days: ageDays };
}

const NOISE_KINDS = new Set(["project", "vault-readme"]);

/**
 * Ranked by doc mtime, since `lastApprovedAt` is epoch 0 for every vault node. Project and
 * vault-readme docs are skipped as noise.
 */
export function buildRecentActivityRows(
  docs: readonly VaultDoc[],
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
  parentOf: ReadonlyMap<string, string>,
  limit = 4,
): RecentActivityRow[] {
  const rows: RecentActivityRow[] = [];

  for (const doc of docs) {
    const kind =
      typeof doc.frontmatter?.kind === "string" ? (doc.frontmatter.kind as string) : undefined;
    if (!kind || NOISE_KINDS.has(kind)) continue;

    const updatedAt = new Date(doc.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) continue;

    // Node ids use the file's tail slug (`deriveDocNode`); `doc.slug` is the full path.
    const tailSlug = doc.slug.split("/").pop() || doc.slug;
    const nodeId = `${kind}:${tailSlug}`;
    const node = nodeById.get(nodeId);
    const domainId = node ? nearestDomainId(node, parentOf, nodeById) : null;
    const domainNode = domainId ? nodeById.get(domainId) : undefined;
    const domainTitle = domainNode ? (domainNode.display ?? domainNode.title) : null;
    // Not `node.summary`, which itself falls back to the excerpt.
    const what = resolveAuthoredDescription(doc) ?? "";
    // The screen-language name the map draws, not the other locale's canonical title.
    const title = node?.display || node?.title || tailSlug;

    rows.push({
      slug: doc.slug,
      kind,
      nodeId: node ? nodeId : null,
      title,
      domainTitle,
      what,
      updatedAt,
    });
  }

  return rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit);
}
