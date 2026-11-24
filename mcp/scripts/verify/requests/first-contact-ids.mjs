import {
  hasAnyErrorResponse,
  hasAllResultResponses,
  missingResponseLabels,
} from '../../json-rpc-lines.mjs';

export const FIRST_CONTACT_RESPONSE_LABELS = new Map([
  [1, 'initialize'],
  [2, 'tools/list'],
  [3, 'list_concepts'],
  [4, 'list_concepts_census'],
  [5, 'validate_vault'],
  [6, 'workspace_brief'],
  [7, 'health'],
  [8, 'compile_ontology'],
  [9, 'overview'],
  [10, 'overview_query_plan'],
  [11, 'get_concepts'],
  [12, 'project_map_query_plan'],
  [13, 'neighbors'],
  [14, 'path'],
  [15, 'project_scope'],
  [16, 'strict_args'],
  [17, 'strict_enum'],
  [18, 'project_probe'],
  [19, 'find_orphans'],
  [20, 'health_tuned'],
  [21, 'workspace_brief_tuned'],
  [22, 'strict_maintenance_phase_filter'],
  [23, 'strict_maintenance_severity_filter'],
  [24, 'strict_maintenance_kind_filter'],
  [25, 'maintenance_missing_cursor'],
  [26, 'maintenance_ready_cursor'],
  [27, 'strict_multi_args'],
  [28, 'add_concepts_row_isolation'],
  [29, 'add_relations_row_isolation'],
  [30, 'maintenance_resume_cursor'],
  [31, 'get_concepts_single'],
  [32, 'find_evidence'],
  [33, 'find_backlinks'],
  [34, 'query_concepts'],
  [37, 'query_concepts_limited'],
  [38, 'analyze_repo_structure'],
  [39, 'infer_imports'],
  [40, 'strict_relation_filter'],
  [41, 'compile_ontology_page'],
  [42, 'compile_ontology_indexes'],
  [43, 'rename_concept_dry_run'],
  [44, 'merge_concepts_dry_run'],
  [45, 'delete_concept_dry_run'],
  [46, 'strict_relation_check'],
  [47, 'strict_graph_kind_filter'],
  [48, 'strict_graph_from_kind_filter'],
  [49, 'strict_graph_to_kind_filter'],
  [51, 'strict_recommend_relations_kind_filter'],
  [52, 'strict_recommend_relations_unsupported_kind_filter'],
  [53, 'strict_match_nodes_sort_filter'],
  [54, 'strict_match_edges_type_filter'],
  [56, 'strict_find_orphans_kind_filter'],
  [57, 'strict_find_orphans_exclude_kind_filter'],
  [58, 'strict_query_concepts_kind_filter'],
  [59, 'strict_query_concepts_has_key_filter'],
  [60, 'strict_list_concepts_kind_filter'],
  [61, 'patch_concept_conflict_guard'],
  [62, 'add_concepts_batch_cap'],
  [63, 'add_relations_batch_cap'],
  [64, 'get_concepts_batch_cap'],
  [65, 'strict_unknown_tool'],
  [66, 'agent_brief'],
  [67, 'all_paths'],
  [69, 'absorb_document_dry_run'],
  [70, 'infer_imports_focus'],
  [71, 'git_status'],
  [72, 'git_history'],
  [73, 'connection_info'],
]);

export const OPTIONAL_FIRST_CONTACT_RESPONSE_IDS = [
  30, // maintenance_resume_cursor: sent only when maintenance has an action to resume after.
  31, // get_concepts_single: sent only when list_concepts returns a real node.
  33, // find_backlinks: sent only when list_concepts returns a real node.
  37, // query_concepts_limited: sent only when the vault has a non-trivial excluded slug.
  43, // rename_concept_dry_run: sent only when a real writable node exists.
  44, // merge_concepts_dry_run: sent only when two real writable nodes exist.
  45, // delete_concept_dry_run: sent only when a real writable node exists.
  61, // patch_concept_conflict_guard: sent only when a real writable node exists.
];

export const DYNAMIC_FIRST_CONTACT_RESPONSE_IDS = [
  11, // get_concepts: sent after list_concepts returns the current sample slugs.
  13, // neighbors: sent after graph smoke target selection.
  14, // path: sent after graph smoke target selection.
  15, // project_scope: sent after project probe/listing discovers a project node.
  67, // all_paths: sent after graph smoke target selection.
  ...OPTIONAL_FIRST_CONTACT_RESPONSE_IDS,
];

function firstContactLabelsForIds(ids) {
  const expectedIds = ids || FIRST_CONTACT_RESPONSE_LABELS.keys();
  return new Map(
    [...expectedIds].map((id) => [id, FIRST_CONTACT_RESPONSE_LABELS.get(id)]).filter(([, label]) => label),
  );
}

export function hasAllFirstContactResponses(stdout, expectedIds) {
  return hasAllResultResponses(stdout, new Set(firstContactLabelsForIds(expectedIds).keys()));
}

export function hasFirstContactErrorResponse(stdout, expectedIds) {
  return hasAnyErrorResponse(stdout, new Set(firstContactLabelsForIds(expectedIds).keys()));
}

export function firstContactMissingResponseLabels(responses, expectedIds) {
  return missingResponseLabels(
    responses.filter((response) => response?.result),
    firstContactLabelsForIds(expectedIds),
  );
}

export function initialExpectedFirstContactIds() {
  const ids = new Set(FIRST_CONTACT_RESPONSE_LABELS.keys());
  for (const optionalId of OPTIONAL_FIRST_CONTACT_RESPONSE_IDS) {
    ids.delete(optionalId);
  }
  return ids;
}

export function firstContactErrorFailure(response) {
  const label = FIRST_CONTACT_RESPONSE_LABELS.get(response?.id) || `id ${response?.id}`;
  const message = response?.error?.message || JSON.stringify(response?.error || {});
  return `${label} returned JSON-RPC error: ${message}`;
}
