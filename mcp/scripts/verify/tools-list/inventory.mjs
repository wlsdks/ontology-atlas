export const EXPECTED_READ_TOOLS = [
  'connection_info',
  'git_status',
  'git_history',
  'list_concepts',
  'list_constellations',
  'get_constellation',
  'get_concepts',
  'find_evidence',
  'find_backlinks',
  'find_orphans',
  'query_concepts',
  'compile_ontology',
  'query_ontology',
  'validate_vault',
  'validate_wiki',
  'read_source',
  'inspect_architecture',
  'analyze_repo_structure',
  'infer_imports',
];

export const EXPECTED_WRITE_TOOLS = [
  'add_concepts',
  'add_relations',
  'remove_relation',
  'replace_relation',
  'patch_concept',
  'delete_concept',
  'rename_concept',
  'reclassify_concept',
  'merge_concepts',
  'absorb_document',
  'git_snapshot',
  'finalize_project_meaning',
  'connect_project_source',
  'disconnect_project_source',
];

export const EXPECTED_TOOLS = [...EXPECTED_READ_TOOLS, ...EXPECTED_WRITE_TOOLS];
export const EXPECTED_DESTRUCTIVE_TOOLS = [
  'git_snapshot',
  'disconnect_project_source',
  'delete_concept',
  'merge_concepts',
  'rename_concept',
  'remove_relation',
  'replace_relation',
  'reclassify_concept',
  'absorb_document',
];
export const EXPECTED_IDEMPOTENT_TOOLS = [
  'add_relations',
  'remove_relation',
];

export function toolsListAnnotationSummary(tools) {
  if (!Array.isArray(tools)) return 'missing tools/list';
  const titleCount = tools.filter((tool) => tool?.annotations?.title === expectedToolTitle(tool?.name)).length;
  const readCount = tools.filter((tool) => tool?.annotations?.readOnlyHint === true).length;
  const writeCount = tools.filter((tool) => tool?.annotations?.readOnlyHint === false).length;
  const destructiveCount = tools.filter((tool) => tool?.annotations?.destructiveHint === true).length;
  const idempotentCount = tools.filter((tool) => tool?.annotations?.idempotentHint === true).length;
  const localOnlyCount = tools.filter((tool) => tool?.annotations?.openWorldHint === false).length;
  return [
    `${titleCount}/${EXPECTED_TOOLS.length} titled`,
    `${readCount}/${EXPECTED_READ_TOOLS.length} read`,
    `${writeCount}/${EXPECTED_WRITE_TOOLS.length} write`,
    `${destructiveCount}/${EXPECTED_DESTRUCTIVE_TOOLS.length} destructive`,
    `${idempotentCount}/${EXPECTED_IDEMPOTENT_TOOLS.length} idempotent`,
    `${localOnlyCount}/${EXPECTED_TOOLS.length} local-only`,
  ].join('; ');
}

export function expectedToolsListAnnotationSummary() {
  const readTools = new Set(EXPECTED_READ_TOOLS);
  const destructiveTools = new Set(EXPECTED_DESTRUCTIVE_TOOLS);
  const idempotentTools = new Set(EXPECTED_IDEMPOTENT_TOOLS);
  return toolsListAnnotationSummary(EXPECTED_TOOLS.map((name) => ({
    name,
    annotations: {
      title: expectedToolTitle(name),
      readOnlyHint: readTools.has(name),
      destructiveHint: destructiveTools.has(name),
      idempotentHint: idempotentTools.has(name),
      openWorldHint: false,
    },
  })));
}

export function toolsListInventoryFailure(tools) {
  if (!Array.isArray(tools)) return 'no tools/list response';
  const invalidNameCount = tools.filter((tool) => typeof tool?.name !== 'string' || tool.name.length === 0).length;
  const toolNames = tools
    .map((tool) => tool?.name)
    .filter((name) => typeof name === 'string' && name.length > 0)
    .sort();
  const expectedSorted = [...EXPECTED_TOOLS].sort();
  const missing = expectedSorted.filter((name) => !toolNames.includes(name));
  const extra = toolNames.filter((name) => !expectedSorted.includes(name));
  const duplicates = [...new Set(toolNames.filter((name, index, names) => (
    typeof name === 'string' && names.indexOf(name) !== index
  )))];
  if (missing.length === 0 && extra.length === 0 && duplicates.length === 0 && invalidNameCount === 0) return null;
  return `tools mismatch: missing: ${missing.join(',') || '(none)'}, extra: ${extra.join(',') || '(none)'}, duplicates: ${duplicates.join(',') || '(none)'}, invalidNames: ${invalidNameCount}`;
}

export function expectedToolTitle(name) {
  return String(name || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
