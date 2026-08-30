/**
 * Events where the **shape of the vault** changed — a domain appearing or disappearing, a
 * bridge being inserted.
 *
 * **Why the manifest and not the activity log** (measured). The first idea was to read
 * `domains/…` out of the activity log's `target`. Checked against 98 real log lines, it
 * catches **nothing**: domains are almost always born through `add_concepts` (a batch), and
 * a batch's target is `(batch)` (`summarizeWrite` in `mcp/src/index.js`). Across two real
 * logs, the only domain write with an individual target was one
 * `delete_concept domains/example-domain`.
 *
 * So the source of truth for these events is **the manifest on disk**. Batch write, single
 * write, or a person editing by hand — if the vault gained a domain, the manifest gained
 * one. The activity log knows when and who; the manifest knows what.
 *
 * **Bridges are measured exactly as the ledger defines them.** The 2026-08-01 ledger entry
 * (bridge nodes as a first-class concept in the spec) describes the procedure as *"Name the shared behaviour with one `add_concept`, then re-parent the children onto it."* — name the shared behaviour with one
 * `add_concept`, then re-parent the children onto it. So a bridge here is **a newly created
 * node that two or more pre-existing nodes moved their parent onto**. No new `kind` is
 * invented: a bridge-specific kind has no agreed values yet (`docs/DESIGN-SYSTEM.md`
 * "Node spec" §5 reserves the slot and nothing more), and guessing at a kind
 * that does not exist is precisely the failure this file avoids.
 *
 * Why **two or more**: a single move is a changed parent, not a new layer of hierarchy.
 * Notifications belong to events that are rare and hard to reverse.
 */
import { resolveLocaleDisplayName } from "./locale-display-name";

/** Only the part of a manifest row this file reads. A subset of `VaultDoc`. */
export interface VaultShapeDoc {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown> | null;
}

/** One node row a screen can render as-is — slug for the link, name for the reader. */
export interface VaultShapeNode {
  slug: string;
  /** `display_<locale>`, then `title`, then the slug's last segment. Never a folder path. */
  name: string;
  kind?: string;
}

export interface VaultShapeSnapshot {
  nodes: Map<string, VaultShapeNode>;
  /** Slug → the node that contains it, or null. */
  parents: Map<string, string | null>;
}

/**
 * Frontmatter keys that can carry a parent; the earliest one wins.
 *
 * `domain:` is last because a capability or element can hang off a bridge via `belongs_to`
 * while still naming its top-level domain in `domain:`. In that case the parent is the
 * bridge.
 */
const PARENT_KEYS = ["belongs_to", "parent", "broader", "domain"] as const;

function firstStringRef(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return null;
}

/**
 * Expands a reference into a slug. Frontmatter may say `payment` while the document is
 * `capabilities/payment` — the tail is joined only when it is unique. An ambiguous tail is
 * left unresolved: a wrong parent is worse than no parent.
 */
function resolveRef(ref: string, byTail: Map<string, string | null>, slugs: Set<string>): string | null {
  if (slugs.has(ref)) return ref;
  const resolved = byTail.get(ref);
  return resolved ?? null;
}

export function snapshotVaultShape(
  docs: readonly VaultShapeDoc[],
  locale?: string,
): VaultShapeSnapshot {
  const slugs = new Set(docs.map((doc) => doc.slug));
  // A tail seen more than once stores null, which is how ambiguity is remembered.
  const byTail = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split("/").pop();
    if (!tail || tail === doc.slug) continue;
    byTail.set(tail, byTail.has(tail) ? null : doc.slug);
  }

  const nodes = new Map<string, VaultShapeNode>();
  const parents = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split("/").pop() || doc.slug;
    const title = typeof doc.title === "string" ? doc.title.trim() : "";
    const rawKind = doc.frontmatter?.kind;
    nodes.set(doc.slug, {
      slug: doc.slug,
      name: resolveLocaleDisplayName(doc.frontmatter, locale, title || tail).trim() || tail,
      kind: typeof rawKind === "string" && rawKind.trim() ? rawKind.trim() : undefined,
    });

    let parent: string | null = null;
    for (const key of PARENT_KEYS) {
      const ref = firstStringRef(doc.frontmatter?.[key]);
      if (!ref) continue;
      const resolved = resolveRef(ref, byTail, slugs);
      if (resolved && resolved !== doc.slug) {
        parent = resolved;
        break;
      }
    }
    parents.set(doc.slug, parent);
  }
  return { nodes, parents };
}

export interface VaultShapeDiff {
  domainsAdded: VaultShapeNode[];
  domainsRemoved: VaultShapeNode[];
  /** New nodes that took in two or more children. `childCount` is how many moved. */
  bridges: (VaultShapeNode & { childCount: number })[];
}

/** Minimum children for a bridge — one is a changed parent, not a new layer. */
const BRIDGE_MIN_CHILDREN = 2;

export function diffVaultShape(
  prev: VaultShapeSnapshot,
  next: VaultShapeSnapshot,
  { bridgeMinChildren = BRIDGE_MIN_CHILDREN }: { bridgeMinChildren?: number } = {},
): VaultShapeDiff {
  const domainsAdded: VaultShapeNode[] = [];
  const domainsRemoved: VaultShapeNode[] = [];
  const reparentedOnto = new Map<string, number>();

  for (const [slug, node] of next.nodes) {
    if (!prev.nodes.has(slug)) {
      if (node.kind === "domain") domainsAdded.push(node);
      continue;
    }
    // Did a pre-existing node move its parent onto a **newly created** node.
    const before = prev.parents.get(slug) ?? null;
    const after = next.parents.get(slug) ?? null;
    if (after && after !== before && !prev.nodes.has(after)) {
      reparentedOnto.set(after, (reparentedOnto.get(after) ?? 0) + 1);
    }
  }

  for (const [slug, node] of prev.nodes) {
    if (!next.nodes.has(slug) && node.kind === "domain") domainsRemoved.push(node);
  }

  const bridges: (VaultShapeNode & { childCount: number })[] = [];
  for (const [slug, childCount] of reparentedOnto) {
    if (childCount < bridgeMinChildren) continue;
    const node = next.nodes.get(slug);
    if (node) bridges.push({ ...node, childCount });
  }

  const bySlug = (a: VaultShapeNode, b: VaultShapeNode) => a.slug.localeCompare(b.slug);
  domainsAdded.sort(bySlug);
  domainsRemoved.sort(bySlug);
  bridges.sort(bySlug);
  return { domainsAdded, domainsRemoved, bridges };
}
