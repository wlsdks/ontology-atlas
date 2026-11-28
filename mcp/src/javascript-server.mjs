/**
 * The JavaScript server, kept only as the reference the differential harness and the baseline
 * measurement compare the Rust program against until the JavaScript is deleted. Nothing ships it:
 * `index.js` starts the Rust program. This file is wiring: it attaches the two request handlers
 * to the transport and routes each tool name to the `tools/*` workflow that owns it.
 * `TOOLS_FOR_LIST` in `server/registry.mjs` is the authority on the tool surface.
 *
 * Environment: OATLAS_VAULT (vault root, default cwd); OATLAS_REPO_ROOT
 * (repository root, default the vault's git top-level, else cwd).
 */

/**
 * MCP TypeScript SDK v2 (`@modelcontextprotocol/server`) supports the same protocol versions as
 * its predecessor, so older clients still negotiate; pinned in `integration.test.mjs`.
 */

import { server } from './server/instance.mjs';
import {
  READ_ONLY_MODE,
  READ_TOOL_NAMES,
  isRetiredAndGone,
  RETIRED_TOOL_REPLACEMENTS,
  TOOLS_FOR_LIST,
  TOOL_BY_NAME,
  WRITE_CONSENT_MODE,
} from './server/registry.mjs';
import {
  error,
  formatUnknownToolError,
  ok,
  retiredToolError,
} from './server/rpc.mjs';
import { VAULT_ROOT } from './server/runtime.mjs';
import { normalizeToolArguments } from './server/validate.mjs';
import { withVaultReadSnapshot, withVaultWriteSnapshot } from './vault/documents/document-cache.mjs';
import { logWrite } from './server/write-log.mjs';
import { absorbDocumentTool } from './tools/absorb.mjs';
import { getConstellationTool } from './tools/constellations.mjs';
import {
  compileOntologyTool,
  queryOntologyTool,
} from './tools/graph.mjs';
import {
  deleteConcept,
  mergeConcepts,
  renameConcept,
} from './tools/lifecycle.mjs';
import {
  connectConsentArguments,
  connectProjectSourceTool,
  disconnectProjectSourceTool,
  finalizeProjectMeaningTool,
} from './tools/project-source.mjs';
import {
  connectionInfoTool,
  findBacklinksTool,
  findNeighborsTool,
  findPathTool,
  getConcept,
  getConceptsBatch,
  listConcepts,
  listKindsTool,
  readSourceTool,
} from './tools/read.mjs';
import { analyzeRepoStructureTool } from './tools/repo-analysis/analyze-structure.mjs';
import { inferImportsTool } from './tools/repo-analysis/infer-imports.mjs';
import { inspectArchitectureTool } from './tools/repo-analysis/inspect-architecture.mjs';
import {
  validateVaultTool,
  validateWikiTool,
} from './tools/validate-vault.mjs';
import {
  addConcept,
  addConceptsBatch,
  patchConcept,
} from './tools/writes/write-concepts.mjs';
import {
  addRelation,
  addRelationsBatch,
  removeRelation,
} from './tools/writes/write-relations.mjs';
import {
  CONSENT_DECLINED,
  requestWriteConsent,
} from './server/write-consent.mjs';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

// v2 takes a method string, not a schema object (a schema throws at startup).
server.setRequestHandler('tools/list', async () => ({ tools: TOOLS_FOR_LIST }));


// A read tool sees one snapshot of the vault: its helpers share one stamp pass. Any
// other call reads every file fresh once, on its first load, and stamp-checks after.
server.setRequestHandler('tools/call', async (request) => {
  const { name } = request.params;
  // Nothing runs, so nothing is read, snapshotted or asked of a person first.
  if (isRetiredAndGone(name)) return error(retiredToolError(name));
  return withRetiredToolNote(
    name,
    await (READ_TOOL_NAMES.has(name)
      ? withVaultReadSnapshot(() => callTool(request))
      : withVaultWriteSnapshot(() => callTool(request))),
  );
});

