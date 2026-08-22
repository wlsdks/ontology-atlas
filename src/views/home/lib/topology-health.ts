/**
 * Corrects the health signal for containment the project-deps lens cannot see.
 * `detectOrphanProjects` ignores ontology containment, but a vault's project
 * root owns whole domains and capabilities through `contains` edges even with
 * an empty `project.dependencies`, so it is not unattached. One false positive
 * is enough to destroy trust in the maintenance entry point, because it becomes
 * the chip's only "needs fixing" item on the first click.
 */

interface OntologyEdgeEndpoints {
  from: string;
  to: string;
}

/**
 * Drops projects that take part in an ontology edge in either direction. Both
 * spellings coexist on the ontology side — a bare slug and a `project:` prefix —
 * so both are matched.
 */
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
