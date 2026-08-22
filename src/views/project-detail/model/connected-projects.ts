import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";

/**
 * The project slugs the "connected projects" summary rail uses — only those joined to another project
 * node through the ontology graph's `relates:` frontmatter (edge type `related_to`). The
 * `project:<slug>` id convention comes from derive-ontology-from-vault's kind:slug rule (the same basis
 * as `buildOntologyDeeplinkForDoc`).
 *
 * An empty array when this project has no project node in the vault (i.e. it is not in the ontology) —
 * in a vault like dogfood with a single project document, the result is naturally always empty.
 */
export function findRelatesGraphProjectSlugs(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
): string[] {
  const selfId = `project:${projectSlug}`;
  const projectNodeById = new Map(
    nodes.filter((node) => node.kind === "project").map((node) => [node.id, node] as const),
  );
  if (!projectNodeById.has(selfId)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const edge of edges) {
    if (edge.type !== "related_to") continue;
    let otherId: string | null = null;
    if (edge.from === selfId) otherId = edge.to;
    else if (edge.to === selfId) otherId = edge.from;
    if (!otherId || otherId === selfId) continue;
    const other = projectNodeById.get(otherId);
    if (!other || seen.has(other.id)) continue;
    seen.add(other.id);
    out.push(other.id.replace(/^project:/, ""));
  }
  return out;
}

/**
 * The "connected projects" list for the project detail's summary rail — the union of three sources,
 * excluding self and deduplicated by slug:
 *
 *  1. `project.dependencies` — other projects this one depends on.
 *  2. referencedBy — another project's `dependencies` pointing at this one.
 *  3. relates-graph — projects joined through the ontology's `relates:` (a related_to edge).
 *
 * (1) and (2) predate this rail and are kept, so a vault that already linked projects with
 * `dependencies:` keeps showing them without regression. (3) is the `relates` path the newer design added.
 */
export function buildConnectedProjects(
  project: Project,
  related: readonly Project[],
  relatesGraphSlugs: readonly string[],
): Project[] {
  const relatedBySlug = new Map(related.map((p) => [p.slug, p] as const));
  const dependencyProjects = project.dependencies
    .map((dep) => relatedBySlug.get(dep))
    .filter((p): p is Project => Boolean(p));
  const referencedBy = related.filter((p) => p.dependencies.includes(project.slug));
  const relatesGraphProjects = relatesGraphSlugs
    .map((slug) => relatedBySlug.get(slug))
    .filter((p): p is Project => Boolean(p));

  const seen = new Set<string>([project.slug]);
  const out: Project[] = [];
  for (const candidate of [...dependencyProjects, ...referencedBy, ...relatesGraphProjects]) {
    if (seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    out.push(candidate);
  }
  return out;
}
