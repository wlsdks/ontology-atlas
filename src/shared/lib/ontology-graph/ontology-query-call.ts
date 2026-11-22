/** One place, so every screen hands an agent the identical copyable call. */
export function formatQueryOntologyCall(payload: Record<string, unknown>): string {
  return `query_ontology(${JSON.stringify(payload)})`;
}
