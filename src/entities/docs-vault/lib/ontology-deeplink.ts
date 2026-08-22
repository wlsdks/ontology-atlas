import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import type { VaultDoc } from "../model/types";

/**
 * A document with `frontmatter.kind` is registered by `deriveOntologyFromVault` as a
 * node in the same vault's ontology graph, with the node id rule
 * `` `${kind}:${doc.slug.split('/').pop()}` ``. This helper owns that rule in one
 * place so other surfaces (the docs viewer, for one) can deeplink into the ontology
 * view without restating it. URL construction is delegated to `buildOntologyNodeHref`
 * so encoding and query keys stay single-sourced.
 *
 * Returns null when kind or slug is empty. In the corner case where `fm.slug` differs
 * from the filename the ontology side may fail to match the node, but the page still
 * loads gracefully, so callers need no extra guard.
 */
export function buildOntologyDeeplinkForDoc(doc: VaultDoc): string | null {
  const rawKind = doc.frontmatter?.kind;
  const kind = typeof rawKind === "string" ? rawKind.trim() : "";
  if (!kind) return null;
  const tail = doc.slug.split("/").pop() ?? doc.slug;
  if (!tail) return null;
  return buildOntologyNodeHref(`${kind}:${tail}`);
}
