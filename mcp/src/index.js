#!/usr/bin/env node
import { server } from './server/instance.mjs';
import {
  READ_ONLY_MODE,
  READ_TOOL_NAMES,
  TOOLS_FOR_LIST,
  TOOL_BY_NAME,
  WRITE_CONSENT_MODE,
} from './server/registry.mjs';
import {
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

/**
 * ontology-atlas-mcp — local ontology read/write server.
 *
 * Lets an AI agent (Claude Code, Cursor, Codex, …) read and write the vault's
 * ontology.
 *
 * This file is the wiring, not the work. It attaches the two request handlers to
 * the transport and routes each tool name to the workflow that owns it:
 *
 *   server/registry.mjs      the tool table, descriptions, schemas, annotations
 *   server/instructions.mjs  the `initialize` instructions
 *   server/instance.mjs      the one Server object
 *   server/runtime.mjs       vault and repository roots, the compiled cache
 *   server/rpc.mjs           the result and error envelope
 *   server/validate.mjs      argument validation
 *   server/write-log.mjs     the local write audit line
 *   tools/read.mjs           vault reads
 *   tools/git.mjs            git status, history, snapshot
 *   tools/graph.mjs          compile_ontology and every query_ontology operation
 *   tools/validate-vault.mjs validate_vault and validate_wiki
 *   tools/repo-analysis.mjs  the four folder-scanning tools
 *   tools/project-source.mjs connect / disconnect / finalize a project binding
 *   tools/write-concepts.mjs add_concept, add_concepts, patch_concept
 *   tools/write-relations.mjs the four edge writes
 *   tools/lifecycle.mjs      rename, reclassify, merge, delete
 *   tools/absorb.mjs         absorb_document
 *   tools/vault-nodes.mjs    node identity and the gates every write passes
 *   tools/relation-keys.mjs  which frontmatter key holds which relation
 *   tools/maintenance.mjs    what a result carries rather than being asked for
 *
 * The authority on the current tool surface is `TOOLS_FOR_LIST` in
 * `server/registry.mjs` — the `TOOLS` registry enriched with annotations and
 * filtered by read-only mode. Both the `initialize` instructions and
 * `tools/list` derive from that one array, so no count or name list is copied
 * into this header.
 *
 * Environment:
 *   OATLAS_VAULT=/abs/path/to/vault     — vault root. Defaults to cwd.
 *   OATLAS_REPO_ROOT=/abs/path/to/repo  — repository root. Defaults to the
 *                                         vault's git top-level, else cwd.
 *
 * Run:
 *   $ node /absolute/path/to/ontology-atlas/mcp/src/index.js
 *   or register the server bundled in the app in `.mcp.json` (see README).
 */

/**
 * MCP TypeScript SDK **v2** (`@modelcontextprotocol/server`).
 *
 * v1's single `@modelcontextprotocol/sdk` package was split into `core` /
 * `server` / `node` on 2026-07-27, and v2 is the stable line (v1 dropped to a
 * `v1.x` branch that receives bug and security fixes only, for at least six
 * months).
 *
 * ⚠️ **The wire protocol does not move yet.** Spec `2026-07-28` shipped, but
 * v2's `SUPPORTED_PROTOCOL_VERSIONS` is identical to v1's (measured:
 * `["2025-11-25","2025-06-18","2025-03-26","2024-11-05","2024-10-07"]`,
 * `LATEST = 2025-11-25`). The new spec's `server/discover` and stateless mode
 * exist in the type definitions only, not in the negotiation constants. The
 * value of this migration is not a capability gained now — it is sitting in the
 * vessel that will carry one.
 *
 * **Old-client compatibility was verified by measurement**: sending this v2
 * server an old-style `initialize` (`protocolVersion: "2024-11-05"`) negotiates
 * that version, and `tools/list` / `tools/call` answer normally. Claude Code and
 * Codex do not break.
 */



// v2 takes a **method string**, not a schema object. Passing the old
// `ListToolsRequestSchema` makes v2 throw "not a spec request method" — it fails
// loudly at startup rather than being silently ignored, so this is a safe shape.
server.setRequestHandler('tools/list', async () => ({ tools: TOOLS_FOR_LIST }));

// ── Tool dispatch ──────────────────────────────────────────────────────────

server.setRequestHandler('tools/call', async (request) => {
  const { name } = request.params;
  try {
    // Read-only guard — reject any known write tool even if the caller has a
    // stale tools/list that still shows it. Unknown names fall through to the
    // normal unknown-tool error below.
    if (READ_ONLY_MODE && TOOL_BY_NAME.has(name) && !READ_TOOL_NAMES.has(name)) {
      throw new Error(
        `Tool "${name}" is unavailable: server is in read-only mode (OATLAS_READ_ONLY). Only read tools are exposed.`,
      );
    }
    const args = normalizeToolArguments(request.params.arguments, name);

    // ── The write checkpoint ──
    // Every tool that is not a read tool passes a human decision first when the
    // launcher turned the gate on. It sits **before** the switch so a tool added later
    // is covered by being outside the read set, not by someone remembering to guard it.
    if (WRITE_CONSENT_MODE && TOOL_BY_NAME.has(name) && !READ_TOOL_NAMES.has(name)) {
      const consent = await requestWriteConsent({
        server,
        toolName: name,
        args,
        enabled: true,
      });
      if (!consent.allowed) {
        // A refusal is a normal outcome, not a crash: the agent is told plainly
        // that nothing changed and why, so it can report back instead of retrying.
        const error = new Error(consent.message);
        error.code = consent.reason;
        error.declinedByHuman = consent.reason === CONSENT_DECLINED;
        throw error;
      }
    }

    switch (name) {
      case 'connection_info':
        return ok(connectionInfoTool());
      case 'git_status':
        return ok(gitStatusTool());
      case 'git_history':
        return ok(gitHistoryTool(args));
      case 'git_snapshot':
        // The commit itself is the durable audit record. Writing the activity
        // log after committing would immediately make the vault dirty again.
        return ok(gitSnapshotTool(args));
      case 'list_concepts':
        return ok(listConcepts(args));
      case 'get_concept':
        return ok(getConcept(args));
      case 'get_concepts':
        return ok(getConceptsBatch(args));
      case 'find_evidence':
        return ok(findEvidence(args));
      case 'finalize_project_meaning':
        // The receipt is the complete durable write. Appending activity after
        // it would immediately create a second, non-atomic vault mutation.
        return ok(finalizeProjectMeaningTool(args));
      case 'connect_project_source':
        return ok(logWrite(name, args, connectProjectSourceTool(args)));
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
      case 'replace_relation':
        return ok(logWrite(name, args, replaceRelation(args)));
      case 'add_relations':
        return ok(logWrite(name, args, addRelationsBatch(args)));
      case 'patch_concept':
        return ok(logWrite(name, args, patchConcept(args)));
      case 'find_backlinks':
        return ok(findBacklinksTool(args));
      case 'find_neighbors':
        return ok(findNeighborsTool(args));
      case 'find_path':
        return ok(findPathTool(args));
      case 'list_kinds':
        return ok(listKindsTool());
      case 'find_orphans':
        return ok(findOrphansTool(args));
      case 'query_concepts':
        return ok(queryConceptsTool(args));
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
      case 'index_project':
        return ok(indexProjectTool(args));
      case 'rename_concept':
        return ok(logWrite(name, args, renameConcept(args)));
      case 'reclassify_concept':
        return ok(logWrite(name, args, reclassifyConcept(args)));
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
});

// ── Boot ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[ontology-atlas-mcp] connected. vault=${VAULT_ROOT}`);
