/**
 * The public tool surface: the `TOOLS` table that lists every tool in
 * `tool-definitions/`, the annotation sets behind `readOnlyHint` /
 * `destructiveHint` / `idempotentHint`, and the read-only, profile and
 * write-consent modes that decide which tools `tools/list` shows.
 *
 * `pnpm docs:surface:check` measures this file and the decision ledger gate
 * watches it; a change here changes what every connected agent sees.
 */

import { advertisedInputSchema } from './advertised-input-schema.mjs';
import { advertisedOutputSchema } from './advertised-output-schema.mjs';
import { parseConsentEnv } from './write-consent.mjs';
import { ABSORB_DOCUMENT_TOOL } from './tool-definitions/absorb-document.mjs';
import { ANALYZE_REPO_STRUCTURE_TOOL } from './tool-definitions/analyze-repo-structure.mjs';
import { GET_CONSTELLATION_TOOL } from './tool-definitions/constellations.mjs';
import { COMPILE_ONTOLOGY_TOOL, QUERY_ONTOLOGY_TOOL } from './tool-definitions/graph.mjs';
import { INFER_IMPORTS_TOOL } from './tool-definitions/infer-imports.mjs';
import { INSPECT_ARCHITECTURE_TOOL } from './tool-definitions/inspect-architecture.mjs';
import {
  DELETE_CONCEPT_TOOL,
  MERGE_CONCEPTS_TOOL,
  RENAME_CONCEPT_TOOL,
} from './tool-definitions/lifecycle.mjs';
import { LIST_CONCEPTS_TOOL } from './tool-definitions/list-concepts.mjs';
import {
  CONNECT_PROJECT_SOURCE_TOOL,
  FINALIZE_PROJECT_MEANING_TOOL,
} from './tool-definitions/project-source.mjs';
import {
  CONNECTION_INFO_TOOL,
  FIND_BACKLINKS_TOOL,
  FIND_NEIGHBORS_TOOL,
  FIND_PATH_TOOL,
  GET_CONCEPTS_TOOL,
  GET_CONCEPT_TOOL,
  LIST_KINDS_TOOL,
  READ_SOURCE_TOOL,
} from './tool-definitions/read.mjs';
import { VALIDATE_VAULT_TOOL, VALIDATE_WIKI_TOOL } from './tool-definitions/validate-vault.mjs';
import {
  ADD_CONCEPTS_TOOL,
  ADD_CONCEPT_TOOL,
  PATCH_CONCEPT_TOOL,
} from './tool-definitions/write-concepts.mjs';
import {
  ADD_RELATIONS_TOOL,
  ADD_RELATION_TOOL,
  REMOVE_RELATION_TOOL,
} from './tool-definitions/write-relations.mjs';

const TOOLS = [
  CONNECTION_INFO_TOOL,
  LIST_CONCEPTS_TOOL,
  GET_CONSTELLATION_TOOL,
  GET_CONCEPT_TOOL,
  GET_CONCEPTS_TOOL,
  FINALIZE_PROJECT_MEANING_TOOL,
  CONNECT_PROJECT_SOURCE_TOOL,
  ADD_CONCEPT_TOOL,
  ADD_CONCEPTS_TOOL,
  ADD_RELATION_TOOL,
  ADD_RELATIONS_TOOL,
  REMOVE_RELATION_TOOL,
  PATCH_CONCEPT_TOOL,
  FIND_BACKLINKS_TOOL,
  FIND_NEIGHBORS_TOOL,
  FIND_PATH_TOOL,
  LIST_KINDS_TOOL,
  COMPILE_ONTOLOGY_TOOL,
  QUERY_ONTOLOGY_TOOL,
  VALIDATE_VAULT_TOOL,
  VALIDATE_WIKI_TOOL,
  READ_SOURCE_TOOL,
  INSPECT_ARCHITECTURE_TOOL,
  INFER_IMPORTS_TOOL,
  ANALYZE_REPO_STRUCTURE_TOOL,
  RENAME_CONCEPT_TOOL,
  MERGE_CONCEPTS_TOOL,
  DELETE_CONCEPT_TOOL,
  ABSORB_DOCUMENT_TOOL,
];

const READ_TOOL_NAMES = new Set([
  'connection_info',
  'list_concepts',
  'get_constellation',
  'get_concept',
  'get_concepts',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'list_kinds',
  'compile_ontology',
  'query_ontology',
  'validate_vault',
  'validate_wiki',
  'read_source',
  'inspect_architecture',
  'analyze_repo_structure',
  'infer_imports',
]);

const DESTRUCTIVE_TOOL_NAMES = new Set([
  // `disconnect: true` removes the binding and its receipt.
  'connect_project_source',
  'delete_concept',
  'merge_concepts',
  'rename_concept',
  'remove_relation',
  // Rewrites a file outside the vault in place; the .pre-absorb.bak backup is not an undo.
  'absorb_document',
]);

const IDEMPOTENT_TOOL_NAMES = new Set([
  'add_relation',
  'add_relations',
  'remove_relation',
]);

