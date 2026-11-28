/**
 * The answer to a call that still sends an argument or an operation this
 * server stopped accepting: it names what replaced it, so an agent whose notes
 * predate the removal learns the current call from the refusal instead of from
 * a bare "unknown argument". Each refusal is `invalid_arguments`.
 */

const ANALYSIS_ROUTE =
  'view "analysis", proposal and qualification are retired: the structural analysis and the review of a proposal no longer exist. Call analyze_repo_structure for the breadth map, read the code with sourceReads, then write what you found with add_concepts and add_relations.';

const COMPACT_BRIEF =
  'agent_brief detail "compact" and task are retired: the compact task handoff no longer exists. Call query_ontology({operation:"agent_brief", project}) for the brief, then get_concepts({slugs, body:"full"}) for the nodes it names.';

/** Arguments no longer in a tool's input schema, with the sentence an agent that sends one is told. */
const RETIRED_ARGUMENTS = new Map([
  ['analyze_repo_structure', new Map([
    ['view', ANALYSIS_ROUTE],
    ['proposal', ANALYSIS_ROUTE],
    ['qualification', ANALYSIS_ROUTE],
    ['maxDepth', 'maxDepth is retired: the survey never used it. Send rootPath to survey one folder.'],
  ])],
  ['query_ontology', new Map([
    ['detail', COMPACT_BRIEF],
    ['task', COMPACT_BRIEF],
  ])],
]);

/** `query_ontology` operations no longer offered, each with the call that answers the same question. */
const RETIRED_QUERY_OPERATIONS = new Map([
  ['all_paths', 'path returns the shortest connection; reachability lists everything within a depth'],
  ['centrality', 'match_nodes with sort:"degree" ranks nodes by their connections'],
  ['builder_context', 'get_concepts({slugs, body:"full"}) for the node, then neighbors or subgraph for what surrounds it'],
  ['match_edges', 'neighbors lists a node\'s relations with the key each one is written under; relation_check judges one proposed relation'],
  ['domain_profile', 'node_profile with the domain\'s slug'],
  ['domain_matrix', 'overview for the vault, or project_map for one project'],
  ['topological_order', 'cycles reports dependency cycles; impact lists what depends on a node'],
  ['meaning_repair_review', 'validate_vault, then patch_concept on the nodes it names'],
  ['analysis_history', 'the app lists saved analyses; analysis_record reads one by its id'],
]);

/** `connection_info` guide topics no longer served, with where the text went. */
const RETIRED_GUIDES = new Map([
  ['competency', 'The answer layout is in the refusal of finalize_project_meaning: call it without `answers` and read the refusal.'],
]);

function refused(message) {
  return Object.assign(new Error(message), { errorCode: 'invalid_arguments' });
}

/** The refusal for the first retired argument `args` sends with a value, or null. */
export function retiredArgumentError(toolName, args) {
  const retired = RETIRED_ARGUMENTS.get(toolName);
  if (!retired) return null;
  for (const [name, message] of retired) {
    if (args[name] !== undefined && args[name] !== null) return refused(message);
  }
  return null;
}

/** The refusal for a retired `query_ontology` operation, or null. */
export function retiredQueryOperationError(operation) {
  const replacement = RETIRED_QUERY_OPERATIONS.get(operation);
  return replacement ? refused(`query_ontology operation "${operation}" is retired. Use ${replacement}.`) : null;
}

/** The refusal for a retired `connection_info` guide topic, or null. */
export function retiredGuideError(guide) {
  const moved = RETIRED_GUIDES.get(guide);
  return moved ? refused(`connection_info guide "${guide}" is retired. ${moved}`) : null;
}
