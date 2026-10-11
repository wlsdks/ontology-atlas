/**
 * Formats an MCP `query_ontology(...)` call string: the payload is JSON
 * serialised into a call an agent can copy and run as is.
 *
 * Several screens must expose the identical expression (map path/analysis, the
 * insights query pack, relation handoff), so it is unified in one place — the
 * same one-line function was previously duplicated across 6 files.
 */
export function formatQueryOntologyCall(payload: Record<string, unknown>): string {
  return `query_ontology(${JSON.stringify(payload)})`;
}
