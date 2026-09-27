/**
 * A project root owns domains through `contains` edges even with empty `project.dependencies`,
 * so `detectOrphanProjects` would flag it; one false positive becomes the chip's only "needs
 * fixing" item.
 */

interface OntologyEdgeEndpoints {
  from: string;
  to: string;
}

/** Both spellings exist on the ontology side, a bare slug and a `project:` prefix. */
export function filterOntologyConnectedOrphans<T extends { slug: string }>(
  orphans: readonly T[],
  ontologyEdges: readonly OntologyEdgeEndpoints[],
): T[] {
  if (orphans.length === 0 || ontologyEdges.length === 0) {
    return [...orphans];
  }
  const connected = new Set<string>();
  for (const edge of ontologyEdges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  return orphans.filter(
    (project) =>
      !connected.has(project.slug) && !connected.has(`project:${project.slug}`),
  );
}
