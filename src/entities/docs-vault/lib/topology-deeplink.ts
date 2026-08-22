import { getTopologyFocusHref, getTopologyProjectHref } from "@/entities/project";
import type { VaultDoc } from "../model/types";
import { computeProjectSlug } from "./project-slug";

/** Ontology kinds besides project that have a 1:1 topology node — eligible for a focus deeplink. */
const FOCUSABLE_ONTOLOGY_KINDS = new Set(["domain", "capability", "element"]);

/**
 * Topology deeplink builder. The topology renders the *whole* ontology graph, so
 * domain, capability, and element documents have 1:1 graph nodes too and can be
 * jumped to:
 *  - project → `?p=<projectSlug>` for the node `deriveProjectsFromVault` registered
 *    (sharing `computeProjectSlug` so the drawer opens on the right one)
 *  - domain / capability / element → the vault slug *is* the graph nodeId, so
 *    `?mode=focus&p=<slug>` opens it focused in the drawer
 *  - kinds with no graph node (document, vault-readme) → null
 * URL construction is delegated to `getTopology*Href` in entities/project so
 * encoding and query keys stay single-sourced.
 */
export function buildTopologyDeeplinkForDoc(doc: VaultDoc): string | null {
  const rawKind = doc.frontmatter?.kind;
  const kind = typeof rawKind === "string" ? rawKind.trim() : "";
  if (kind === "project") {
    const slug = computeProjectSlug(doc);
    return slug ? getTopologyProjectHref(slug) : null;
  }
  if (FOCUSABLE_ONTOLOGY_KINDS.has(kind) && doc.slug) {
    return getTopologyFocusHref(doc.slug);
  }
  return null;
}
