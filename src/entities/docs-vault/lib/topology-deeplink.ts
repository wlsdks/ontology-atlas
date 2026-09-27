import { getTopologyFocusHref, getTopologyProjectHref } from "@/entities/project";
import type { VaultDoc } from "../model/types";
import { computeProjectSlug } from "./project-slug";

/** Non-project kinds with a topology node. */
const FOCUSABLE_ONTOLOGY_KINDS = new Set(["domain", "capability", "element"]);

/**
 * Project → `?p=<projectSlug>`; domain, capability or element → `?mode=focus&p=<slug>`; other kinds →
 * null. URLs come from `getTopology*Href`.
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
