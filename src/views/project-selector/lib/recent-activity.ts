import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { VaultDoc } from "@/entities/docs-vault";
import { nearestDomainId } from "@/entities/knowledge-graph/lib/ontology-tree";
import { resolveAuthoredDescription } from "./authored-description";

export interface RecentActivityRow {
  slug: string;
  kind: string;
  /** The graph node id for the map focus deeplink (`${kind}:${tailSlug}`) — null when the lookup fails
   *  (a dangling doc), in which case the UI renders the row without a link. */
  nodeId: string | null;
  /** The human-readable title — the screen-language display name (`node.display`) first, then the
   *  canonical title, then the tail slug. */
  title: string;
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

    // A node id is formed from the file's tail slug (see `deriveDocNode`) — `doc.slug` is the full
    // vault-relative path ("ontology/capabilities/x"), so looking it up without taking the tail always
    // missed and `domainTitle` was permanently at its fallback.
    const tailSlug = doc.slug.split("/").pop() || doc.slug;
    const nodeId = `${kind}:${tailSlug}`;
    const node = nodeById.get(nodeId);
    const domainId = node ? nearestDomainId(node, parentOf, nodeById) : null;
    const domainNode = domainId ? nodeById.get(domainId) : undefined;
    const domainTitle = domainNode ? (domainNode.display ?? domainNode.title) : null;
    // Uses **the same rule** as the card body through the same function — only what a person wrote as
    // `description:`. `node.summary` is excluded from the fallback because that value itself falls back
    // to `doc.excerpt` (`derive-ontology-from-vault.ts`) — keeping summary lets the excerpt back in via
    // one detour. With nothing, the row states only title, kind, domain, and date. An empty slot beats a
    // wrong sentence.
    const what = resolveAuthoredDescription(doc) ?? "";
    // Uses the same name as the map and the popover — `display` is already resolved to the screen
    // language (`derivationToInsight`), so using the canonical title only here leaked long English
    // originals onto Korean screens and Korean originals onto English ones.
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
