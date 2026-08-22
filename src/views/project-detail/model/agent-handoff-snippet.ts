/**
 * The copy payload of the "agent handoff" rail card — a three-step prompt an AI agent seeing this
 * project for the first time can paste directly, using the real tool names from mcp/README.md
 * (`get_concept`, `query_ontology`). It is a template with only the slug swapped in, so it is the actual
 * MCP contract rather than fabrication.
 */
export function buildAgentHandoffSnippet(projectSlug: string): string {
  return [
    `get_concept("${projectSlug}")`,
    `→ query_ontology({operation:"project_map", project:"${projectSlug}"})`,
    `→ containment_tree`,
  ].join("\n");
}
