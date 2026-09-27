/** A pasteable first prompt using the real tool names from mcp/README.md; only the slug varies. */
export function buildAgentHandoffSnippet(projectSlug: string): string {
  return [
    `get_concept("${projectSlug}")`,
    `→ query_ontology({operation:"project_map", project:"${projectSlug}"})`,
    `→ containment_tree`,
  ].join("\n");
}
