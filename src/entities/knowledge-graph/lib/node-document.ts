import type { KnowledgeGraphNode } from "../model/types";

/**
 * `ownSlug` is the node's own `.md` (null: show no document); `mentionedInSlug` is a document
 * that names it, set only without an own one. A missing `hasOwnDocument` reads as own.
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
 * A name known only from another document's relation key, with no `.md` of its own; decision
 * surfaces rank these below written concepts. A missing `hasOwnDocument` reads as a concept.
 */
export function isEvidenceOnlyConcept(
  node: Pick<KnowledgeGraphNode, "hasOwnDocument"> | null | undefined,
): boolean {
  return node?.hasOwnDocument === false;
}
