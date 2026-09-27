import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { projectDisplayName, type Project } from "@/entities/project";
import { resolveTopologySelectedOntologyNode } from "./resolve-topology-selected-node";

/**
 * A slug's readable name, only when it resolves in this vault.
 * null is the information: falling back to the slug makes absent nodes look present,
 * and the path chip then claims "no path" over a pair that is not here.
 */
export function resolveTopologyNodeTitle({
  slug,
  projectBySlug,
  ontologyNodes,
  locale,
}: {
  slug: string | null;
  projectBySlug: ReadonlyMap<string, Project>;
  ontologyNodes: readonly KnowledgeGraphNode[] | null | undefined;
  /** With it a project reads by its `display_<locale>`, like every node. */
  locale?: string;
}): string | null {
  if (!slug) return null;

  const project = projectBySlug.get(slug);
  if (project) return locale ? projectDisplayName(project, locale) : project.name;

  const node = resolveTopologySelectedOntologyNode(slug, ontologyNodes);
  if (!node) return null;
  // The map label (`display_<locale>`), not the canonical search title, so chips match the map's
  // language.
  return compactTopologyPanelTitle(node.display ?? node.title);
}

/** Strips the parenthetical aside so chips and panels fit on one line. */
export function compactTopologyPanelTitle(title: string | null): string | null {
  if (!title) return null;
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}
