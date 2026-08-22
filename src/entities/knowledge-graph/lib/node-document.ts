import type { KnowledgeGraphNode } from "../model/types";

/**
 * The single source deciding whether a node's first evidence slug is **its own
 * document or someone else's**.
 *
 * Vault derivation creates nodes by two paths: a document with `kind:` in its
 * frontmatter (whose evidence is its own slug), and a node named only by another
 * document's relation key (`contains` / `relates` / `elements` …), whose evidence is
 * *that other document's* slug. Both land in the single `evidenceIds[0]` slot, so a
 * surface rendering "open this node's document" from that value shows the user
 * someone else's document while they believe they are reading the concept they
 * just opened.
 *
 * Returning the two values separately lets each surface be honest:
 * - `ownSlug` — this node's own `.md`; null means show no document affordance
 * - `mentionedInSlug` — another document that names this node; filled only when
 *   there is no own document
 *
 * Backwards compatibility: a node without `hasOwnDocument` (hand assembly, test
 * fixtures) still reads as having its own document.
 */
export function resolveNodeDocument(
  node: Pick<KnowledgeGraphNode, "evidenceIds" | "hasOwnDocument"> | null | undefined,
): { ownSlug: string | null; mentionedInSlug: string | null } {
  const slug = node?.evidenceIds?.[0] ?? null;
  if (!slug) return { ownSlug: null, mentionedInSlug: null };
  return node?.hasOwnDocument === false
    ? { ownSlug: null, mentionedInSlug: slug }
    : { ownSlug: slug, mentionedInSlug: null };
}

/**
 * Is this concept **a name that appears only as evidence** — derived from another
 * document's relation key (`elements:` / `contains:` / `relates:` …) with no `.md`
 * of its own?
 *
 * Why it needs its own name: decision surfaces (impact ranking, hubs, the to-do
 * queue) that draw both kinds at the same weight make a carefully written concept
 * read the same as a code path some document mentioned in passing. Measured
 * 2026-07-26 against the 289-concept dogfood vault: 11 of the top 12 rows under
 * "concepts whose change spreads furthest" were test files and internal function
 * paths, and not one of them had a document. The better the vault, the more
 * implementation evidence its capabilities cite, so the same happens in a user's vault.
 *
 * Several surfaces deciding this independently will diverge, so **only this function**
 * does. It is grounds for layering, not for hiding — the evidence layer is pushed
 * down, never deleted.
 *
 * Backwards compatibility: a node without `hasOwnDocument` reads as a concept.
 */
export function isEvidenceOnlyConcept(
  node: Pick<KnowledgeGraphNode, "hasOwnDocument"> | null | undefined,
): boolean {
  return node?.hasOwnDocument === false;
}
