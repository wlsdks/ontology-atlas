import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import type { VaultDoc } from "../model/types";

/**
 * Owns the node id rule `${kind}:${last slug segment}` so other surfaces can link into the ontology
 * view. Null without kind or slug; a differing `fm.slug` may miss the node but the page still loads.
 */
export function buildOntologyDeeplinkForDoc(doc: VaultDoc): string | null {
  const rawKind = doc.frontmatter?.kind;
  const kind = typeof rawKind === "string" ? rawKind.trim() : "";
  if (!kind) return null;
  const tail = doc.slug.split("/").pop() ?? doc.slug;
  if (!tail) return null;
  return buildOntologyNodeHref(`${kind}:${tail}`);
}
