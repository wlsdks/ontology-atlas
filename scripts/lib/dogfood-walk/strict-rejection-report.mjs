// The dogfood walk's strict-argument probes all print the same rows: whether the
// server rejected the call, optionally its repair hint and write-metadata
// absence, then the server's message. The probes are a table here.
import { strictRepairSummary, writeMetadataAbsenceSummary } from "./summaries.mjs";

const REPAIR = "repair";

/** `key` names the response in the gate input; `id` is its JSON-RPC request id. */
export const STRICT_REJECTION_SECTIONS = [
  {
    header: "strict arguments — unknown tool argument rejection",
    rows: [{ key: "strictArgs", id: 46, label: "rejected", extras: [REPAIR] }],
  },
  {
    header: "strict arguments — multiple unknown tool argument rejection",
    rows: [{ key: "strictMultiArgs", id: 59, label: "rejected", extras: [REPAIR] }],
  },
  {
    header: "strict enums — invalid query operation rejection",
    rows: [{ key: "strictEnum", id: 47, label: "rejected", extras: [REPAIR] }],
  },
  {
    header: "strict tool names — unknown tool rejection",
    rows: [{ key: "strictUnknownTool", id: 84, label: "rejected", extras: [REPAIR] }],
  },
  {
    header: "strict maintenance filters — invalid phase/severity/kind rejection",
    rows: [
      { key: "strictMaintenancePhaseFilter", id: 51, label: "phase rejected" },
      { key: "strictMaintenanceSeverityFilter", id: 52, label: "severity rejected" },
      { key: "strictMaintenanceKindFilter", id: 53, label: "kind rejected" },
    ],
  },
  {
    header: "strict relation filters — invalid dependencyTypes rejection",
    rows: [
      { key: "strictRelationFilter", id: 61, label: "dependencyTypes rejected" },
      { key: "strictOrphanMatchNodesKindFilter", id: 76, label: "match_nodes.kind rejected" },
      { key: "strictListConceptsFilterKind", id: 78, label: "list_concepts.filter kind rejected" },
      { key: "strictListConceptsFilterHasKey", id: 79, label: "list_concepts.filter has-key rejected" },
      { key: "strictListConceptsKindFilter", id: 80, label: "list_concepts.kind rejected" },
    ],
  },
  {
    header: "strict relation_check — invalid type rejection",
    rows: [{ key: "strictRelationCheck", id: 66, label: "relation_check type rejected", extras: [REPAIR] }],
  },
  {
    header:
      "strict graph filters — invalid match_nodes.kind/sort, match_edges.type, and recommend_relations.kind rejection",
    rows: [
      { key: "strictGraphKindFilter", id: 67, label: "match_nodes.kind rejected" },
      { key: "strictRecommendRelationsKindFilter", id: 71, label: "recommend_relations.kind typo rejected" },
      {
        key: "strictRecommendRelationsUnsupportedKindFilter",
        id: 72,
        label: "recommend_relations.kind unsupported rejected",
      },
      { key: "strictMatchNodesSortFilter", id: 73, label: "match_nodes.sort rejected" },
      { key: "strictMatchEdgesTypeFilter", id: 74, label: "match_edges.type rejected" },
      { key: "strictGraphFromKindFilter", id: 68, label: "match_edges.fromKind rejected" },
      { key: "strictGraphToKindFilter", id: 69, label: "match_edges.toKind rejected" },
    ],
  },
];

/** The report lines for one probe: rejected flag, requested extras, then the server message when present. */
export function strictRejectionLines(row, response) {
  const lines = [`  ${row.label}: ${response?.result?.isError === true}`];
  for (const extra of row.extras ?? []) {
    lines.push(
      extra === REPAIR
        ? `  repair: ${strictRepairSummary(response)}`
        : `  write metadata: ${writeMetadataAbsenceSummary(response)}`,
    );
  }
  const text = response?.result?.content?.[0]?.text || "";
  if (text) lines.push(`  ${text}`);
  return lines;
}

/** Prints every strict-argument section and returns each probe's response by its `key`. */
export function printStrictRejectionSections(responses, printHeader) {
  const found = {};
  for (const section of STRICT_REJECTION_SECTIONS) {
    printHeader(section.header);
    for (const row of section.rows) {
      const response = responses.find((candidate) => candidate.id === row.id);
      found[row.key] = response;
      for (const line of strictRejectionLines(row, response)) console.log(line);
    }
  }
  return found;
}