function withRetiredToolNote(name, response) {
  const replacement = RETIRED_TOOL_REPLACEMENTS.get(name);
  if (!replacement || response.isError) return response;
  const note = { type: 'text', text: `${name} is retired from tools/list and will be removed; its replacement is ${replacement}.` };
  return { ...response, content: [...(response.content ?? []), note] };
}

async function callTool(request) {
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

    // The write checkpoint sits before the switch, so a tool added later is covered
    // by not being in the read set, not by someone remembering to guard it.
    let consented = false;
    if (WRITE_CONSENT_MODE && TOOL_BY_NAME.has(name) && !READ_TOOL_NAMES.has(name)) {
      const consent = await requestWriteConsent({
        server,
        toolName: name,
        // The card names the folder a connect would bind, not "inferred from this vault".
        args: name === 'connect_project_source' ? connectConsentArguments(args) : args,
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
      consented = consent.asked;
    }

    switch (name) {
      case 'connection_info':
        return ok(connectionInfoTool(args));
      case 'list_concepts':
        return ok(listConcepts(args));
      case 'get_constellation':
        return ok(getConstellationTool(args));
      case 'get_concept':
        return ok(getConcept(args));
      case 'get_concepts':
        return ok(getConceptsBatch(args));
      case 'finalize_project_meaning':
        // The handler logs the body it writes; the receipt itself gets no activity line.
        return ok(finalizeProjectMeaningTool(args));
      case 'connect_project_source':
        return ok(logWrite(name, args, connectProjectSourceTool(args, { consented })));
      case 'disconnect_project_source':
        return ok(logWrite(name, args, disconnectProjectSourceTool(args)));
      case 'add_concept':
        return ok(logWrite(name, args, addConcept(args)));
      case 'add_concepts':
        return ok(logWrite(name, args, addConceptsBatch(args)));
      case 'add_relation':
        return ok(logWrite(name, args, addRelation(args)));
      case 'remove_relation':
        return ok(logWrite(name, args, removeRelation(args)));
      case 'add_relations':
        return ok(logWrite(name, args, addRelationsBatch(args)));
      case 'patch_concept': {
        const result = patchConcept(args);
        if (!Array.isArray(result.patches)) return ok(logWrite(name, args, result));
        // One audit line per patched node, in the single-patch format.
        for (const row of result.patches) logWrite(name, { slug: row.slug }, row);
        return ok(result);
      }
      case 'find_backlinks':
        return ok(findBacklinksTool(args));
      case 'find_neighbors':
        return ok(findNeighborsTool(args));
      case 'find_path':
        return ok(findPathTool(args));
      case 'list_kinds':
        return ok(listKindsTool());
      case 'compile_ontology':
        return ok(compileOntologyTool(args));
      case 'query_ontology':
        return ok(await queryOntologyTool(args));
      case 'validate_vault':
        return ok(validateVaultTool(args));
      case 'read_source':
        return ok(readSourceTool(args));
      case 'validate_wiki':
        return ok(validateWikiTool(args));
      case 'inspect_architecture':
        return ok(inspectArchitectureTool(args));
      case 'analyze_repo_structure':
        return ok(analyzeRepoStructureTool(args));
      case 'infer_imports':
        return ok(inferImportsTool(args));
      case 'rename_concept':
        return ok(logWrite(name, args, renameConcept(args)));
      case 'merge_concepts':
        return ok(logWrite(name, args, mergeConcepts(args)));
      case 'delete_concept':
        return ok(logWrite(name, args, deleteConcept(args)));
      case 'absorb_document':
        return ok(logWrite(name, args, absorbDocumentTool(args)));
      default:
        throw new Error(formatUnknownToolError(name));
    }
  } catch (err) {
    return error(err);
  }
}


const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[ontology-atlas-mcp] connected. vault=${VAULT_ROOT}`);