function toolTitle(name) {
  return String(name || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Write tools leave tools/list and are also rejected when called from a cached list.
function parseReadOnlyEnv(value) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
const READ_ONLY_MODE = parseReadOnlyEnv(process.env.OATLAS_READ_ONLY);

const TOOL_PROFILE = process.env.OATLAS_TOOL_PROFILE ?? 'full';
if (!['full', 'construction'].includes(TOOL_PROFILE)) {
  throw new Error(`Invalid OATLAS_TOOL_PROFILE ${JSON.stringify(TOOL_PROFILE)}; use full or construction, or unset it, then restart the server.`);
}
const CONSTRUCTION_TOOL_NAMES = new Set([
  'connection_info', 'list_concepts', 'get_concepts',
  'find_backlinks', 'query_ontology', 'read_source',
  'analyze_repo_structure', 'infer_imports', 'add_concepts', 'add_relations',
  'patch_concept', 'validate_vault', 'compile_ontology', 'connect_project_source', 'finalize_project_meaning',
]);

// A retired name stays out of tools/list. The first six below still run and add a note naming
// the tool that replaces them. The rest no longer run: the call is answered with `tool_retired`
// and the replacement, because each one's job is done by the call named here or by the agent's own
// command (see `isRetiredAndGone`).
const RETIRED_TOOL_REPLACEMENTS = new Map([
  ['get_concept', 'get_concepts({ slugs: [slug] })'],
  ['add_concept', 'add_concepts({ concepts: [row] })'],
  ['add_relation', 'add_relations({ relations: [row] })'],
  ['find_path', "query_ontology({ operation: 'path', from, to })"],
  ['find_neighbors', "query_ontology({ operation: 'neighbors', slug, includeUnresolved: true })"],
  ['list_kinds', 'list_concepts({ limit: 1 }) and read its census'],
  ['index_project', 'analyze_repo_structure, then infer_imports and validate_vault'],
  ['git_status', 'your own git: `git -C <repoRoot> status -- <vault>` (`connection_info` names both paths)'],
  ['git_history', 'your own git: `git -C <repoRoot> log -- <vault>`'],
  ['git_snapshot', 'your own git: commit the vault yourself after `git -C <repoRoot> status -- <vault>`'],
  ['list_constellations', 'get_constellation with no `id`'],
  ['find_evidence', 'list_concepts({ mentions: "text" })'],
  ['find_orphans', "query_ontology({ operation: 'match_nodes', hasIncoming: false })"],
  ['query_concepts', 'list_concepts({ filter })'],
  ['disconnect_project_source', 'connect_project_source({ projectSlug, disconnect: true, confirm })'],
  ['replace_relation', 'remove_relation({ from, to, type, replaceWith: { to, type, why }, confirm })'],
  ['reclassify_concept', 'rename_concept({ oldSlug, newKind, domain, body, confirm })'],
]);

// Off unless the launcher asks, so a client that owns the gate is unchanged.
const WRITE_CONSENT_MODE = parseConsentEnv(process.env.OATLAS_WRITE_CONSENT);

const TOOLS_FOR_LIST_ALL = TOOLS.map((tool) => ({
  ...tool,
  annotations: {
    ...(tool.annotations || {}),
    title: toolTitle(tool.name),
    readOnlyHint: READ_TOOL_NAMES.has(tool.name),
    destructiveHint: DESTRUCTIVE_TOOL_NAMES.has(tool.name),
    idempotentHint: IDEMPOTENT_TOOL_NAMES.has(tool.name),
    openWorldHint: false,
  },
  inputSchema: {
    ...advertisedInputSchema(tool.inputSchema),
    additionalProperties: false,
  },
  ...(tool.outputSchema ? { outputSchema: advertisedOutputSchema(tool.outputSchema) } : {}),
}));
const TOOLS_FOR_LIST = TOOLS_FOR_LIST_ALL.filter((tool) =>
  !RETIRED_TOOL_REPLACEMENTS.has(tool.name) &&
  (!READ_ONLY_MODE || READ_TOOL_NAMES.has(tool.name)) &&
  (TOOL_PROFILE === 'full' || CONSTRUCTION_TOOL_NAMES.has(tool.name)));
// Stays complete so the unknown-tool hint and the read-only guard see every name.
const TOOL_BY_NAME = new Map(TOOLS_FOR_LIST_ALL.map((tool) => [tool.name, tool]));
// The full input contracts the server enforces behind the advertised schemas.
const TOOL_INPUT_CONTRACT_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool.inputSchema]));
// The full result contracts behind the advertised output schemas; tests check real results against them.
const TOOL_OUTPUT_CONTRACT_BY_NAME = new Map(TOOLS.filter((tool) => tool.outputSchema).map((tool) => [tool.name, tool.outputSchema]));

/** A retired name with no tool behind it: calling it answers with the replacement and runs nothing. */
function isRetiredAndGone(name) {
  return RETIRED_TOOL_REPLACEMENTS.has(name) && !TOOL_BY_NAME.has(name);
}

export {
  READ_TOOL_NAMES,
  isRetiredAndGone,
  RETIRED_TOOL_REPLACEMENTS,
  READ_ONLY_MODE,
  WRITE_CONSENT_MODE,
  TOOLS_FOR_LIST,
  TOOL_BY_NAME,
  TOOL_INPUT_CONTRACT_BY_NAME,
  TOOL_OUTPUT_CONTRACT_BY_NAME,
};
