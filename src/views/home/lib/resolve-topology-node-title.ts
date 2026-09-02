import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { resolveTopologySelectedOntologyNode } from "./resolve-topology-selected-node";

/**
 * A slug's human-readable name — only when it actually resolves in this vault.
 *
 * **null is the information (fixed 2026-08-01).** This used to end in `?? slug`,
 * passing the slug off as a title. Nodes absent from the vault then drew with
 * plausible names, and the path chip asserted "no path" over the pair: the truth
 * was "neither is here", the screen said "both are here and unconnected".
 *
 * The fallback looks kind but erases the fact of absence, and once that is gone
 * every claim built on top is quietly false. Returning null lets the caller say
 * so.
 */
export function resolveTopologyNodeTitle({
  slug,
  projectBySlug,
  ontologyNodes,
}: {
  slug: string | null;
  projectBySlug: ReadonlyMap<string, Project>;
  ontologyNodes: readonly KnowledgeGraphNode[] | null | undefined;
}): string | null {
  if (!slug) return null;

  const project = projectBySlug.get(slug);
  if (project) return project.name;

  const node = resolveTopologySelectedOntologyNode(slug, ontologyNodes);
  if (!node) return null;
  // The name a person reads on the map (`display_<locale>`), not the canonical
  // search title: the path chip once said "Fulfillment → Payments" over a map
  // whose labels were Korean (measured 2026-09-03).
  return compactTopologyPanelTitle(node.display ?? node.title);
}

/** Strips the parenthetical aside so chips and panels fit on one line. */
export function compactTopologyPanelTitle(title: string | null): string | null {
  if (!title) return null;
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}
