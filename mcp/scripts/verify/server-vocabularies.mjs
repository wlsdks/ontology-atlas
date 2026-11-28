/**
 * The words the server is checked against: operation names, kinds, relation types, issue codes and
 * the uid pattern. Recorded from the script server before it was deleted; the checks compare what a
 * running server advertises and answers with these lists, so a server that renames or drops a word
 * fails `npm run verify` instead of being believed. Change a list here only with a decision that
 * changes the public vocabulary.
 */

export const QUERY_ONTOLOGY_OPERATIONS = Object.freeze([
  'neighbors',
  'path',
  'query_plan',
  'communities',
  'similar_nodes',
  'explain_relation',
  'reachability',
  'pattern_walk',
  'impact',
  'blast_radius',
  'subgraph',
  'overview',
  'schema',
  'facets',
  'match_nodes',
  'node_profile',
  'domain_matrix',
  'project_scope',
  'project_map',
  'relation_check',
  'components',
  'lineage',
  'containment_tree',
  'cycles',
  'recommend_relations',
  'growth_plan',
  'maintenance_plan',
  'agent_brief',
  'analysis_record',
  'workspace_brief',
  'health',
]);

export const QUERY_PLAN_TARGET_OPERATIONS = Object.freeze([
  'neighbors',
  'path',
  'communities',
  'similar_nodes',
  'explain_relation',
  'reachability',
  'pattern_walk',
  'impact',
  'blast_radius',
  'subgraph',
  'overview',
  'schema',
  'facets',
  'match_nodes',
  'node_profile',
  'domain_matrix',
  'project_scope',
  'project_map',
  'relation_check',
  'components',
  'lineage',
  'containment_tree',
  'cycles',
  'recommend_relations',
  'growth_plan',
  'maintenance_plan',
  'agent_brief',
  'workspace_brief',
  'health',
]);

export const NODE_KIND_VALUES = Object.freeze([
  'project',
  'domain',
  'capability',
  'element',
  'document',
  'vault-readme',
]);

export const RELATION_TYPE_VALUES = Object.freeze([
  'domains',
  'domain',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
]);

export const WRITE_RELATION_TYPE_VALUES = Object.freeze([
  'depends_on',
  'relates',
  'contains',
  'describes',
  'domains',
  'capabilities',
  'elements',
  'domain',
]);

export const MAINTENANCE_PHASE_VALUES = Object.freeze([
  'validate',
  'repair',
  'link',
  'materialize',
  'review',
]);

export const MAINTENANCE_SEVERITY_VALUES = Object.freeze([
  'fail',
  'warn',
  'info',
]);

export const MAINTENANCE_KIND_VALUES = Object.freeze([
  'inspect_compile_issue',
  'break_dependency_cycle',
  'canonicalize_graph_arrays',
  'resolve_dangling_reference',
  'add_missing_relation',
  'materialize_external_element',
  'unassigned_node',
  'empty_domain',
  'separate_evidence_from_concept',
  'fold_bulk_siblings',
  'retire_unearned_node',
  'capability_without_evidence',
  'rejudge_summary_membership',
  'definition_missing',
  'boundary_missing',
  'epistemic_exclusion',
  'folder_only_evidence',
  'slug_outside_kind_folder',
  'uncertainty_missing',
  'retire_starter_example',
]);

export const GRAPH_ARRAY_KEYS = Object.freeze([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
  'broader',
  'depends_on',
]);

export const IMPORT_EDGE_KIND_VALUES = Object.freeze([
  'static',
  'dynamic',
  'require',
  'reexport',
  'side',
]);

export const IMPORT_SOURCE_ROLE_VALUES = Object.freeze([
  'production',
  'test',
  'unknown',
]);

export const IMPORT_UNRESOLVED_REASON_VALUES = Object.freeze([
  'empty',
  'relative-not-found',
  'alias-not-found',
  'unsupported-static-form',
  'file-too-large',
]);

export const IMPORT_USAGE_VALUES = Object.freeze([
  'value',
  'type_only',
  'unknown',
]);

export const VAULT_ISSUE_CODE_VALUES = Object.freeze([
  'unclosed-frontmatter',
  'parse-zero-keys',
  'malformed-frontmatter-line',
  'malformed-quoted-scalar',
  'missing-kind',
  'empty-kind',
  'unknown-kind',
  'missing-uid',
  'invalid-uid',
  'invalid-merged-uids',
  'non-canonical-merged-uids',
  'missing-expected-field',
  'non-canonical-graph-array',
  'dangling-graph-reference',
  'duplicate-slug',
  'duplicate-uid',
  'definition-missing',
  'boundary-missing',
  'epistemic-exclusion',
  'uncertainty-missing',
  'slug-outside-kind-folder',
  'folder-only-evidence',
  'dependency-unwitnessed',
  'dependency-unjudged',
  'starter-example-node',
  'kind-under-sources',
  'relation-note-on-unread',
  'rule-without-read-lines',
  'dependency-both-ways',
  'path-without-code',
  'path-shared',
  'not-mapped-line-mismatch',
]);

export const NODE_UID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
