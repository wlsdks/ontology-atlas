#!/usr/bin/env node
/**
 * ontology-atlas-mcp: the local ontology read/write server. This file is wiring:
 * it attaches the two request handlers to the transport and routes each tool
 * name to the `tools/*` workflow that owns it. `TOOLS_FOR_LIST`
 * in `server/registry.mjs` is the authority on the tool surface.
 *
 * Environment: OATLAS_VAULT (vault root, default cwd); OATLAS_REPO_ROOT
 * (repository root, default the vault's git top-level, else cwd).
 * Run: node /absolute/path/to/ontology-atlas/mcp/src/index.js, or register the
 * app's bundled server in `.mcp.json` (see README).
 */

/**
 * MCP TypeScript SDK v2 (`@modelcontextprotocol/server`). Its supported protocol
 * versions equal v1's, so old clients (`2024-11-05`) still negotiate
 * and `integration.test.mjs` keeps that pinned.
 */

import { server } from './server/instance.mjs';
import {
  READ_ONLY_MODE,
  READ_TOOL_NAMES,
  TOOLS_FOR_LIST,
  TOOL_BY_NAME,
  WRITE_CONSENT_MODE,
} from './server/registry.mjs';
import {
  callerChoseSize,
  error,
  formatUnknownToolError,
  ok,
} from './server/rpc.mjs';
import { VAULT_ROOT } from './server/runtime.mjs';
import { normalizeToolArguments } from './server/validate.mjs';
import { logWrite } from './server/write-log.mjs';
import { absorbDocumentTool } from './tools/absorb.mjs';
import {
  gitHistoryTool,
  gitSnapshotTool,
  gitStatusTool,
} from './tools/git.mjs';
import {
  getConstellationTool,
  listConstellationsTool,
} from './tools/constellations.mjs';
import {
  compileOntologyTool,
  queryOntologyTool,
} from './tools/graph.mjs';
import {
  deleteConcept,
  mergeConcepts,
  reclassifyConcept,
  renameConcept,
} from './tools/lifecycle.mjs';
import {
  connectProjectSourceTool,
  disconnectProjectSourceTool,
  finalizeProjectMeaningTool,
} from './tools/project-source.mjs';
import {
  connectionInfoTool,
  findBacklinksTool,
  findEvidence,
  findNeighborsTool,
  findOrphansTool,
  findPathTool,
  getConcept,
  getConceptsBatch,
  listConcepts,
  listKindsTool,
  queryConceptsTool,
  readSourceTool,
} from './tools/read.mjs';
import {
  analyzeRepoStructureTool,
  indexProjectTool,
  inferImportsTool,
  inspectArchitectureTool,
} from './tools/repo-analysis.mjs';
import {
  validateVaultTool,
  validateWikiTool,
} from './tools/validate-vault.mjs';
import {
  addConcept,
  addConceptsBatch,
  patchConcept,
} from './tools/write-concepts.mjs';
import {
  addRelation,
  addRelationsBatch,
  removeRelation,
  replaceRelation,
} from './tools/write-relations.mjs';
import {
  CONSENT_DECLINED,
  requestWriteConsent,
} from './write-consent.mjs';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

// v2 takes a method string, not a schema object (a schema throws at startup).
server.setRequestHandler('tools/list', async () => ({ tools: TOOLS_FOR_LIST }));


