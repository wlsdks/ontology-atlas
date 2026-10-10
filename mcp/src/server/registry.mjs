/**
 * The public tool surface: the `TOOLS` table that lists every tool in
 * `tool-definitions/`, the annotation sets behind `readOnlyHint` /
 * `destructiveHint` / `idempotentHint`, and the read-only, profile and
 * write-consent modes that decide which tools `tools/list` shows.
 *
 * `pnpm docs:surface:check` measures this file and the decision ledger gate
 * watches it; a change here changes what every connected agent sees.
 */

import { parseConsentEnv } from '../write-consent.mjs';
import { ABSORB_DOCUMENT_TOOL } from './tool-definitions/absorb.mjs';
import { ANALYZE_REPO_STRUCTURE_TOOL } from './tool-definitions/analyze-repo-structure.mjs';
import {
  GET_CONSTELLATION_TOOL,
  LIST_CONSTELLATIONS_TOOL,
} from './tool-definitions/constellations.mjs';
import { FIND_EVIDENCE_TOOL } from './tool-definitions/find-evidence.mjs';
import { GIT_HISTORY_TOOL, GIT_SNAPSHOT_TOOL, GIT_STATUS_TOOL } from './tool-definitions/git.mjs';
import { COMPILE_ONTOLOGY_TOOL, QUERY_ONTOLOGY_TOOL } from './tool-definitions/graph.mjs';
import { INDEX_PROJECT_TOOL } from './tool-definitions/index-project.mjs';
import { INFER_IMPORTS_TOOL } from './tool-definitions/infer-imports.mjs';
import { INSPECT_ARCHITECTURE_TOOL } from './tool-definitions/inspect-architecture.mjs';
import {
  DELETE_CONCEPT_TOOL,
  MERGE_CONCEPTS_TOOL,
  RECLASSIFY_CONCEPT_TOOL,
  RENAME_CONCEPT_TOOL,
} from './tool-definitions/lifecycle.mjs';
import { LIST_CONCEPTS_TOOL } from './tool-definitions/list-concepts.mjs';
import {
  CONNECT_PROJECT_SOURCE_TOOL,
  DISCONNECT_PROJECT_SOURCE_TOOL,
  FINALIZE_PROJECT_MEANING_TOOL,
} from './tool-definitions/project-source.mjs';
import {
  CONNECTION_INFO_TOOL,
  FIND_BACKLINKS_TOOL,
  FIND_NEIGHBORS_TOOL,
  FIND_ORPHANS_TOOL,
  FIND_PATH_TOOL,
  GET_CONCEPTS_TOOL,
  GET_CONCEPT_TOOL,
  LIST_KINDS_TOOL,
  QUERY_CONCEPTS_TOOL,
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
  REPLACE_RELATION_TOOL,
} from './tool-definitions/write-relations.mjs';

const TOOLS = [
  CONNECTION_INFO_TOOL,
  GIT_STATUS_TOOL,
  GIT_HISTORY_TOOL,
  GIT_SNAPSHOT_TOOL,
  LIST_CONCEPTS_TOOL,
  LIST_CONSTELLATIONS_TOOL,
  GET_CONSTELLATION_TOOL,
  GET_CONCEPT_TOOL,
  GET_CONCEPTS_TOOL,
  FIND_EVIDENCE_TOOL,
  FINALIZE_PROJECT_MEANING_TOOL,
  CONNECT_PROJECT_SOURCE_TOOL,
  DISCONNECT_PROJECT_SOURCE_TOOL,
  ADD_CONCEPT_TOOL,
  ADD_CONCEPTS_TOOL,
  ADD_RELATION_TOOL,
  ADD_RELATIONS_TOOL,
  REMOVE_RELATION_TOOL,
  REPLACE_RELATION_TOOL,
  PATCH_CONCEPT_TOOL,
  FIND_BACKLINKS_TOOL,
  FIND_NEIGHBORS_TOOL,
  FIND_PATH_TOOL,
  LIST_KINDS_TOOL,
  FIND_ORPHANS_TOOL,
  QUERY_CONCEPTS_TOOL,
  COMPILE_ONTOLOGY_TOOL,
  QUERY_ONTOLOGY_TOOL,
  VALIDATE_VAULT_TOOL,
  VALIDATE_WIKI_TOOL,
  READ_SOURCE_TOOL,
  INSPECT_ARCHITECTURE_TOOL,
  INFER_IMPORTS_TOOL,
  INDEX_PROJECT_TOOL,
  ANALYZE_REPO_STRUCTURE_TOOL,
  RENAME_CONCEPT_TOOL,
  RECLASSIFY_CONCEPT_TOOL,
  MERGE_CONCEPTS_TOOL,
  DELETE_CONCEPT_TOOL,
  ABSORB_DOCUMENT_TOOL,
];

const READ_TOOL_NAMES = new Set([
  'connection_info',
  'git_status',
  'git_history',
  'list_concepts',
  'list_constellations',
  'get_constellation',
  'get_concept',
  'get_concepts',
  'find_evidence',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'list_kinds',
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
  'index_project',
]);

const DESTRUCTIVE_TOOL_NAMES = new Set([
  'git_snapshot',
  'disconnect_project_source',
  'delete_concept',
  'merge_concepts',
  'rename_concept',
  'remove_relation',
  'replace_relation',
  'reclassify_concept',
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
  'connection_info', 'list_kinds', 'list_concepts', 'get_concept', 'get_concepts',
  'find_evidence', 'find_path', 'find_backlinks', 'query_ontology', 'read_source',
  'analyze_repo_structure', 'index_project', 'infer_imports', 'add_concepts', 'add_relations',
  'patch_concept', 'validate_vault', 'compile_ontology', 'connect_project_source', 'finalize_project_meaning',
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
    ...tool.inputSchema,
    additionalProperties: false,
  },
}));
const TOOLS_FOR_LIST = TOOLS_FOR_LIST_ALL.filter((tool) =>
  (!READ_ONLY_MODE || READ_TOOL_NAMES.has(tool.name)) &&
  (TOOL_PROFILE === 'full' || CONSTRUCTION_TOOL_NAMES.has(tool.name)));
// Stays complete so the unknown-tool hint and the read-only guard see every name.
const TOOL_BY_NAME = new Map(TOOLS_FOR_LIST_ALL.map((tool) => [tool.name, tool]));

export {
  READ_TOOL_NAMES,
  READ_ONLY_MODE,
  WRITE_CONSENT_MODE,
  TOOLS_FOR_LIST,
  TOOL_BY_NAME,
};
