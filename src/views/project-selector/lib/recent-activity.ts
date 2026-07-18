import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { VaultDoc } from "@/entities/docs-vault";
import { nearestDomainId } from "@/shared/lib/ontology-tree";

export interface RecentActivityRow {
  slug: string;
  kind: string;
  domainTitle: string | null;
  what: string;
  updatedAt: Date;
}

export type RecentActivityAgo =
  | { unit: "today" }
  | { unit: "yesterday" }
  | { unit: "daysAgo"; days: number };

/** Day-bucket for the "ago" label — translated at the UI layer (en/ko). */
export function resolveRecentActivityAgo(updatedAt: Date, now: Date): RecentActivityAgo {
  const ageMs = Math.max(0, now.getTime() - updatedAt.getTime());
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays <= 0) return { unit: "today" };
  if (ageDays === 1) return { unit: "yesterday" };
  return { unit: "daysAgo", days: ageDays };
}

const NOISE_KINDS = new Set(["project", "vault-readme"]);

/**
 * /projects "recent activity" strip — real vault doc mtimes (`VaultDoc.
 * updatedAt`), NOT `KnowledgeGraphNode.lastApprovedAt` (that field is a
 * sentinel epoch-0 for every vault-mode node, see `derivationToInsight`, so
 * it can't rank recency). Each doc's `kind:` frontmatter resolves it back to
 * its canonical node (`id === \`${kind}:${doc.slug}\``) to read a domain
 * ancestor (via `nearestDomainId`) and a one-line summary. `project` and
 * `vault-readme` docs are noise for an activity feed and are skipped.
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

    const node = nodeById.get(`${kind}:${doc.slug}`);
    const domainId = node ? nearestDomainId(node, parentOf, nodeById) : null;
    const domainTitle = domainId ? (nodeById.get(domainId)?.title ?? null) : null;
    const what = doc.description || node?.summary || doc.excerpt || "";

    rows.push({ slug: doc.slug, kind, domainTitle, what, updatedAt });
  }

  return rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit);
}