server.setRequestHandler('tools/call', async (request) => {
  const { name } = request.params;
  try {
    // Reject a known write tool even when the caller's cached tools/list still shows
    // it; unknown names reach the unknown-tool error below.
    if (READ_ONLY_MODE && TOOL_BY_NAME.has(name) && !READ_TOOL_NAMES.has(name)) {
      throw new Error(
        `Tool "${name}" is unavailable: server is in read-only mode (OATLAS_READ_ONLY). Only read tools are exposed.`,
      );
    }
    const args = normalizeToolArguments(request.params.arguments, name);
    const respond = (result) => ok(result, { tool: name, bounded: !callerChoseSize(args) });

    // The write checkpoint sits before the switch, so a tool added later is covered
    // by not being in the read set, not by someone remembering to guard it.
    if (WRITE_CONSENT_MODE && TOOL_BY_NAME.has(name) && !READ_TOOL_NAMES.has(name)) {
      const consent = await requestWriteConsent({
        server,
        toolName: name,
        args,
        enabled: true,
      });
      if (!consent.allowed) {
        // A refusal is a normal outcome: the agent is told nothing changed and why, so
        // it reports back instead of retrying.
        const error = new Error(consent.message);
        error.code = consent.reason;
        error.declinedByHuman = consent.reason === CONSENT_DECLINED;
        throw error;
      }
    }

    switch (name) {
      case 'connection_info':
        return respond(connectionInfoTool(args));
      case 'git_status':
        return respond(gitStatusTool());
      case 'git_history':
        return respond(gitHistoryTool(args));
      case 'git_snapshot':
        // The commit is the audit record; logging activity after it would dirty the
        // vault again.
        return respond(gitSnapshotTool(args));
      case 'list_concepts':
        return respond(listConcepts(args));
      case 'list_constellations':
        return respond(listConstellationsTool(args));
      case 'get_constellation':
        return respond(getConstellationTool(args));
      case 'get_concept':
        return respond(getConcept(args));
      case 'get_concepts':
        return respond(getConceptsBatch(args));
      case 'find_evidence':
        return respond(findEvidence(args));
      case 'finalize_project_meaning':
        // The receipt is the whole durable write; an activity line after it would be a
        // second, non-atomic mutation.
        return respond(finalizeProjectMeaningTool(args));
      case 'connect_project_source':
        return respond(logWrite(name, args, connectProjectSourceTool(args)));
      case 'disconnect_project_source':
        return respond(logWrite(name, args, disconnectProjectSourceTool(args)));
      case 'add_concept':
        return respond(logWrite(name, args, addConcept(args)));
      case 'add_concepts':
        return respond(logWrite(name, args, addConceptsBatch(args)));
      case 'add_relation':
        return respond(logWrite(name, args, addRelation(args)));
      case 'remove_relation':
        return respond(logWrite(name, args, removeRelation(args)));
      case 'replace_relation':
        return respond(logWrite(name, args, replaceRelation(args)));
      case 'add_relations':
        return respond(logWrite(name, args, addRelationsBatch(args)));
      case 'patch_concept':
        return respond(logWrite(name, args, patchConcept(args)));
      case 'find_backlinks':
        return respond(findBacklinksTool(args));
      case 'find_neighbors':
        return respond(findNeighborsTool(args));
      case 'find_path':
        return respond(findPathTool(args));
      case 'list_kinds':
        return respond(listKindsTool());
      case 'find_orphans':
        return respond(findOrphansTool(args));
      case 'query_concepts':
        return respond(queryConceptsTool(args));
      case 'compile_ontology':
        return respond(compileOntologyTool(args));
      case 'query_ontology':
        return respond(await queryOntologyTool(args));
      case 'validate_vault':
        return respond(validateVaultTool(args));
      case 'read_source':
        return respond(readSourceTool(args));
      case 'validate_wiki':
        return respond(validateWikiTool(args));
      case 'inspect_architecture':
        return respond(inspectArchitectureTool(args));
      case 'analyze_repo_structure':
        return respond(analyzeRepoStructureTool(args));
      case 'infer_imports':
        return respond(inferImportsTool(args));
      case 'index_project':
        return respond(indexProjectTool(args));
      case 'rename_concept':
        return respond(logWrite(name, args, renameConcept(args)));
      case 'reclassify_concept':
        return respond(logWrite(name, args, reclassifyConcept(args)));
      case 'merge_concepts':
        return respond(logWrite(name, args, mergeConcepts(args)));
      case 'delete_concept':
        return respond(logWrite(name, args, deleteConcept(args)));
      case 'absorb_document':
        return respond(logWrite(name, args, absorbDocumentTool(args)));
      default:
        throw new Error(formatUnknownToolError(name));
    }
  } catch (err) {
    return error(err);
  }
});


const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[ontology-atlas-mcp] connected. vault=${VAULT_ROOT}`);
