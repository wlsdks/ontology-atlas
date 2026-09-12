#!/usr/bin/env node
/**
 * ontology-atlas-mcp — local ontology read/write server.
 *
 * Lets an AI agent (Claude Code, Cursor, Codex, …) read and write the vault's
 * ontology.
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
import { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { listAnalysisRecords, readAnalysisRecord } from './analysis-records.mjs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

import { SERVER_VERSION } from './server-version.mjs';
import {
  requestWriteConsent,
  CONSENT_DECLINED,
} from './write-consent.mjs';
import { buildToolInventorySection } from './tool-inventory.mjs';
import {
  PROJECT_SOURCE_STATE_RELATIVE_PATH,
  buildProjectSourceReceipt,
  readProjectSourceBindings,
  readProjectSourceView,
  removeProjectSourceBindings,
  writeProjectSourceBinding,
} from './project-source-receipt.mjs';
import { inspectProjectSource } from './project-source-inspection.mjs';
import { collectProjectSourceCandidates } from './project-source-discovery.mjs';
import { inferProjectSourceProposal } from './project-source-inference.mjs';
import { deriveProjectSourceWitnessesFromDocs } from './project-source-witnesses.mjs';
import { projectSourceRemedy, undoPlan } from './project-source-remedy.mjs';
import { buildProjectSourceGraphHash } from './project-source-graph-hash.mjs';
import { buildProjectMeaningInventory } from './project-meaning-inventory.mjs';
import {
  attachMeaningRepair,
  buildMeaningRepair,
  buildMeaningRepairReviewPage,
} from './meaning-repair.mjs';
import {
  finalizeProjectMeaningReceipt,
  parseProjectCompetencyMarkdown,
  readProjectMeaningAssessment,
} from './project-meaning-receipt.mjs';
import {
  MEANING_COMPETENCY_CONTRACT,
  MEANING_COMPETENCY_EVALUATOR,
  deriveMeaningAssessment,
} from './meaning-assessment.mjs';

import { existsSync, readFileSync, readdirSync, copyFileSync, realpathSync, statSync } from 'node:fs';
import {
  GRAPH_ARRAY_KEYS,
  NEIGHBOR_KEY_ALIASES,
  VaultConflictError,
  collectNeighborRefs,
  relationNoteFor,
  FULL_BODY_MAX_CHARS,
  GET_CONCEPTS_FULL_BODY_MAX,
  deleteDoc,
  describeBodyDelivery,
  drainNodeEligibilityFindings,
  extractSummaryExcerpt,
  findBacklinks,
  findGraphReferences,
  findOrphans,
  detectDuplicateTitle,
  findPath,
  listKinds,
  loadVaultDocs,
  normalizeRelationRefs,
  readDoc,
  applyAllOrNothing,
  canonicalDiskSlug,
  redirectBacklinks,
  slugToPath,
  patchFrontmatter,
  suggestSimilarSlugs,
  updateDoc,
  vaultSlugExists,
  writeDoc,
  writeFileAtomically,
} from './vault.mjs';
import { appendActivityEntry, buildActivityEntry, resolveAgentName } from './activity-log.mjs';
import { unlinkSync } from 'node:fs';
import { buildMarkdown, parseFrontmatter } from './parser.mjs';
import { analyzeRepoStructure } from './analyze.mjs';
import {
  buildArchitectureBrief,
  buildArchitectureMeasuredStamp,
  findArchitectureProfiles,
} from './architecture-profile.mjs';
import { buildAbsorptionPlan, buildSlimPointer } from './absorb.mjs';
import {
  buildImportImpactFocus,
  inferImports,
  listSourceFiles,
} from './infer-imports.mjs';
import { compileOntology } from './ontology-compiler.mjs';
import {
  AGENT_BRIEF_TASK_MAX_CHARS,
  buildCompactAgentBrief,
  projectSourceSnapshotUnchanged,
} from './agent-brief-compact.mjs';
import {
  buildNextImportRelationReview,
  reconcileImportEdges,
} from './reconcile-imports.mjs';
import { detectVaultPathDrift, suggestPathReconciliations } from './detect-drift.mjs';
import {
  SUMMARY_KINDS,
  describeStaleParent,
  findStaleParentSummaries,
  staleParentScore,
} from './stale-parent.mjs';
import { scoreEvidence } from './evidence-rank.mjs';
import {
  inspectVaultGit,
  inspectVaultGitHistory,
  snapshotVaultGit,
  collectNodeRevisions,
} from './git-tools.mjs';
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
  queryCompiledOntology,
  refreshAgentBriefHandoffPrompt,
} from './ontology-engine.mjs';
import { loadOntologyAtlasIgnore } from './ontology-atlas-ignore.mjs';
import { parseFilter } from './query.mjs';
import {
  isValidVaultTitle,
  validateVaultDocument,
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
} from './validate.mjs';
import { WIKI_DIR, isWikiFurnitureSlug, validateWikiPage, validateWikiFolder } from './wiki-schema.mjs';
import { readSourceText } from './source-text.mjs';
import {
  buildFrontmatter,
  defaultBody,
  missingExpectedFields,
  normalizeLocaleLabels,
  localeLabelCodes,
  agentCreatedBy,
  CREATED_BY_KEY,
  HUMAN_ONLY_REVIEW_KEYS,
  REVIEW_NOTE_KEY,
  REVIEW_STATE_CONFIRMED,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
  REVIEW_STATES,
  REVIEWED_AT_KEY,
  REVIEWED_BY_KEY,
  reviewCurrentness,
  flatSlugIssue,
  mergeNodeIdentityHistory,
  nodeUidIssue,
} from './schema.mjs';
import {
  closestAllowedValue,
  formatAllowedValueError,
} from './suggestions.mjs';
import {
  buildFindPathGrowthHint,
  buildSlugNotFoundGrowthHint,
  buildQueryConceptsZeroRowsGrowthHint,
  buildFindEvidenceZeroHitsGrowthHint,
  findNearTitleMatches,
} from './growth-hint.mjs';
import {
  VAULT_ROOT,
  REPO_ROOT,
  REPO_ROOT_IS_GROUNDED,
  VAULT_RESOLUTION,
  REPO_RESOLUTION,
  COMPILED_ONTOLOGY_CACHE,
} from './server/runtime.mjs';
import {
  GRAPH_REF_ARRAY_MAX_ITEMS,
  IGNORE_ARRAY_MAX_ITEMS,
  SOURCE_FOLDER_ARRAY_MAX_ITEMS,
  MEANING_GATE_EVIDENCE_ROW_LIMIT,
  MEANING_GATE_REVIEW_ROW_LIMIT,
  BODY_DELIVERY_MODES,
} from './server/tool-schemas.mjs';
import {
  TOOL_INVENTORY_PLACEHOLDER,
  SERVER_INSTRUCTIONS_TEMPLATE,
} from './server/instructions.mjs';
import {
  READ_TOOL_NAMES,
  READ_ONLY_MODE,
  WRITE_CONSENT_MODE,
  TOOLS_FOR_LIST,
  TOOL_BY_NAME,
} from './server/registry.mjs';





const SERVER_INSTRUCTIONS = SERVER_INSTRUCTIONS_TEMPLATE.replace(
  TOOL_INVENTORY_PLACEHOLDER,
  buildToolInventorySection(TOOLS_FOR_LIST),
);
const server = new Server(
  { name: 'ontology-atlas-mcp', version: SERVER_VERSION },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
);

// v2 takes a **method string**, not a schema object. Passing the old
// `ListToolsRequestSchema` makes v2 throw "not a spec request method" — it fails
// loudly at startup rather than being silently ignored, so this is a safe shape.
server.setRequestHandler('tools/list', async () => ({ tools: TOOLS_FOR_LIST }));


// ── Activity log — one local audit line per successful write (best-effort) ──
// Schema and rationale: mcp/src/activity-log.mjs. Dry runs (no change) and
// invalid-only batches are not recorded — the audit log carries what happened,
// nothing else. A failed append never affects the write result.
function summarizeWrite(name, args, result) {
  switch (name) {
    case 'add_concept':
      return { target: args.slug, summary: `add_concept ${args.kind}:${args.slug}` };
    case 'add_relation':
      return { target: args.from, summary: `${args.from} --${args.type}--> ${args.to}`, why: args.why ?? null };
    case 'remove_relation':
      return result?.dryRun ? null : { target: args.from, summary: `remove ${args.from} --${args.type}--> ${args.to}` };
    case 'replace_relation':
      return result?.dryRun ? null : { target: args.from, summary: `replace ${args.from} --${args.oldType}--> ${args.oldTo} with --${args.newType}--> ${args.newTo}`, why: args.why ?? null };
    case 'add_concepts': {
      const okRows = (result?.concepts ?? []).filter((row) => row?.ok).length;
      return okRows > 0 ? { target: '(batch)', summary: `add_concepts ${okRows} rows written` } : null;
    }
    case 'add_relations': {
      const rows = result?.relations ?? [];
      const okRows = rows.filter((row) => row?.ok).length;
      if (okRows === 0) return null;
      /*
       * ⚠️ **Do not drop the reason** (caught by the steward seat, 2026-08-16).
       *
       * Batch rows carry `why` too, and the runtime *requires* it for
       * `depends_on`. This branch returned only `{ target, summary }`, so the
       * reason reached the frontmatter but disappeared from the activity record.
       *
       * The consequence was observed: all 15 activity lines in a live vault read
       * `why: null`, two of them from exactly this path — and "the record has no
       * reasons" nearly became evidence for an unrelated conclusion.
       *
       * Rows can carry different reasons, so collect **only the reasons of rows
       * that succeeded**. Repeats collapse to one entry: ten rows sharing a
       * reason would otherwise print it ten times and become unreadable.
       */
      // ⚠️ Numbering **after** filtering desynchronises rows from the input.
      // Keep the original order and read the reason only off successful rows.
      const reasons = [
        ...new Set(
          rows
            .map((row, index) => (row?.ok ? args.relations?.[index]?.why : null))
            .filter((why) => typeof why === 'string' && why.trim().length > 0)
            .map((why) => why.trim()),
        ),
      ];
      return {
        target: '(batch)',
        summary: `add_relations ${okRows} rows written`,
        why: reasons.length > 0 ? reasons.join(' · ') : null,
      };
    }
    case 'patch_concept':
      return { target: args.slug, summary: `patch_concept ${args.slug}` };
    case 'connect_project_source':
      return result?.changed
        ? { target: result.projectSlug, summary: `connect_project_source ${result.mode} ${result.binding?.kind ?? ''}`.trim() }
        : null;
    case 'disconnect_project_source':
      return result?.changed
        ? { target: result.projectSlug, summary: `disconnect_project_source ${result.removed} removed` }
        : null;
    case 'rename_concept':
      return result?.dryRun ? null : { target: args.newSlug, summary: `rename ${args.oldSlug} → ${args.newSlug}` };
    case 'reclassify_concept':
      return result?.dryRun ? null : { target: result?.newSlug ?? args.slug, summary: `reclassify ${args.slug} → ${args.newKind}` };
    case 'merge_concepts':
      return result?.dryRun ? null : { target: args.intoSlug, summary: `merge ${args.fromSlug} → ${args.intoSlug}` };
    case 'delete_concept':
      return result?.dryRun ? null : { target: args.slug, summary: `delete ${args.slug}` };
    case 'absorb_document':
      return result?.dryRun ? null : { target: args.filePath ?? '(doc)', summary: `absorb ${args.filePath ?? ''}`.trim() };
    default:
      return null;
  }
}

function logWrite(name, args, result) {
  try {
    const summarized = summarizeWrite(name, args, result);
    if (summarized) {
      appendActivityEntry(
        VAULT_ROOT,
        buildActivityEntry({
          tool: name,
          target: summarized.target,
          summary: summarized.summary,
          why: summarized.why ?? null,
          // Heartbeat (deliberate registration) > the connect greeting's
          // clientInfo.name (automatic) > null. Claude Code and Codex sessions
          // that connect without registering now leave a name behind too.
          agent: resolveAgentName(VAULT_ROOT, server.getClientVersion?.()),
        }),
      );
    }
  } catch {
    /* The audit log is a side effect — it must never damage the write result */
  }
  return result;
}

// ── Tool handlers ─────────────────────────────────────────────────────────

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

function formatUnknownToolError(name) {
  const allowedNames = [...TOOL_BY_NAME.keys()].sort();
  const suggestion = closestAllowedValue(name, allowedNames);
  const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
  return `Unknown tool: ${name}.${suggestionText} Allowed tools: ${allowedNames.join(', ')}.`;
}

function ok(result) {
  const compactPrompt = result?.contract === 'agentBriefCompact:v2'
    && typeof result?.handoffPrompt === 'string'
    ? result.handoffPrompt
    : null;
  const response = {
    content: [{ type: 'text', text: compactPrompt ?? JSON.stringify(result, null, 2) }],
  };
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    response.structuredContent = result;
  }
  return response;
}

function error(err) {
  const message = err instanceof Error ? err.message : String(err);
  const details = structuredErrorDetails(message);
  // Slug-unresolved paths (`get_concept`, `node_profile`) attach a growthHint to
  // the Error instance; this is the one place that collects them and lifts them
  // into `structuredContent`. Never present on a success response.
  const growthHint = err && typeof err === 'object' ? err.growthHint : undefined;
  const repairFields = err && typeof err === 'object' && err.repairFields
    ? err.repairFields
    : {};
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
    structuredContent: {
      ok: false,
      errorCode: classifyErrorCode(err, message),
      error: message,
      ...details,
      ...repairFields,
      ...(growthHint ? { growthHint } : {}),
    },
  };
}

function structuredErrorDetails(message) {
  const unknownTool = message.match(/^Unknown tool: ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed tools: (.+)\.$/i);
  if (unknownTool) {
    const [, receivedTool, suggestion, allowedText] = unknownTool;
    return omitUndefined({
      receivedTool,
      suggestion,
      allowedTools: splitCommaList(allowedText),
    });
  }

  const unknownArgument = message.match(
    /^Unknown argument "([^"]+)" for ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed arguments: (.+)\. Received arguments: (.+)\.$/i,
  );
  if (unknownArgument) {
    const [, receivedArgument, toolName, suggestion, allowedText, receivedText] = unknownArgument;
    return omitUndefined({
      toolName,
      receivedArgument,
      suggestion,
      unknownArguments: [omitUndefined({ name: receivedArgument, suggestion })],
      allowedArguments: splitCommaList(allowedText),
      receivedArguments: splitCommaList(receivedText),
    });
  }

  const unknownArguments = message.match(
    /^Unknown arguments for ([^:]+): (.+)\. Allowed arguments: (.+)\. Received arguments: (.+)\.$/i,
  );
  if (unknownArguments) {
    const [, toolName, unknownText, allowedText, receivedText] = unknownArguments;
    return {
      toolName,
      receivedArguments: splitCommaList(receivedText),
      unknownArguments: extractUnknownArgumentHints(unknownText),
      allowedArguments: splitCommaList(allowedText),
    };
  }

  const unknownField = message.match(
    /^Unknown field "([^"]+)" in ([^.]+)\.(?: Did you mean "([^"]+)"\?)? Allowed fields: (.+)\. Received fields: (.+)\.$/i,
  );
  if (unknownField) {
    const [, receivedField, rowName, suggestion, allowedText, receivedText] = unknownField;
    return omitUndefined({
      rowName,
      receivedField,
      suggestion,
      unknownFields: [omitUndefined({ name: receivedField, suggestion })],
      allowedFields: splitCommaList(allowedText),
      receivedFields: splitCommaList(receivedText),
    });
  }

  const unknownFields = message.match(
    /^Unknown fields in ([^:]+): (.+)\. Allowed fields: (.+)\. Received fields: (.+)\.$/i,
  );
  if (unknownFields) {
    const [, rowName, unknownText, allowedText, receivedText] = unknownFields;
    return {
      rowName,
      unknownFields: extractUnknownArgumentHints(unknownText),
      allowedFields: splitCommaList(allowedText),
      receivedFields: splitCommaList(receivedText),
    };
  }

  const allowedValue = message.match(/^(.+?) must be one of: (.+)\. Received: (.+)\.(?: Did you mean "([^"]+)"\?)?$/i);
  if (allowedValue) {
    const [, valueName, allowedText, receivedText, suggestion] = allowedValue;
    return omitUndefined({
      valueName,
      receivedValue: parseReceivedValueText(receivedText),
      suggestion,
      allowedValues: splitCommaList(allowedText),
    });
  }

  const missingSlug = message.match(
    /^(.+?): "([^"]+)"\. Use list_concepts\(\) to see all slugs, or find_evidence\(\{title:"[^"]*"\}\) to search by title\.(?: If the endpoint is real but absent, create it first with add_concept\(slug, kind, title\)\.)?(?: Similar slugs in this vault: (.+)\.)?$/i,
  );
  if (missingSlug) {
    const [, subject, slug, similarText] = missingSlug;
    const hasCreateHint = /add_concept\(slug, kind, title\)/.test(message);
    return omitUndefined({
      missingSubject: subject,
      missingSlug: slug,
      recoveryTools: ['list_concepts', 'find_evidence'],
      createTool: hasCreateHint ? 'add_concept' : undefined,
      similarSlugs: similarText ? extractQuotedList(similarText) : [],
    });
  }

  const unresolvedCompiledSlug = message.match(
    /^(.+?) "([^"]+)" does not resolve to a compiled ontology node\.(?: Did you mean: (.+)\?)?$/i,
  );
  if (unresolvedCompiledSlug) {
    const [, subject, slug, similarText] = unresolvedCompiledSlug;
    return {
      missingSubject: subject,
      missingSlug: slug,
      recoveryTools: ['list_concepts', 'find_evidence'],
      createTool: 'add_concept',
      similarSlugs: similarText ? splitCommaList(similarText) : [],
    };
  }

  const existingDoc = message.match(
    /^Doc already exists at "([^"]+)"\. To update fields, use patch_concept\(slug, frontmatter, body, expected_mtime\)\. To rename, use rename_concept\(oldSlug, newSlug\)\. Never delete-then-add/i,
  );
  if (existingDoc) {
    return {
      conflictSubject: 'Doc already exists',
      conflictSlug: existingDoc[1],
      recoveryTools: ['patch_concept', 'rename_concept'],
      avoidTools: ['delete_concept'],
    };
  }

  const existingTarget = message.match(
    /^Target slug already exists: "([^"]+)"\. Pass overwrite: true to replace it\.$/i,
  );
  if (existingTarget) {
    return {
      conflictSubject: 'Target slug already exists',
      conflictSlug: existingTarget[1],
      recoveryTools: ['rename_concept'],
      overwriteOption: 'overwrite',
    };
  }

  return {};
}

function structuredRowErrorDetails(err, message) {
  return {
    errorCode: classifyErrorCode(err, message),
    ...structuredErrorDetails(message),
  };
}

function extractUnknownArgumentHints(text) {
  return [...text.matchAll(/"([^"]+)"(?: \(did you mean "([^"]+)"\?\))?/g)].map((match) => omitUndefined({
    name: match[1],
    suggestion: match[2],
  }));
}

function splitCommaList(text) {
  if (text === 'no arguments' || text === 'none') return [];
  return String(text)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractQuotedList(text) {
  return [...String(text).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function parseReceivedValueText(text) {
  const value = String(text).trim();
  const quoted = value.match(/^"([\s\S]*)"$/);
  return quoted ? quoted[1] : value;
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function classifyErrorCode(err, message) {
  if (err instanceof VaultConflictError || err?.code === 'VAULT_CONFLICT') {
    return 'vault_conflict';
  }
  if (/^Unknown tool:/i.test(message)) return 'unknown_tool';
  if (/^Unknown argument /i.test(message) || /^Unknown arguments for /i.test(message)) {
    return 'unknown_argument';
  }
  if (/^Unknown field /i.test(message) || /^Unknown fields in /i.test(message)) {
    return 'invalid_arguments';
  }
  if (/not found|does not exist|does not resolve to a compiled ontology node/i.test(message)) {
    return 'not_found';
  }
  if (/already exists|conflict|identical/i.test(message)) return 'conflict';
  if (/must be|must not|cannot be|requires exactly one of|At least one|Invalid value|Received:|points outside|Too many/i.test(message)) {
    return 'invalid_arguments';
  }
  return 'tool_error';
}

// ── Tool implementations ──────────────────────────────────────────────────

function normalizeToolArguments(args, toolName) {
  if (args === undefined) return {};
  if (args === null || Array.isArray(args) || typeof args !== 'object') {
    throw new Error('tool arguments must be an object.');
  }
  const tool = TOOL_BY_NAME.get(toolName);
  if (tool) {
    const allowed = new Set(Object.keys(tool.inputSchema?.properties ?? {}));
    const unknown = Object.keys(args).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      const allowedNames = [...allowed].sort();
      const allowedText = allowedNames.length > 0 ? allowedNames.join(', ') : 'no arguments';
      const receivedNames = Object.keys(args).sort();
      const receivedText = receivedNames.length > 0 ? receivedNames.join(', ') : 'none';
      if (unknown.length === 1) {
        const [key] = unknown;
        const suggestion = closestAllowedValue(key, allowedNames);
        const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
        throw new Error(
          `Unknown argument "${key}" for ${toolName}.${suggestionText} Allowed arguments: ${allowedText}. Received arguments: ${receivedText}.`,
        );
      }
      const unknownText = unknown
        .map((key) => {
          const suggestion = closestAllowedValue(key, allowedNames);
          return suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`;
        })
        .join(', ');
      throw new Error(
        `Unknown arguments for ${toolName}: ${unknownText}. Allowed arguments: ${allowedText}. Received arguments: ${receivedText}.`,
      );
    }
  }
  return args;
}

function requireOptionalNonNegativeNumber(value, name) {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

function requireOptionalNonNegativeInteger(value, name, options = {}) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
}

function requireOptionalPositiveInteger(value, name, options = {}) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }
}

function requireOptionalDirection(value, name, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new Error(formatAllowedValueError(name, value, allowed));
  }
}

function requireOptionalEnum(value, name, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) {
    throw new Error(formatAllowedValueError(name, value, allowed));
  }
}

function requireOptionalBoolean(value, name) {
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean.`);
  }
}

function listConcepts({ kind, domain, since, summary, offset = 0, limit = 100 }) {
  requireOptionalNonBlankString(kind, 'kind');
  requireOptionalEnum(kind, 'kind', NODE_KIND_VALUES);
  requireOptionalNonBlankString(domain, 'domain');
  requireOptionalNonNegativeNumber(since, 'since');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const docs = loadVaultDocs(VAULT_ROOT);

  // Vault-wide validation counts. Every raw doc is validated so silent
  // corruption becomes visible, and an agent sees the vault's state in one call.
  let errorCount = 0;
  let warningCount = 0;
  /*
   * ⚠️ **Narrow before aggregating** (2026-08-11). This number is
   * `list_concepts.vaultWarnings`, and `mcp-verify` fails when it is non-zero. A
   * freshly created vault was reported as "connection failed" for exactly that
   * reason: the warning was "no parent" while the project already contained the
   * node. Grouping by slug before counting is what makes containment visible.
   */
  const issuesBySlugForCount = new Map();
  for (const doc of docs) {
    if (!doc.raw) continue;
    const report = validateVaultDocument(doc.raw);
    if (report.issues.length > 0) issuesBySlugForCount.set(doc.slug, [...report.issues]);
  }
  for (const [slug, issues] of groupDanglingIssuesBySlug(docs)) {
    issuesBySlugForCount.set(slug, [...(issuesBySlugForCount.get(slug) ?? []), ...issues]);
  }
  suppressParentedExpectedFieldIssues(issuesBySlugForCount, docs);
  // A wiki page carries no `kind:` by contract; the absence is the rule, not a finding.
  suppressLibraryKindIssues(issuesBySlugForCount);
  for (const issues of issuesBySlugForCount.values()) {
    for (const issue of issues) {
      if (issue.severity === 'error') errorCount += 1;
      else warningCount += 1;
    }
  }

  // When `since` (ms) is a number, only docs with mtime > since pass. Agents use
  // it for incremental sync: capture the maximum mtime from a previous list
  // response, pass it as `since`, receive only what changed. Equal mtimes are
  // excluded strictly, so resending the max never double-fetches.
  const sinceMs = typeof since === 'number' && Number.isFinite(since) ? since : null;
  const filtered = docs.filter((doc) => {
    const docKind = doc.frontmatter.kind;
    if (kind && docKind !== kind) return false;
    if (!docKind) return false; // A frontmatter `kind:` is what makes it an ontology node.
    // Domain filter — matches frontmatter `domain:`. Answers the common query
    // ("every capability in the auth domain") in one call without the
    // query_concepts DSL. Applied uniformly across kinds; no match simply yields
    // an empty result.
    if (domain && doc.frontmatter.domain !== domain) return false;
    if (sinceMs !== null && (typeof doc.mtime !== 'number' || doc.mtime <= sinceMs)) return false;
    return true;
  }).sort((a, b) => a.slug.localeCompare(b.slug));
  if (offset > filtered.length) {
    throw new Error(
      `offset must be less than or equal to the total matching nodes (${filtered.length}); Received: ${offset}.`,
    );
  }
  const page = filtered.slice(offset, offset + limit);
  const summaryTruncatedSlugs = [];
  const nodes = page.map((doc) => {
    // Opt-in summary, so one list call answers "what is each node about?".
    // Capped at 200 chars to keep the payload from ballooning (same cap as
    // find_evidence). Off unless the caller passes summary:true.
    let summaryFields = {};
    if (summary === true) {
      const delivery = describeBodyDelivery(doc.body, { maxLen: 200 });
      if (delivery.info.truncated) summaryTruncatedSlugs.push(doc.slug);
      summaryFields = {
        summary: delivery.text,
        ...(delivery.info.truncated ? { summaryTruncated: true } : {}),
      };
    }
    return {
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      domain: doc.frontmatter.domain,
      capabilities: doc.frontmatter.capabilities,
      elements: doc.frontmatter.elements,
      // Per-node mtime (ms), so a list response alone answers "which nodes
      // changed recently". Same meaning as get_concept's mtime field: sortable,
      // and usable for external-change detection.
      mtime: doc.mtime,
      ...summaryFields,
    };
  });
  return {
    total: filtered.length,
    vaultRoot: VAULT_ROOT,
    nodes,
    returned: nodes.length,
    limited: offset + nodes.length < filtered.length,
    pagination: {
      offset,
      limit,
      total: filtered.length,
      returned: nodes.length,
      hasMore: offset + nodes.length < filtered.length,
      nextOffset: offset + nodes.length < filtered.length ? offset + nodes.length : null,
    },
    // A truncated summary is **marked on the row and explained once for the
    // list**. Repeating the notice per row only grows the payload; omitting it
    // entirely leaves the caller unable to tell what is missing, so it cannot
    // ask again.
    summaryHint:
      summaryTruncatedSlugs.length > 0
        ? `${summaryTruncatedSlugs.length} row(s) carry a partial summary (summaryTruncated: true). Read those bodies in full with get_concepts({ slugs: [...], body: "full" }).`
        : undefined,
    vaultWarnings:
      errorCount + warningCount > 0
        ? { errorCount, warningCount }
        : undefined,
  };
}

// The "Doc not found" text stays exactly as it is (the get_concepts batch and the
// verify contract depend on the literal string); only growthHint rides on the
// Error instance, and error() lifts it into structuredContent.
function docNotFoundError(slug, docs) {
  const err = new Error(`Doc not found: ${slug}`);
  const candidateSlugs = suggestSimilarSlugs(VAULT_ROOT, slug);
  // Check first whether the vault names this in a relation key: most of what the
  // screens (map, insights) count as concepts are reference-only concepts with no
  // document, so a flat "not found" turns every name a user copies off the screen
  // into a dead end.
  let referencedBy = [];
  try {
    referencedBy = findGraphReferences(docs ?? loadVaultDocs(VAULT_ROOT), slug);
  } catch {
    // Never fail the error path just because the vault could not be read.
    referencedBy = [];
  }
  err.repairFields = {
    missingSubject: 'Doc not found',
    missingSlug: slug,
    recoveryTools: ['list_concepts', 'find_evidence'],
    createTool: 'add_concept',
    similarSlugs: candidateSlugs,
    ...(referencedBy.length > 0 ? { referencedBy } : {}),
  };
  err.growthHint = buildSlugNotFoundGrowthHint({ slug, candidateSlugs, referencedBy });
  return err;
}

function uidNotFoundError(uid) {
  const err = new Error(`Doc not found for uid: ${uid}`);
  err.repairFields = {
    missingSubject: 'Doc not found for uid',
    missingUid: uid,
    recoveryTools: ['list_concepts', 'find_evidence'],
  };
  return err;
}

function requireBodyMode(value, name = 'body') {
  if (value === undefined) return 'excerpt';
  if (typeof value !== 'string' || !BODY_DELIVERY_MODES.includes(value)) {
    throw new Error(`${name} must be one of: ${BODY_DELIVERY_MODES.join(', ')}.`);
  }
  return value;
}

function getConcept({ slug, uid, body }, context = {}) {
  const hasSlug = slug !== undefined;
  const hasUid = uid !== undefined;
  if (hasSlug === hasUid) {
    throw new Error('get_concept requires exactly one of slug or uid.');
  }
  if (hasSlug) requireNonBlankString(slug, 'slug');
  if (hasUid) {
    requireNonBlankString(uid, 'uid');
    const issue = nodeUidIssue(uid);
    if (issue) throw new Error(issue);
  }
  const bodyMode = requireBodyMode(body);
  const docs = context.docs ?? loadVaultDocs(VAULT_ROOT);
  const canonicalSlug = hasUid
    ? resolveExistingVaultUid(uid, docs)
    : resolveExistingVaultSlug(slug, docs);
  if (!canonicalSlug) {
    if (hasUid) throw uidNotFoundError(uid);
    throw docNotFoundError(slug, docs);
  }
  let doc;
  try {
    doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalSlug));
  } catch (err) {
    // Surface fs errors (ENOENT and friends) as a user-friendly message so
    // absolute paths do not leak.
    if (err && (err.code === 'ENOENT' || /no such file/i.test(err.message))) {
      if (hasUid) throw uidNotFoundError(uid);
      throw docNotFoundError(slug);
    }
    throw err;
  }
  // Detects frontmatter corruption in this doc, so an agent can report the
  // warnings and recommend vault:validate.
  const validation = doc.raw ? validateVaultDocument(doc.raw) : null;
  const warnings = validation ? [...validation.issues] : [];
  /*
   * ⚠️ **Say so when the document is outside the graph** (measured 2026-08-08).
   *
   * A vault is an ordinary markdown folder, so meeting notes, memos, and drafts
   * live alongside nodes by design. But this tool is named `get_concept`, so the
   * response itself asserts "this is a concept". Previously a memo with no
   * frontmatter at all carried **no warning whatsoever** (while a doc missing only
   * `kind:` got `missing-kind`) — the most common case had the least signal.
   *
   * Do not reject it: reading a person's notes is legitimate, and blocking it
   * would break the local-first promise. Say what is being handed over instead.
   */
  const isNode =
    typeof doc.frontmatter?.kind === 'string' && doc.frontmatter.kind.trim() !== '';
  if (!isNode) {
    warnings.push({
      code: 'not-a-graph-node',
      severity: 'warning',
      message:
        'This doc is not a graph node — it has no `kind:`, so it has no relations, no UID, and never appears on the map. ' +
        'Ordinary markdown (meeting notes, memos, drafts) lives in the same folder by design. ' +
        'Cite it as a note, not as graph evidence. To promote it, add a `kind:` or use absorb_document.',
    });
  }
  const danglingIssuesBySlug =
    context.danglingIssuesBySlug ??
    groupDanglingIssuesBySlug(context.docs ?? loadVaultDocs(VAULT_ROOT));
  warnings.push(...(danglingIssuesBySlug.get(doc.slug) ?? []));
  // `rationale` is the document's own `relation_notes` sentence for that target,
  // present only when one is stored — the same optional field `find_path` and
  // `query_ontology` edges carry, so an agent reads what `add_relation(why)` wrote.
  const outgoingEdges = collectNeighborRefs(doc).map(({ key, ref }) => {
    const rationale = relationNoteFor(doc, ref);
    return rationale === undefined ? { to: ref, via: key } : { to: ref, via: key, rationale };
  });
  // **Say that it was truncated.** Even excerpt mode must carry the original
  // length and the number of characters withheld, so the caller knows there is
  // more and can ask again. It used to cut silently, and an agent handed only the
  // vault answered "it might exist but I could not confirm".
  const delivery = describeBodyDelivery(doc.body, {
    mode: bodyMode,
    hint:
      bodyMode === 'full'
        ? `Body exceeds the ${FULL_BODY_MAX_CHARS}-char single-call cap — read the file directly for the remainder.`
        : `Only the first prose paragraph was returned. Call get_concept({ slug: "${doc.slug}", body: "full" }) for the whole body (definition / evidence / confidence / in-scope-out-of-scope sections live there).`,
  });
  return {
    uid: doc.frontmatter.uid,
    slug: doc.slug,
    isNode,
    frontmatter: doc.frontmatter,
    // `full` drops `excerpt` and ships `body` alone — sending the same text twice
    // bills a caller who explicitly asked for everything for up to 800 duplicate
    // characters.
    ...(bodyMode === 'full'
      ? { body: delivery.text }
      : { excerpt: delivery.text }),
    bodyInfo: delivery.info,
    neighbors: {
      domains: doc.frontmatter.domains || [],
      domain: doc.frontmatter.domain || null,
      capabilities: doc.frontmatter.capabilities || [],
      elements: doc.frontmatter.elements || [],
      // Alias-aware: a `depends_on:`-authored edge must appear here too, or this
      // block contradicts the outgoingEdges list built from the same document.
      dependencies: normalizeRelationRefs(relationRefsFor(doc, 'dependencies')),
      relates: doc.frontmatter.relates || [],
      contains: doc.frontmatter.contains || [],
      describes: doc.frontmatter.describes || [],
    },
    outgoingEdges,
    review: describeReview(doc),
    // In a read-modify-write flow the caller passes this straight through as the
    // `expected_mtime` of a later patch_concept / delete_concept, which is what
    // makes external-change detection work. Filesystem mtime, in ms.
    mtime: doc.mtime,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// Batch variant of get_concept. Input `slugs[]` order is preserved, and a missing
// slug surfaces as an `{ ok: false, error }` row instead of aborting the batch, so
// an agent gets a partial result (reusing a list_concepts result without
// revalidating does not kill the whole batch over one or two stale slugs). The cap
// of 50 keeps the payload bounded; larger vaults chunk the call.
function getConceptsBatch({ slugs, uids, body }) {
  const hasSlugs = slugs !== undefined;
  const hasUids = uids !== undefined;
  if (hasSlugs === hasUids) {
    throw new Error('get_concepts requires exactly one of slugs or uids.');
  }
  const selectors = hasUids ? uids : slugs;
  const selectorName = hasUids ? 'uids' : 'slugs';
  if (!Array.isArray(selectors)) {
    throw new Error(`${selectorName} must be an array of strings`);
  }
  const bodyMode = requireBodyMode(body);
  if (selectors.length === 0) {
    return { concepts: [] };
  }
  if (selectors.length > 50) {
    throw new Error(
      `Too many ${selectorName}: ${selectors.length}. Max 50 per call — split into multiple get_concepts batches.`
    );
  }
  // Full bodies grow the per-row payload by an order of magnitude. 50 rows × full
  // body is not one response — it is several calls, so the cap drops and says so.
  if (bodyMode === 'full' && selectors.length > GET_CONCEPTS_FULL_BODY_MAX) {
    throw new Error(
      `Too many ${selectorName} for body:"full": ${selectors.length}. Max ${GET_CONCEPTS_FULL_BODY_MAX} per call — split into multiple get_concepts batches, or drop body:"full" to read ${selectors.length} excerpts at once.`
    );
  }
  const docs = loadVaultDocs(VAULT_ROOT);
  const danglingIssuesBySlug = groupDanglingIssuesBySlug(docs);
  const concepts = selectors.map((selector) => {
    try {
      requireNonBlankString(selector, hasUids ? 'uid' : 'slug');
      const result = getConcept(
        hasUids ? { uid: selector, body: bodyMode } : { slug: selector, body: bodyMode },
        { docs, danglingIssuesBySlug },
      );
      return { ok: true, ...result };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const repairFields = err && typeof err === 'object' && err.repairFields
        ? err.repairFields
        : {};
      const growthHint = err && typeof err === 'object' ? err.growthHint : undefined;
      // Surface the friendly message ("Doc not found") as-is; no absolute path leak.
      return {
        ...(hasUids ? { uid: selector } : { slug: selector }),
        ok: false,
        error: msg,
        ...structuredRowErrorDetails(err, msg),
        ...repairFields,
        ...(growthHint ? { growthHint } : {}),
      };
    }
  });
  return { concepts };
}

function findEvidence({ title, limit, nodesOnly = false } = {}) {
  requireNonBlankString(title, 'title');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  requireOptionalBoolean(nodesOnly, 'nodesOnly');
  const docs = loadVaultDocs(VAULT_ROOT);
  const matches = [];
  for (const doc of docs) {
    const docTitle = String(doc.frontmatter.title || doc.frontmatter.name || '');
    // capabilities/elements joined with \n so a needle can't false-match across
    // the field boundary — keeps inclusion identical to the prior per-field sweep.
    const frontmatterHaystack = `${String(doc.frontmatter.capabilities ?? '')}\n${String(doc.frontmatter.elements ?? '')}`;
    // Atlas Track A #4 — relevance score (title > frontmatter ref > body + title
    // token-overlap). Inclusion unchanged: score>0 ⟺ a substring matched.
    const { score, matchedIn } = scoreEvidence(title, {
      title: docTitle,
      frontmatterHaystack,
      body: doc.body,
    });
    if (score <= 0) continue;
    // Match excerpts get truncated too — and find_evidence can match *inside* the
    // body, so without saying it was cut, the very sentence that matched can be
    // absent from the response. The two fields appear only when truncated.
    const evidenceDelivery = describeBodyDelivery(doc.body, { maxLen: 200 });
    // ⚠️ **The row states whether it is a node** (2026-08-08).
    // Markdown that is not a node (meeting notes, memos, drafts) legitimately
    // lives in a vault. That used to be expressed only as «the `kind` key is
    // absent», and an absent key disappears from JSON — which is **no signal at
    // all** to the reader. Agents were reading memos as nodes and citing them.
    const isNode = typeof doc.frontmatter.kind === 'string' && doc.frontmatter.kind.trim() !== '';
    if (nodesOnly && !isNode) continue;
    matches.push({
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      isNode,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      // Same shape as list_concepts / find_backlinks / find_orphans /
      // query_concepts, so an agent reuses one sort/filter path across every
      // read tool.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
      matchedIn,
      score,
      // One-line prose summary of the matched doc (max 200 chars) so an agent
      // knows what a match is about without a follow-up get_concept. Same
      // prose-aware extraction as get_concept's 800-char helper, shorter cap.
      excerpt: evidenceDelivery.text,
      ...(evidenceDelivery.info.truncated
        ? {
            excerptTruncated: true,
            bodyChars: evidenceDelivery.info.totalChars,
          }
        : {}),
    });
  }
  /*
   * Best match first: score desc → **nodes before non-nodes** → slug asc.
   *
   * The middle key was added 2026-08-08. Body matches all score identically
   * (0.3), so sorting on score alone left slug alphabetisation as the only
   * tiebreak — in a vault of 3,000 loose documents the top five were all memos
   * and not one real node appeared (measured).
   *
   * It never beats score. A memo whose title matches exactly (0.75+) still ranks
   * above a node grazed in the body (0.3) — a person's memo is sometimes the real
   * evidence, and hiding it would break this product's promise. Only the handling
   * of ties changed.
   */
  matches.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.isNode) - Number(a.isNode) ||
      a.slug.localeCompare(b.slug),
  );
  const limited = typeof limit === 'number' ? matches.slice(0, limit) : matches;
  const result = { query: title, matches: limited };
  // When loose documents came back in the results, say so and give the way to
  // narrow it — rather than filtering silently, hand the reader what they need to
  // judge for themselves.
  const nonNodeCount = limited.filter((m) => !m.isNode).length;
  if (nonNodeCount > 0) {
    result.nonNodeHint =
      `${nonNodeCount} of ${limited.length} match(es) are not graph nodes (no \`kind:\` — meeting notes, memos, drafts ` +
      `live in the same folder by design). They are ranked below nodes of equal relevance. ` +
      `Pass nodesOnly: true to see only graph nodes.`;
  }
  const truncatedSlugs = limited.filter((m) => m.excerptTruncated).map((m) => m.slug);
  if (truncatedSlugs.length > 0) {
    result.bodyHint = `${truncatedSlugs.length} of ${limited.length} match(es) returned a partial excerpt — the matched text may sit past it. Read the whole body with get_concepts({ slugs: [${truncatedSlugs
      .slice(0, 3)
      .map((s) => `"${s}"`)
      .join(', ')}${truncatedSlugs.length > 3 ? ', …' : ''}], body: "full" }).`;
  }
  // Zero hits is an unanswered question. Substring matching already failed (every
  // score <= 0), so near-miss titles are found by token overlap alone.
  if (matches.length === 0) {
    const candidates = docs.map((doc) => ({
      slug: doc.slug,
      title: String(doc.frontmatter.title || doc.frontmatter.name || doc.slug),
    }));
    const nearMatches = findNearTitleMatches(title, candidates);
    result.growthHint = buildFindEvidenceZeroHitsGrowthHint({ title, nearMatches });
  }
  return result;
}

const ADD_CONCEPT_KINDS = new Set(['project', 'domain', 'capability', 'element', 'document']);
const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);

function requireNonBlankString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must not have leading or trailing whitespace.`);
  }
  if (value.includes('\0')) {
    throw new Error(`${name} must not contain a null byte.`);
  }
  return value;
}

function requireOptionalNonBlankString(value, name) {
  if (value === undefined) return;
  requireNonBlankString(value, name);
}

function requireOptionalStringArray(value, name, options = {}) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new Error(`${name} must contain at most ${options.max} items.`);
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`${name} must be an array of strings.`);
    }
    if (item.trim() === '') {
      throw new Error(`${name} items must be non-empty strings.`);
    }
    if (item !== item.trim()) {
      throw new Error(`${name} items must not have leading or trailing whitespace.`);
    }
    if (item.includes('\0')) {
      throw new Error(`${name} items must not contain a null byte.`);
    }
  }
}

function requireOptionalRelationTypeArray(value, name) {
  requireOptionalStringArray(value, name, { max: RELATION_TYPE_VALUES.length });
  if (value === undefined) return;
  for (const item of value) {
    if (!RELATION_TYPE_VALUES.includes(item)) {
      throw new Error(formatAllowedValueError(`${name} items`, item, RELATION_TYPE_VALUES));
    }
  }
}

function requireOptionalNodeKindArray(value, name) {
  requireOptionalStringArray(value, name, { max: NODE_KIND_VALUES.length });
  if (value === undefined) return;
  for (const item of value) {
    if (!NODE_KIND_VALUES.includes(item)) {
      throw new Error(formatAllowedValueError(`${name} items`, item, NODE_KIND_VALUES));
    }
  }
}

function requireOptionalPlainObject(value, name) {
  if (value === undefined) return;
  requirePlainObject(value, name);
}

function requirePlainObject(value, name) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be an object.`);
  }
}

function requireAllowedObjectKeys(value, name, allowedKeys) {
  const allowed = new Set(allowedKeys);
  const receivedFields = Object.keys(value).sort();
  const receivedText = receivedFields.length > 0 ? receivedFields.join(', ') : 'none';
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownFields.length === 0) return;
  if (unknownFields.length === 1) {
    const [key] = unknownFields;
    const suggestion = closestAllowedObjectField(key, allowedKeys);
    const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : '';
    throw new Error(
      `Unknown field "${key}" in ${name}.${suggestionText} Allowed fields: ${allowedKeys.join(', ')}. Received fields: ${receivedText}.`,
    );
  }
  const unknownText = unknownFields
    .map((key) => {
      const suggestion = closestAllowedObjectField(key, allowedKeys);
      return suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`;
    })
    .join(', ');
  throw new Error(
    `Unknown fields in ${name}: ${unknownText}. Allowed fields: ${allowedKeys.join(', ')}. Received fields: ${receivedText}.`,
  );
}

function closestAllowedObjectField(key, allowedKeys) {
  if (key === 'relation' && allowedKeys.includes('type')) return 'type';
  return closestAllowedValue(key, allowedKeys);
}

function requireValidFrontmatterPatch(frontmatter) {
  if (frontmatter === undefined) return;
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!GRAPH_ARRAY_KEY_SET.has(key) || value === null || value === undefined) {
      continue;
    }
    requireOptionalStringArray(value, `frontmatter.${key}`, { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  }
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'kind')) {
    const kind = frontmatter.kind;
    if (kind === null) {
      throw new Error('kind cannot be deleted from a vault node — pass a valid kind instead.');
    }
    requireNonBlankString(kind, 'frontmatter.kind');
    if (!ADD_CONCEPT_KINDS.has(kind)) {
      throw new Error(
        `frontmatter.kind must be one of: ${[...ADD_CONCEPT_KINDS].join(', ')}.`,
      );
    }
  }
  for (const key of ['domain', 'slug']) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;
    const value = frontmatter[key];
    if (value === null || value === undefined) continue;
    requireNonBlankString(value, `frontmatter.${key}`);
  }
  // A patch is not authorship (decision ledger, 2026-07-31). `created_by` is a
  // fact the call path proved at write time, so it cannot be rewritten later — if
  // it could, an agent could relabel its own node `human`, and the field would
  // stop being a fact and become a claim. Existing values survive a patch intact.
  if (Object.prototype.hasOwnProperty.call(frontmatter, CREATED_BY_KEY)) {
    throw new Error(
      `frontmatter.${CREATED_BY_KEY} cannot be patched — authorship is stamped once, at write time, by the path that proves it. ` +
        'Patching an existing node is not authorship; leave the field as it is (or absent, which means unknown).',
    );
  }
  requireAgentWritableReviewFields(frontmatter);
}

/**
 * The human-judgment half of a patch, on the one call path that is provably an
 * agent (`docs/benchmark/FINDINGS-2026-09-02-review-marks.md`).
 *
 * Measured, with the rule written in the vault's own `AGENTS.md`: one of three
 * model tiers deleted a live `review_state: human_decides` and replaced it with
 * `review_state: confirmed` plus a `reviewed_by` name it had never been given.
 * A documented convention is honoured in proportion to model capability, so the
 * refusal has to live here, where the call path — not the prompt — decides.
 *
 * ⚠️ **What this is not.** It is a lane guard, not authentication. It decides
 * who may write *through this server*; an agent with ordinary file tools edits
 * the Markdown directly and never meets it, and the binding is an unkeyed hash
 * anyone can recompute. So a stamp here means "no Atlas write tool produced
 * this", never "a person did" — and nothing in this product may say otherwise
 * (Codex review, 2026-09-02). What survives regardless is the Git diff: every
 * such edit is visible, attributable, and revertable, which is the same trust
 * model `forbidden.md` already uses for declarative extensions.
 *
 * The asymmetry is deliberate and is the whole mechanism:
 *
 *   - **Raising is allowed.** An agent that cannot settle a question may write
 *     `review_state: human_decides` and a `review_note`. That is the behaviour
 *     the product wants, and refusing it would leave an agent with no way to
 *     hand work back.
 *   - **Clearing and confirming are refused.** Both assert that a person acted.
 *     Nothing in the file afterwards distinguishes an agent-typed `confirmed`
 *     from a person-typed one, which is exactly why this cannot be a default an
 *     instruction can override.
 *
 * This gate covers writes that come through this server. It cannot reach a
 * direct file edit, and it is not described anywhere as if it could — the
 * durable half of the design is `reviewDigest`, which needs no cooperation.
 */
function requireAgentWritableReviewFields(frontmatter) {
  for (const key of HUMAN_ONLY_REVIEW_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;
    throw new Error(
      `frontmatter.${key} records a person's review, so Atlas write tools do not set it — ` +
        'an agent writing it would be asserting the review, not recording it. ' +
        `If you cannot settle this node yourself, set ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES} with a ${REVIEW_NOTE_KEY} instead.`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(frontmatter, REVIEW_STATE_KEY)) return;
  const state = frontmatter[REVIEW_STATE_KEY];
  if (state === REVIEW_STATE_HUMAN_DECIDES) return;
  if (state === null || state === undefined || state === '') {
    throw new Error(
      `frontmatter.${REVIEW_STATE_KEY} cannot be cleared from this path — a reservation is released by the person who made it. ` +
        'Report the node instead; leaving it in place is the correct outcome of an agent turn.',
    );
  }
  if (state === REVIEW_STATE_CONFIRMED) {
    throw new Error(
      `frontmatter.${REVIEW_STATE_KEY}: ${REVIEW_STATE_CONFIRMED} states that a person judged this node, so Atlas write tools do not set it. ` +
        `Set ${REVIEW_STATE_HUMAN_DECIDES} with a ${REVIEW_NOTE_KEY} if you want a person to look at it.`,
    );
  }
  throw new Error(
    `frontmatter.${REVIEW_STATE_KEY} must be ${REVIEW_STATE_HUMAN_DECIDES} on this path (${REVIEW_STATES.join(' | ')} are the only values).`,
  );
}

/**
 * The node itself is reserved — refuse the whole write, not just its review keys.
 *
 * A reservation that only protected its own frontmatter would be worthless: the
 * meaning a person reserved lives in the body and the relations, and an agent
 * rewriting those while leaving the marker intact is the failure this exists to
 * stop. Every write tool that names an existing node runs this before touching
 * disk, so the refusal cannot be reached by choosing a different tool.
 */
/**
 * The node as it is on disk, or `null` when it is not there yet.
 *
 * A missing file is not an error here: the reservation guard asks "is this node
 * reserved", and a node that does not exist cannot be. Its own write path
 * reports the missing file with the message that fits that operation.
 */
function readDocIfPresent(slug) {
  try {
    return readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, slug));
  } catch {
    return null;
  }
}

/**
 * What a person has ruled on this node — the half a following agent has to be
 * able to retrieve, or the reservation is only a screen decoration.
 *
 * `currentness` is the answer the call-path gate cannot give, because a direct
 * file edit never passes through this server. It is recomputed from the file on
 * every read, so an approval that no longer describes its node says so without
 * anyone having noticed the change or cooperated in reporting it.
 *
 * **`digestNow` was here and was removed** (Codex review, 2026-09-02). It was
 * returned so a human-proving path could bind an approval with the same function
 * this server checks it with. But this server's caller *is* the agent, and the
 * binding is an unkeyed hash: handing over the value that makes a stamp look
 * current is handing over the forgery. The app computes its own through the
 * contract-tested twin, and nothing else needs it.
 */
function describeReview(doc) {
  const frontmatter = doc?.frontmatter ?? {};
  const state = frontmatter[REVIEW_STATE_KEY] ?? null;
  const note = frontmatter[REVIEW_NOTE_KEY] ?? null;
  const currentness = reviewCurrentness(frontmatter, doc?.body ?? '');
  return {
    state,
    ...(note ? { note } : {}),
    ...(frontmatter[REVIEWED_BY_KEY] ? { reviewedBy: frontmatter[REVIEWED_BY_KEY] } : {}),
    ...(frontmatter[REVIEWED_AT_KEY] ? { reviewedAt: frontmatter[REVIEWED_AT_KEY] } : {}),
    currentness,
    ...(state === REVIEW_STATE_HUMAN_DECIDES
      ? {
          agentGuidance:
            'A person reserved this node. Do not write it — report it and let them decide. Atlas write tools refuse it.',
        }
      : {}),
    ...(currentness === 'changed-since-review'
      ? {
          agentGuidance:
            'This node changed after a person confirmed it, so the approval no longer describes what is here. Treat the meaning as unreviewed and say so.',
        }
      : {}),
  };
}

function requireNodeNotReservedForHuman(doc, operation) {
  const state = doc?.frontmatter?.[REVIEW_STATE_KEY];
  if (state !== REVIEW_STATE_HUMAN_DECIDES) return;
  const note = doc?.frontmatter?.[REVIEW_NOTE_KEY];
  throw new Error(
    `${operation} refused: ${doc?.slug ?? 'this node'} carries ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES}, so it is reserved for a person.` +
      (note ? ` What they have to decide: ${note}` : '') +
      ' Report it and let the person decide; only they release the reservation.',
  );
}

/**
 * Authorship stamp — a write that came through this server was made by **an
 * agent**. The call path itself proves that, so it cannot be forged, and this is
 * the only place it is stamped.
 *
 * The name reuses the identity the activity log (`activity.jsonl`) already
 * writes, resolved the same way — heartbeat > the connect greeting's
 * clientInfo.name > unknown (2026-09-07; the activity log made that move on
 * 2026-08-13 and the stamp lagged, so a node written from the app's own agent
 * conversation said `agent:unknown` while the log beside it said `claude-code`).
 * No second identity scheme. With neither only the name is unknown — a human
 * still did not write it — so it is `agent:unknown` (decision ledger, 2026-07-31).
 */
function agentProvenance() {
  return agentCreatedBy(resolveAgentName(VAULT_ROOT, server.getClientVersion?.()));
}

function addConcept({ slug, kind, title, domain, capabilities, elements, path, body, labels }, options = {}) {
  requireNonBlankString(slug, 'slug');
  requireNonBlankString(kind, 'kind');
  requireNonBlankString(title, 'title');
  if (domain !== undefined) requireNonBlankString(domain, 'domain');
  requireOptionalStringArray(capabilities, 'capabilities', { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  requireOptionalStringArray(elements, 'elements', { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  if (path !== undefined) requireNonBlankString(path, 'path');
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // A whitespace-only title is silent pollution too. The UI's isUntitledTitle
  // applies the same gate; MCP keeps parity.
  if (!isValidVaultTitle(title)) {
    throw new Error('title must be a non-empty string.');
  }
  if (!ADD_CONCEPT_KINDS.has(kind)) {
    throw new Error(formatAllowedValueError('kind', kind, [...ADD_CONCEPT_KINDS]));
  }
  // The schema fills the per-kind shape (project: empty domains/capabilities/
  // elements arrays, capability: empty elements array, …) so partial input still
  // leaves consistent frontmatter on disk. The CLI `add` shares this schema
  // module and a contract test blocks drift.
  // Per-locale display names (owner decision, 2026-07-24) — `labels: { ko, en }`
  // is normalised to `display_<locale>` so one node reads correctly on Korean and
  // English screens. `title` is untouched: it stays the single source of truth for
  // search, matching, and file identity.
  const localeLabels = normalizeLocaleLabels(labels);
  const fm = buildFrontmatter({
    slug,
    kind,
    title,
    domain,
    capabilities,
    elements,
    path,
    ...localeLabels,
    // Authorship — passing through MCP is itself the proof that an agent wrote it.
    [CREATED_BY_KEY]: agentProvenance(),
  });
  // Safety net for the #1 failure mode of a growing vault (duplicate nodes):
  // before the write, scan existing nodes and warn (advisory only) on a title
  // collision. It never blocks the write. Batches skip it — in flows where the
  // user already reviewed the candidates (/ontology-bootstrap) a per-node full
  // vault load is not worth its cost.
  const duplicateWarning =
    options.includePostWriteMaintenance === false
      ? null
      : detectDuplicateTitle(title, slug, loadVaultDocs(VAULT_ROOT));
  const filePath = writeDoc(VAULT_ROOT, slug, {
    frontmatter: fm,
    body: body === undefined ? defaultBody(kind, title) : body,
  });
  // Missing `requiredExtras` from the schema become advisories in the response
  // rather than a throw, so the agent's flow continues and the user can fill the
  // gap with a follow-up patch_concept (a capability or element missing its
  // domain is the common case).
  const missing = missingExpectedFields(kind, fm);
  // Guards the mistake of filling one locale and moving on: the author only ever
  // sees their own screen language, while other-locale users get the raw title.
  const localeCodes = localeLabelCodes(localeLabels);
  const partialLocaleWarning =
    localeCodes.length === 1
      ? `labels only has "${localeCodes[0]}" — add the other locale (e.g. labels: { ko, en }) so both audiences read a native name`
      : null;
  const warnings = [
    ...missing.map((k) => `expected field "${k}" missing for kind "${kind}"`),
    ...(duplicateWarning ? [duplicateWarning] : []),
    ...(partialLocaleWarning ? [partialLocaleWarning] : []),
  ];
  return {
    ok: true,
    slug,
    filePath,
    changed: true,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(options.includePostWriteMaintenance === false
      ? {}
      : { postWriteMaintenance: compactPostWriteMaintenance() }),
  };
}

// Batch variant of add_concept. Turns K round trips into one when a
// /ontology-bootstrap flow lands 5–15 nodes at once. Input order is preserved and
// each row is independent, so one row failing (existing slug, invalid kind,
// missing required field) does not abort the rest — that row alone surfaces as
// ok:false. There is no atomic rollback; use serial add_concept calls if you need one.
function addConceptsBatch({ concepts }) {
  if (!Array.isArray(concepts)) {
    throw new Error('concepts must be an array of concept specs');
  }
  if (concepts.length === 0) {
    return { concepts: [] };
  }
  if (concepts.length > 50) {
    throw new Error(
      `Too many concepts: ${concepts.length}. Max 50 per call — split into multiple add_concepts batches.`
    );
  }
  // Detect duplicate slugs within the input up front, so the second row does not
  // fail with the confusing "already exists". Only the first row for a slug is
  // attempted; later rows with the same slug fail at the input stage.
  const seenInBatch = new Map();
  // Rows already landed in this batch ({slug, frontmatter}) — the in-memory
  // comparison target that catches a later row as a near-duplicate (zero vault loads).
  const landed = [];
  const results = concepts.map((spec, index) => {
    let slug = '';
    try {
      requirePlainObject(spec, `concepts[${index}]`);
      slug = typeof spec.slug === 'string' ? spec.slug : '';
      requireAllowedObjectKeys(spec, `concepts[${index}]`, [
        'slug',
        'kind',
        'title',
        'domain',
        'capabilities',
        'elements',
        'path',
        'body',
        // Per-locale display names — same contract as single add_concept (2026-07-24).
        'labels',
      ]);
      if (slug && seenInBatch.has(slug)) {
        const firstSeenAt = `concepts[${seenInBatch.get(slug)}]`;
        return {
          slug,
          ok: false,
          error: `concepts[${index}] duplicate slug in input batch; first seen at ${firstSeenAt}`,
          errorCode: 'conflict',
          rowName: `concepts[${index}]`,
          conflictSubject: 'Duplicate slug in input batch',
          conflictSlug: slug,
          firstSeenAt,
        };
      }
      if (slug) seenInBatch.set(slug, index);
      const result = addConcept(spec, { includePostWriteMaintenance: false });
      // When a node already landed in this batch has the same normalised title,
      // warn (advisory — it may be legitimate). This blocks bootstrap's #1 failure
      // mode (splitting one concept into two nodes) by in-batch comparison, with no
      // vault load, reusing the same helper as single add_concept's dup check.
      if (result.ok) {
        const dupWarning = detectDuplicateTitle(spec.title, result.slug ?? slug, landed);
        if (dupWarning) result.warnings = [...(result.warnings ?? []), dupWarning];
        landed.push({
          slug: result.slug ?? slug,
          frontmatter: { title: spec.title, kind: spec.kind },
        });
      }
      return result;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      return {
        slug: slug || String(slug),
        ok: false,
        error: msg,
        ...structuredRowErrorDetails(err, msg),
      };
    }
  });
  return {
    concepts: results,
    postWriteMaintenance: results.some((row) => row.ok && row.changed !== false)
      ? compactPostWriteMaintenance()
      : undefined,
  };
}

const RELATION_KEY = {
  depends_on: 'dependencies',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domains: 'domains',
  capabilities: 'capabilities',
  elements: 'elements',
  domain: 'domain',
};
const RELATION_TYPES = WRITE_RELATION_TYPE_VALUES;

function connectionInfoTool() {
  const toolNames = TOOLS_FOR_LIST.map((tool) => tool.name);
  const toolsetHash = createHash('sha256')
    .update(JSON.stringify(TOOLS_FOR_LIST))
    .digest('hex');
  return {
    vaultRoot: VAULT_ROOT,
    repoRoot: REPO_ROOT,
    vaultResolution: VAULT_RESOLUTION,
    repoResolution: REPO_RESOLUTION,
    sameRoot: VAULT_ROOT === REPO_ROOT,
    restartRequiredForRootChange: true,
    server: {
      name: 'ontology-atlas-mcp',
      version: SERVER_VERSION,
      readOnly: READ_ONLY_MODE,
      toolCount: toolNames.length,
      toolNames,
      toolsetHash,
    },
  };
}

function gitStatusTool() {
  return inspectVaultGit({ repoRoot: REPO_ROOT, vaultRoot: VAULT_ROOT });
}

function gitHistoryTool({ limit = 20 } = {}) {
  requireOptionalPositiveInteger(limit, 'limit', { max: 100 });
  return inspectVaultGitHistory({
    repoRoot: REPO_ROOT,
    vaultRoot: VAULT_ROOT,
    limit,
  });
}

function gitSnapshotTool({ confirm = false, expectedHead, message } = {}) {
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonBlankString(expectedHead, 'expectedHead');
  requireOptionalNonBlankString(message, 'message');
  if (message !== undefined && (message.length > 200 || /[\r\n]/.test(message))) {
    throw new Error('message must be one line and at most 200 characters.');
  }

  const report = validateVaultTool();
  const validation = {
    scanned: report.scanned,
    problemFiles: report.summary.problemFiles,
    errorFiles: report.summary.errorFiles,
    warningFiles: report.summary.warningFiles,
    pathDrifts: report.pathDrift.drifts.length,
  };
  if (confirm && validation.errorFiles > 0) {
    throw new Error(
      `git_snapshot blocked: validate_vault found ${validation.errorFiles} file(s) with errors. Repair them and run a new dry-run.`,
    );
  }

  const result = snapshotVaultGit({
    repoRoot: REPO_ROOT,
    vaultRoot: VAULT_ROOT,
    confirm,
    expectedHead,
    message,
  });
  const validationBlocker =
    validation.errorFiles > 0
      ? `validate_vault reports ${validation.errorFiles} file(s) with errors; repair them before confirmation`
      : null;
  const blockedReasons = [
    ...(Array.isArray(result.blockedReasons) ? result.blockedReasons : []),
    ...(validationBlocker ? [validationBlocker] : []),
  ];
  const guardedResult = {
    ...result,
    canConfirm: result.canConfirm === true && !validationBlocker,
    blockedReasons: [...new Set(blockedReasons)],
  };
  if (!result.risk) return { ...guardedResult, validation };

  const validationWarnings = [
    ...(validation.warningFiles > 0
      ? [`validate_vault reports ${validation.warningFiles} warning-only file(s)`]
      : []),
    ...(validation.pathDrifts > 0
      ? [`validate_vault reports ${validation.pathDrifts} code-path drift(s)`]
      : []),
  ];
  return {
    ...guardedResult,
    validation,
    risk: {
      level:
        validation.errorFiles > 0
          ? 'high'
          : validationWarnings.length > 0 && result.risk.level === 'low'
            ? 'medium'
            : result.risk.level,
      warnings: [...result.risk.warnings, ...validationWarnings],
    },
  };
}

function addRelation({ from, to, type, why, expected_mtime }, options = {}) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireNonBlankString(type, 'type');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  const key = RELATION_KEY[type];
  if (!key) {
    throw new Error(formatAllowedValueError('type', type, RELATION_TYPES));
  }
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalTo = resolveExistingVaultSlug(to);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'add_relation');
  // Both endpoints are verified to exist in the vault. Without this a dangling
  // reference is silently appended to a frontmatter array when an agent sends a
  // typo or a hallucinated slug; now it surfaces as a clean error. Beyond direct
  // slugs, tail and frontmatter slug aliases are stored as the canonical slug.
  if (!canonicalFrom) {
    throw new Error(missingSlugMessage('Source slug does not exist in vault', from, {
      createHint: true,
    }));
  }
  if (!canonicalTo) {
    throw new Error(missingSlugMessage('Target slug does not exist in vault', to, {
      createHint: true,
    }));
  }
  /*
   * ⚠️ **Both ends of a relation must be nodes** (measured 2026-08-08).
   *
   * The existence check above asks «is there a .md by that name». So it rejected
   * nonexistent slugs correctly but **let a diary memo through** — markdown that
   * is not a node lives in a vault legitimately, by design.
   *
   * The result is a dangling reference written into the graph. It is caught
   * afterwards (compile, maintenance queue), but only after the write, and in
   * between the graph carries a relation the compiler will discard. The write
   * gate saying it first is cheaper.
   */
  assertGraphNodeEndpoint(canonicalFrom, 'Source');
  assertGraphNodeEndpoint(canonicalTo, 'Target');
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (key === 'domain') {
    const existingDomain = doc.frontmatter.domain;
    if (relationRefMatches(existingDomain, canonicalTo)) {
      return { ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type };
    }
    if (typeof existingDomain === 'string' && existingDomain.trim()) {
      throw new Error(`Source slug already has domain "${existingDomain}". Use patch_concept to change it explicitly.`);
    }
    patchFrontmatter(VAULT_ROOT, canonicalFrom, { domain: canonicalTo }, {
      expectedMtime:
        typeof expected_mtime === 'number' ? expected_mtime : undefined,
    });
    return {
      ok: true,
      changed: true,
      from: canonicalFrom,
      to: canonicalTo,
      type,
      key,
      ...(options.includePostWriteMaintenance === false
        ? {}
        : { postWriteMaintenance: compactPostWriteMaintenance() }),
    };
  }
  const existing = relationRefsFor(doc, key);
  if (existing.some((ref) => relationRefMatches(ref, canonicalTo))) {
    return { ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type };
  }
  if (type === 'depends_on' && (typeof why !== 'string' || !why.trim())) {
    throw new Error(
      'why is required and must be nonblank for a new depends_on relation. ' +
      'Explain the stable semantic dependency after explicit human approval.',
    );
  }
  const next = normalizeRelationRefs([...existing, canonicalTo]);
  // Relation plus rationale (`why`) in a single frontmatter write: written
  // separately, a failure between them leaves a relation with no reason or a
  // reason with no relation.
  const patch = relationKeyPatch(doc, key, next);
  if (typeof why === 'string' && why.trim()) {
    const notes = { ...(doc.frontmatter.relation_notes && typeof doc.frontmatter.relation_notes === 'object' ? doc.frontmatter.relation_notes : {}) };
    notes[canonicalTo] = why.trim();
    patch.relation_notes = notes;
  }
  patchFrontmatter(VAULT_ROOT, canonicalFrom, patch, {
    expectedMtime:
      typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    changed: true,
    from: canonicalFrom,
    to: canonicalTo,
    type,
    key,
    ...(options.includePostWriteMaintenance === false
      ? {}
      : { postWriteMaintenance: compactPostWriteMaintenance() }),
  };
}

function relationRefMatches(storedRef, canonicalTo) {
  if (typeof storedRef !== 'string') return false;
  const candidate = storedRef.trim();
  if (!candidate) return false;
  if (candidate === canonicalTo) return true;
  return resolveExistingVaultSlug(candidate) === canonicalTo;
}

/*
 * `depends_on:` is a legal authoring alias for `dependencies:` — the read layer
 * (collectNeighborRefs, the compiler) canonicalizes it, so the write layer must
 * see the same edges. Reading only the literal canonical key made an aliased
 * edge visible to get_concept's outgoingEdges yet "nonexistent" to
 * add/remove/replace_relation, which could then append a duplicate under a
 * second key or refuse to remove an edge the graph plainly renders.
 */
function aliasKeysFor(canonicalKey) {
  return Object.keys(NEIGHBOR_KEY_ALIASES)
    .filter((alias) => NEIGHBOR_KEY_ALIASES[alias] === canonicalKey);
}

function relationRefsFor(doc, canonicalKey) {
  const refs = [];
  for (const key of [canonicalKey, ...aliasKeysFor(canonicalKey)]) {
    const value = doc.frontmatter[key];
    if (Array.isArray(value)) refs.push(...value);
  }
  return refs;
}

/*
 * A write to a relation key consolidates its alias spellings into the canonical
 * key in the same patch: the alias arrays fold into `nextRefs` and are deleted,
 * so one edit never leaves the same edge type split across two frontmatter keys.
 */
function relationKeyPatch(doc, canonicalKey, nextRefs) {
  const patch = { [canonicalKey]: nextRefs };
  for (const alias of aliasKeysFor(canonicalKey)) {
    if (doc.frontmatter[alias] !== undefined) patch[alias] = null;
  }
  return patch;
}

function relationExists(doc, key, canonicalTo) {
  if (key === 'domain') return relationRefMatches(doc.frontmatter.domain, canonicalTo);
  return relationRefsFor(doc, key).some((ref) => relationRefMatches(ref, canonicalTo));
}

function matchingRelationNoteKeys(notes, canonicalTo) {
  return Object.keys(notes).filter((ref) => relationRefMatches(ref, canonicalTo));
}

function destructivePreviewState({ dryRun, wouldChange, blockedReasons = [] }) {
  const reasons = [...new Set(blockedReasons.filter((reason) => typeof reason === 'string' && reason.trim()))];
  return {
    previewReady: dryRun,
    canConfirm: dryRun && wouldChange && reasons.length === 0,
    wouldChange: dryRun && wouldChange,
    blockedReasons: reasons,
  };
}

function removeRelation({ from, to, type, confirm = false, expected_mtime }) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireNonBlankString(type, 'type');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  const key = RELATION_KEY[type];
  if (!key) throw new Error(formatAllowedValueError('type', type, RELATION_TYPES));
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalTo = resolveExistingVaultSlug(to);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'remove_relation');
  if (!canonicalFrom) throw new Error(missingSlugMessage('Source slug does not exist in vault', from));
  if (!canonicalTo) throw new Error(missingSlugMessage('Target slug does not exist in vault', to));
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (typeof expected_mtime === 'number' && doc.mtime !== expected_mtime) {
    throw new VaultConflictError(canonicalFrom, expected_mtime, doc.mtime);
  }
  const exists = relationExists(doc, key, canonicalTo);
  const notes = doc.frontmatter.relation_notes && typeof doc.frontmatter.relation_notes === 'object'
    ? { ...doc.frontmatter.relation_notes }
    : {};
  const matchingNoteKeys = matchingRelationNoteKeys(notes, canonicalTo);
  const removedRationale = matchingNoteKeys
    .map((key) => notes[key])
    .find((value) => typeof value === 'string');
  const dryRun = !confirm;
  const base = {
    ok: exists,
    dryRun,
    changed: false,
    ...destructivePreviewState({
      dryRun,
      wouldChange: exists,
      blockedReasons: exists ? [] : ['relation does not exist; confirmation would be a no-op'],
    }),
    exists,
    from: canonicalFrom,
    to: canonicalTo,
    type,
    key,
    ...(removedRationale ? { removedRationale } : {}),
  };
  if (!exists || !confirm) return base;
  const patch = key === 'domain'
    ? { domain: null }
    : relationKeyPatch(
        doc,
        key,
        relationRefsFor(doc, key).filter((ref) => !relationRefMatches(ref, canonicalTo)),
      );
  for (const noteKey of matchingNoteKeys) delete notes[noteKey];
  patch.relation_notes = Object.keys(notes).length > 0 ? notes : null;
  patchFrontmatter(VAULT_ROOT, canonicalFrom, patch, { expectedMtime: expected_mtime });
  return { ...base, ok: true, dryRun: false, changed: true, postWriteMaintenance: compactPostWriteMaintenance() };
}

function replaceRelation({ from, oldTo, oldType, newTo, newType, why, confirm = false, expected_mtime }) {
  for (const [value, name] of [[from, 'from'], [oldTo, 'oldTo'], [oldType, 'oldType'], [newTo, 'newTo'], [newType, 'newType']]) requireNonBlankString(value, name);
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  const oldKey = RELATION_KEY[oldType];
  const newKey = RELATION_KEY[newType];
  if (!oldKey) throw new Error(formatAllowedValueError('oldType', oldType, RELATION_TYPES));
  if (!newKey) throw new Error(formatAllowedValueError('newType', newType, RELATION_TYPES));
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalOldTo = resolveExistingVaultSlug(oldTo);
  const canonicalNewTo = resolveExistingVaultSlug(newTo);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'replace_relation');
  if (!canonicalFrom) throw new Error(missingSlugMessage('Source slug does not exist in vault', from));
  if (!canonicalOldTo) throw new Error(missingSlugMessage('Old target slug does not exist in vault', oldTo));
  if (!canonicalNewTo) throw new Error(missingSlugMessage('New target slug does not exist in vault', newTo));
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (typeof expected_mtime === 'number' && doc.mtime !== expected_mtime) throw new VaultConflictError(canonicalFrom, expected_mtime, doc.mtime);
  if (!relationExists(doc, oldKey, canonicalOldTo)) throw new Error(`Relation does not exist: ${canonicalFrom} --${oldType}--> ${canonicalOldTo}.`);
  const oldRelation = { to: canonicalOldTo, type: oldType, key: oldKey };
  const newRelation = { to: canonicalNewTo, type: newType, key: newKey };
  // Rationale resolution happens before the dry-run return so the "every new
  // depends_on carries a why" contract (schema.mjs) holds here too — converting
  // an edge to depends_on used to slip through with no why and no prior note to
  // inherit (bug sweep 2026-09-01).
  const notes = doc.frontmatter.relation_notes && typeof doc.frontmatter.relation_notes === 'object' ? { ...doc.frontmatter.relation_notes } : {};
  const oldNoteKeys = matchingRelationNoteKeys(notes, canonicalOldTo);
  const priorWhy = oldNoteKeys
    .map((key) => notes[key])
    .find((value) => typeof value === 'string');
  const nextWhy = typeof why === 'string' && why.trim() ? why.trim() : priorWhy;
  if (newType === 'depends_on' && !nextWhy) {
    throw new Error(
      'why is required and must be nonblank when converting a relation to depends_on ' +
        `(${canonicalFrom} --${oldType}--> ${canonicalOldTo} carries no relation note to inherit). ` +
        'One sentence: why does the source depend on the target?',
    );
  }
  const dryRun = !confirm;
  const base = {
    ok: false,
    dryRun,
    changed: false,
    ...destructivePreviewState({ dryRun, wouldChange: true }),
    from: canonicalFrom,
    oldRelation,
    newRelation,
  };
  if (!confirm) return base;
  const patch = {};
  if (oldKey === 'domain') patch.domain = null;
  else {
    Object.assign(patch, relationKeyPatch(
      doc,
      oldKey,
      relationRefsFor(doc, oldKey).filter((ref) => !relationRefMatches(ref, canonicalOldTo)),
    ));
  }
  if (newKey === 'domain') patch.domain = canonicalNewTo;
  else {
    const starting = oldKey === newKey ? patch[newKey] : relationRefsFor(doc, newKey);
    Object.assign(patch, relationKeyPatch(doc, newKey, normalizeRelationRefs([...starting, canonicalNewTo])));
  }
  for (const noteKey of oldNoteKeys) delete notes[noteKey];
  if (nextWhy) notes[canonicalNewTo] = nextWhy;
  patch.relation_notes = Object.keys(notes).length > 0 ? notes : null;
  patchFrontmatter(VAULT_ROOT, canonicalFrom, patch, { expectedMtime: expected_mtime });
  return { ...base, ok: true, dryRun: false, changed: true, postWriteMaintenance: compactPostWriteMaintenance() };
}

/**
 * Checks that the endpoints of a relation **write** are graph nodes.
 *
 * The read tools (`get_concept`, `find_neighbors`) legitimately handle documents
 * that are not nodes, so `resolveExistingVaultSlug` itself stays permissive —
 * only the write path narrows. A rejection follows this repository's refusal
 * grammar: **why it cannot happen, and where to go instead.**
 */
function assertGraphNodeEndpoint(canonicalSlug, role) {
  const doc = loadVaultDocs(VAULT_ROOT).find((d) => d.slug === canonicalSlug);
  const kind = doc?.frontmatter?.kind;
  if (typeof kind === 'string' && kind.trim() !== '') return;
  throw new Error(
    `${role} "${canonicalSlug}" is not a graph node — it has no \`kind:\`, so a relation to it would be a ` +
      'dangling reference the compiler drops. Ordinary markdown (meeting notes, memos, drafts) lives in the ' +
      'same folder by design. To make it a node, add a `kind:` with patch_concept, or use absorb_document to ' +
      'turn its content into typed nodes.',
  );
}

function resolveExistingVaultSlug(slug, docs = null) {
  if (typeof slug !== 'string' || slug.trim() === '') return null;
  // Canonicalize letter case to the on-disk spelling before returning. On macOS
  // and Windows `existsSync` accepts a wrong-case slug, but every backlink and
  // relation match downstream is a case-sensitive string comparison — returning
  // the caller's spelling here made writes target refs that no document uses.
  const canonicalCase = canonicalDiskSlug(VAULT_ROOT, slug);
  if (canonicalCase) return canonicalCase;
  const vaultDocs = docs ?? loadVaultDocs(VAULT_ROOT);
  const tailMatches = [];
  const frontmatterMatches = [];
  for (const doc of vaultDocs) {
    const tail = doc.slug.split('/').pop();
    if (tail === slug) tailMatches.push(doc.slug);
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() === slug) {
      frontmatterMatches.push(doc.slug);
    }
  }
  if (frontmatterMatches.length > 1) {
    throw new Error(
      `Ambiguous frontmatter slug alias "${slug}" matches: ${frontmatterMatches.join(', ')}. Use an exact vault-relative slug.`
    );
  }
  if (frontmatterMatches.length === 1) return frontmatterMatches[0];
  if (tailMatches.length > 1) {
    throw new Error(
      `Ambiguous tail slug alias "${slug}" matches: ${tailMatches.join(', ')}. Use an exact vault-relative slug.`
    );
  }
  if (tailMatches.length === 1) return tailMatches[0];
  return null;
}

function resolveExistingVaultUid(uid, docs = null) {
  if (typeof uid !== 'string' || uid.trim() === '') return null;
  const vaultDocs = docs ?? loadVaultDocs(VAULT_ROOT);
  const primaryMatches = vaultDocs.filter((doc) => doc.frontmatter.uid === uid);
  if (primaryMatches.length > 1) {
    throw new Error(
      `Ambiguous permanent uid "${uid}" matches: ${primaryMatches.map((doc) => doc.slug).join(', ')}. Run validate_vault and repair duplicate-uid errors before reading by uid.`,
    );
  }
  if (primaryMatches.length === 1) return primaryMatches[0].slug;

  const mergedMatches = vaultDocs.filter(
    (doc) => Array.isArray(doc.frontmatter.merged_uids) && doc.frontmatter.merged_uids.includes(uid),
  );
  if (mergedMatches.length > 1) {
    throw new Error(
      `Ambiguous merged uid "${uid}" matches: ${mergedMatches.map((doc) => doc.slug).join(', ')}. Run validate_vault and repair merged uid ownership before reading by uid.`,
    );
  }
  return mergedMatches[0]?.slug ?? null;
}

// Batch variant of add_relation, for landing relations whose meaning was already
// reviewed and approved. Rows are dispatched serially through addRelation, so the
// same `from` slug can appear in several rows and readDoc re-reads from disk each
// time, accumulating without loss (but passing expected_mtime alongside makes
// every row after the first stale and fail — the tool description says so). Input
// order preserved, partial results, no atomic rollback.
function addRelationsBatch({ relations }) {
  if (!Array.isArray(relations)) {
    throw new Error('relations must be an array of relation specs');
  }
  if (relations.length === 0) {
    return { relations: [] };
  }
  if (relations.length > 50) {
    throw new Error(
      `Too many relations: ${relations.length}. Max 50 per call — split into multiple add_relations batches.`
    );
  }
  const results = relations.map((spec, index) => {
    let from = '';
    let to = '';
    let type = '';
    try {
      requirePlainObject(spec, `relations[${index}]`);
      from = typeof spec.from === 'string' ? spec.from : '';
      to = typeof spec.to === 'string' ? spec.to : '';
      type = typeof spec.type === 'string' ? spec.type : '';
      requireAllowedObjectKeys(spec, `relations[${index}]`, [
        'from',
        'to',
        'type',
        'why',
        'expected_mtime',
      ]);
      return addRelation(spec, { includePostWriteMaintenance: false });
    } catch (err) {
      const rawMessage = err && err.message ? err.message : String(err);
      const rowLabel = `relations[${index}]`;
      const msg = rawMessage.includes(rowLabel) ? rawMessage : `${rowLabel} ${rawMessage}`;
      return {
        ok: false,
        from,
        to,
        type,
        error: msg,
        ...structuredRowErrorDetails(err, rawMessage),
      };
    }
  });
  return {
    relations: results,
    postWriteMaintenance: results.some((row) => row.ok && row.changed !== false)
      ? compactPostWriteMaintenance()
      : undefined,
  };
}

function patchConcept({ slug, frontmatter, body, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (frontmatter === undefined && body === undefined) {
    throw new Error('At least one of `frontmatter` or `body` is required.');
  }
  requireOptionalPlainObject(frontmatter, 'frontmatter');
  requireValidFrontmatterPatch(frontmatter);
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // A patch that includes `title` forces a non-empty string. The UI's
  // renameVaultDoc rejects blanks; leaving MCP open lets an agent's slip create an
  // untitled node and drift the ontology. `null` is separate — it means "delete
  // the key" — and deleting `title` itself breaks the frontmatter.
  if (frontmatter !== undefined && Object.prototype.hasOwnProperty.call(frontmatter, 'title')) {
    const t = frontmatter.title;
    if (t === null) {
      throw new Error('title cannot be deleted from a vault node — pass a new non-empty string instead.');
    }
    if (!isValidVaultTitle(t)) {
      throw new Error('title must be a non-empty string.');
    }
  }
  requireNodeNotReservedForHuman(readDocIfPresent(slug), 'patch_concept');
  const { filePath, mintedUid } = updateDoc(VAULT_ROOT, slug, {
    frontmatter,
    body,
    expectedMtime: typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    slug,
    filePath,
    changed: true,
    // If this write gave identity to a hand-authored node (one created in an
    // editor with no `uid:`), say so. Identity appearing is an event a person
    // should know about; passing over it silently leaves nobody able to explain
    // why it was needed next time.
    ...(mintedUid
      ? {
          mintedUid,
          notice:
            `This node had no \`uid:\` (hand-written in an editor), which stops the whole vault from compiling. ` +
            `This write minted ${mintedUid} for it. Tell the human — the node now has a permanent identity.`,
        }
      : {}),
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function findBacklinksTool({ slug }) {
  requireNonBlankString(slug, 'slug');
  const matches = findBacklinks(VAULT_ROOT, slug);
  return { target: slug, total: matches.length, matches };
}

function findNeighborsTool({ slug, direction = 'both', types, includeNodes = true, limit = 100 }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalDirection(direction, 'direction', ['outgoing', 'incoming', 'both']);
  requireOptionalRelationTypeArray(types, 'types');
  requireOptionalBoolean(includeNodes, 'includeNodes');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const docs = loadVaultDocs(VAULT_ROOT);
  const center = resolveExistingVaultSlug(slug, docs);
  if (!center) {
    throw new Error(`Doc not found: ${slug}`);
  }
  const docBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const centerDoc = docBySlug.get(center);
  const typeSet = Array.isArray(types) && types.length > 0
    ? new Set(types.map(normalizeGraphRelationKey).filter(Boolean))
    : null;
  const edgeLimit = limit;
  const edges = [];
  const seen = new Set();
  const pushEdge = (edge) => {
    if (typeSet && !typeSet.has(edge.via)) return;
    const key = `${edge.direction}\0${edge.from}\0${edge.to}\0${edge.via}\0${edge.ref || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  if (direction === 'outgoing' || direction === 'both') {
    for (const { key, ref } of collectNeighborRefs(centerDoc)) {
      const resolved = resolveGraphRef(ref, docs);
      pushEdge({
        direction: 'outgoing',
        from: center,
        to: resolved.slug || ref,
        via: key,
        ref,
        resolved: Boolean(resolved.slug),
        ...(resolved.error ? { unresolvedReason: resolved.error } : {}),
      });
    }
  }

  if (direction === 'incoming' || direction === 'both') {
    for (const doc of docs) {
      if (doc.slug === center) continue;
      for (const { key, ref } of collectNeighborRefs(doc)) {
        const resolved = resolveGraphRef(ref, docs);
        if (resolved.slug !== center) continue;
        pushEdge({
          direction: 'incoming',
          from: doc.slug,
          to: center,
          via: key,
          ref,
          resolved: true,
        });
      }
    }
  }

  edges.sort((a, b) =>
    `${a.direction}:${a.via}:${a.from}:${a.to}`.localeCompare(
      `${b.direction}:${b.via}:${b.from}:${b.to}`,
    )
  );
  const limitedEdges = edges.slice(0, edgeLimit);
  const neighborSlugs = new Set();
  for (const edge of limitedEdges) {
    if (edge.resolved && edge.from !== center) neighborSlugs.add(edge.from);
    if (edge.resolved && edge.to !== center) neighborSlugs.add(edge.to);
  }

  return {
    center,
    requested: slug,
    direction,
    types: typeSet ? [...typeSet].sort() : undefined,
    totalEdges: edges.length,
    limited: edges.length > limitedEdges.length,
    edges: limitedEdges,
    nodes:
      includeNodes === false
        ? undefined
        : [...neighborSlugs].sort().map((neighborSlug) => summarizeDoc(docBySlug.get(neighborSlug))),
  };
}

function normalizeGraphRelationKey(type) {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed) return null;
  return RELATION_KEY[trimmed] || trimmed;
}

function summarizeDoc(doc) {
  return {
    uid: doc.frontmatter.uid,
    slug: doc.slug,
    kind: doc.frontmatter.kind,
    title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
    domain: doc.frontmatter.domain,
    mtime: doc.mtime,
  };
}

function resolveGraphRef(ref, docs) {
  try {
    return { slug: resolveExistingVaultSlug(ref, docs) };
  } catch (err) {
    return { slug: null, error: err && err.message ? err.message : String(err) };
  }
}

function findPathTool({ from, to, maxHops }) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireOptionalNonNegativeInteger(maxHops, 'maxHops', { max: 20 });
  const result = findPath(VAULT_ROOT, from, to, maxHops ?? 5);
  if (!result) {
    // A zero-path answer is an unanswered question. Check first whether both
    // endpoints actually exist in the vault, so "the endpoint itself is missing"
    // (suggest add_concept) is distinguished from "both exist but no path"
    // (suggest add_relation).
    const docs = loadVaultDocs(VAULT_ROOT);
    const fromExists = Boolean(resolveGraphRef(from, docs).slug);
    const toExists = Boolean(resolveGraphRef(to, docs).slug);
    return {
      from,
      to,
      found: false,
      reason: 'no path found (or maxHops exceeded)',
      growthHint: buildFindPathGrowthHint({ from, to, fromExists, toExists }),
    };
  }
  const docs = loadVaultDocs(VAULT_ROOT);
  const docsBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const nodes = result.hops.map((slug) => summarizePathNode(docsBySlug.get(slug), slug));
  return { ...result, nodes, found: true, hopCount: result.hops.length - 1 };
}

function summarizePathNode(doc, slug) {
  if (!doc) {
    return { slug, kind: 'unknown', title: slug };
  }
  const frontmatter = doc.frontmatter || {};
  const summary = {
    uid: frontmatter.uid,
    slug: doc.slug || slug,
    kind: String(frontmatter.kind || 'document'),
    title: String(frontmatter.title || frontmatter.name || doc.slug || slug),
  };
  if (typeof frontmatter.domain === 'string') {
    summary.domain = frontmatter.domain;
  }
  return summary;
}

function listKindsTool() {
  return listKinds(VAULT_ROOT);
}

function findOrphansTool({ kind, excludeKinds } = {}) {
  requireOptionalNonBlankString(kind, 'kind');
  requireOptionalEnum(kind, 'kind', NODE_KIND_VALUES);
  requireOptionalNodeKindArray(excludeKinds, 'excludeKinds');
  return findOrphans(VAULT_ROOT, {
    kind: typeof kind === 'string' ? kind : undefined,
    excludeKinds: Array.isArray(excludeKinds) ? excludeKinds : undefined,
  });
}

function queryConceptsTool({ filter, limit }) {
  requireNonBlankString(filter, 'filter');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const parsed = parseFilter(filter);
  const cap = limit ?? 100;
  const docs = loadVaultDocs(VAULT_ROOT).filter((d) => Boolean(d.frontmatter?.kind));
  const matches = [];
  let total = 0;
  for (const doc of docs) {
    if (!parsed.match(doc)) continue;
    total += 1;
    if (matches.length < cap) {
      matches.push({
        uid: doc.frontmatter.uid,
        slug: doc.slug,
        kind: doc.frontmatter.kind,
        title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
        domain: doc.frontmatter.domain,
        capabilities: doc.frontmatter.capabilities,
        elements: doc.frontmatter.elements,
        // Same shape as list_concepts / find_backlinks / find_orphans, so an agent
        // can sort or filter query results by staleness with no follow-up call.
        mtime: doc.mtime,
      });
    }
  }
  const result = {
    filter,
    parsedAs: parsed.repr,
    total,
    matches,
    limited: total > matches.length,
  };
  // Zero rows is an unanswered question. Check the real vault inventory
  // (byKind/byDomain) for whether the filter aimed at a kind or domain that does
  // not exist.
  if (total === 0) {
    const byKind = {};
    const byDomain = {};
    for (const doc of docs) {
      const kind = doc.frontmatter?.kind;
      if (kind) byKind[kind] = (byKind[kind] ?? 0) + 1;
      const domain = doc.frontmatter?.domain;
      if (typeof domain === 'string' && domain) byDomain[domain] = (byDomain[domain] ?? 0) + 1;
    }
    result.growthHint = buildQueryConceptsZeroRowsGrowthHint({ filter, byKind, byDomain });
  }
  return result;
}

function compileOntologyTool({
  includeIndexes,
  summary,
  nodesLimit,
  nodesOffset,
  edgesLimit,
  edgesOffset,
} = {}) {
  requireOptionalBoolean(includeIndexes, 'includeIndexes');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalPositiveInteger(nodesLimit, 'nodesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(nodesOffset, 'nodesOffset');
  requireOptionalPositiveInteger(edgesLimit, 'edgesLimit', { max: 500 });
  requireOptionalNonNegativeInteger(edgesOffset, 'edgesOffset');
  const artifact = compileOntology(loadVaultDocs(VAULT_ROOT), {
    includeIndexes: includeIndexes === true,
    summary: summary === true,
    nodesLimit: typeof nodesLimit === 'number' ? nodesLimit : undefined,
    nodesOffset: typeof nodesOffset === 'number' ? nodesOffset : undefined,
    edgesLimit: typeof edgesLimit === 'number' ? edgesLimit : undefined,
    edgesOffset: typeof edgesOffset === 'number' ? edgesOffset : undefined,
  });
  // Summary mode — the artifact is itself the count/aggregate, so the wrapper's
  // extra summary stats would duplicate it. Returned as-is.
  if (summary === true) return artifact;
  return {
    ...artifact,
    summary: {
      nodes: artifact.nodeCount,
      edges: artifact.edgeCount,
      graphHash: artifact.graphHash,
      maxMtime: artifact.maxMtime,
      resolvedEdges: artifact.resolvedEdgeCount,
      externalEdges: artifact.externalEdgeCount,
      unresolvedEdges: artifact.unresolvedEdgeCount,
      aliases: artifact.aliases.length,
      ambiguousAliases: artifact.ambiguousAliases.length,
      issues: artifact.issues.length,
    },
  };
}

function resolveAgentBriefProject(artifact, requestedProject) {
  if (typeof requestedProject === 'string' && requestedProject.trim()) {
    return queryCompiledOntology(artifact, {
      operation: 'project_scope',
      project: requestedProject,
      limit: 1,
    }).project;
  }
  const projects = (Array.isArray(artifact?.nodes) ? artifact.nodes : [])
    .filter((node) => node?.kind === 'project' && typeof node.slug === 'string')
    .map((node) => node.slug)
    .sort((left, right) => left.localeCompare(right));
  if (projects.length === 1) return projects[0];
  if (projects.length === 0) return null;
  throw new Error(
    `project is required when the vault contains multiple project nodes. Choose one of: ${projects.join(', ')}.`,
  );
}

function completeAgentBriefProjectScope(artifact, projectSlug) {
  const nodes = Array.isArray(artifact?.nodes) ? artifact.nodes : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const included = new Set([projectSlug]);
  const queue = [projectSlug];
  const downward = new Set(['domains', 'capabilities', 'elements', 'contains']);
  const childrenByParent = new Map();
  const appendChild = (parent, child) => {
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(child);
  };
  for (const edge of edges) {
    if (edge?.resolved !== true) continue;
    if (downward.has(edge.via)) appendChild(edge.from, edge.to);
    if (edge.via === 'domain') appendChild(edge.to, edge.from);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const child of childrenByParent.get(current) ?? []) {
      if (included.has(child) || !nodeBySlug.has(child)) continue;
      included.add(child);
      queue.push(child);
    }
  }
  const rows = [...included]
    .map((slug) => nodeBySlug.get(slug))
    .filter(Boolean)
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const docs = loadVaultDocs(VAULT_ROOT).filter((doc) => included.has(doc.slug));
  if (rows.length !== included.size || docs.length !== included.size) {
    throw new Error(
      `agent_brief blocked: selected project "${projectSlug}" contains a compiled node without one readable vault document. Run validate_vault and repair the missing document before using the handoff.`,
    );
  }
  const internalEdges = edges.filter((edge) => (
    edge?.resolved === true && included.has(edge.from) && included.has(edge.to)
  )).length;
  return {
    scope: {
      operation: 'project_scope',
      project: projectSlug,
      nodes: {
        total: rows.length,
        limited: false,
        rows: rows.map((node) => ({
          uid: node.uid,
          slug: node.slug,
          kind: node.kind,
          title: node.title,
          domain: node.domain,
          inDegree: node.inDegree ?? 0,
          outDegree: node.outDegree ?? 0,
        })),
      },
      summary: { nodes: rows.length, internalEdges },
    },
    docs,
    graphHash: buildProjectSourceGraphHash(projectSlug, docs),
  };
}

function scopedAgentBriefInput(artifact, args, ontologyAtlasIgnorePatterns) {
  const projectSlug = resolveAgentBriefProject(artifact, args.project);
  if (projectSlug === null) {
    if (args.detail === 'compact') {
      throw new Error('agent_brief detail "compact" requires one selected kind: project node; this vault has none.');
    }
    const engineArgs = { ...args };
    delete engineArgs.detail;
    delete engineArgs.task;
    return {
      projectSlug: null,
      scope: null,
      scopedArtifact: artifact,
      result: queryCompiledOntology(artifact, engineArgs, { ontologyAtlasIgnorePatterns }),
    };
  }
  const scope = completeAgentBriefProjectScope(artifact, projectSlug);
  const scopedArtifact = compileOntology(scope.docs, { includeIndexes: true });
  const engineArgs = { ...args, project: projectSlug };
  delete engineArgs.detail;
  delete engineArgs.task;
  const result = queryCompiledOntology(scopedArtifact, engineArgs, {
    ontologyAtlasIgnorePatterns,
    sourceDocs: scope.docs,
  });
  return { projectSlug, scope, scopedArtifact, result };
}

function privateCurrentProjectSourceAccess(projectSlug, projectSource, graphHash, viewOptions = {}) {
  const receiptCurrent = projectSource?.status === 'verified_current'
    && projectSource?.currentness === 'current';
  // A receipt behind the source still opens the bound root when the live
  // probe confirms every recorded witness resolves: coordinates are then
  // verified against the live files, and the response says which revision.
  const liveSupported = !receiptCurrent
    && ['source_changed', 'ontology_changed'].includes(projectSource?.topGap?.id)
    && projectSource?.live?.status === 'witnesses_supported'
    && typeof projectSource?.live?.sourceFingerprint === 'string';
  if ((!receiptCurrent && !liveSupported) || typeof projectSource?.receipt?.sourceId !== 'string') return null;
  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  if (sidecar.status !== 'ok') return null;
  const matches = sidecar.bindings.filter((binding) => (
    binding?.projectSlug === projectSlug
    && binding?.sourceId === projectSource.receipt.sourceId
    && typeof binding?.rootPath === 'string'
    && binding.rootPath.trim()
  ));
  if (matches.length !== 1) return null;
  return {
    rootPath: matches[0].rootPath,
    mode: liveSupported ? 'live' : 'receipt',
    confirmCurrent() {
      const refreshed = readProjectSourceView(VAULT_ROOT, projectSlug, graphHash, viewOptions);
      if (liveSupported) {
        return refreshed?.live?.status === 'witnesses_supported'
          && refreshed.live.sourceFingerprint === projectSource.live.sourceFingerprint
          && refreshed.live.sourceRevision === projectSource.live.sourceRevision;
      }
      return projectSourceSnapshotUnchanged(projectSource, refreshed);
    },
  };
}

async function queryOntologyTool(args = {}) {
  validateQueryOntologyArgs(args);
  if (args.operation === 'analysis_history') {
    return listAnalysisRecords(VAULT_ROOT, { limit: args.limit ?? 30, cursor: args.analysisCursor ?? null, mode: args.analysisMode ?? null, project: args.project ?? null });
  }
  if (args.operation === 'analysis_record') return readAnalysisRecord(VAULT_ROOT, args.recordId);
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const ontologyAtlasIgnorePatterns = loadOntologyAtlasIgnore(VAULT_ROOT);
  if (args.operation === 'meaning_repair_review') {
    const agentBrief = queryCompiledOntology(artifact, {
      operation: 'agent_brief',
      project: args.project,
    }, { ontologyAtlasIgnorePatterns });
    const validatedBrief = attachVaultValidation(agentBrief, { operation: 'agent_brief' });
    const context = projectMeaningContext(
      artifact,
      validatedBrief.projectSlug,
      validatedBrief.readiness?.status,
    );
    return buildMeaningRepairReviewPage(context.meaningRepairInput, args);
  }
  // `maintenance_plan` is the one read operation that needs Git history: summary
  // freshness compares a node's description against the membership it describes,
  // and a compiled artifact carries neither clock. Computed only for that
  // operation so every other query stays a pure snapshot read.
  const maintenanceFreshness =
    args.operation === 'maintenance_plan' ? buildSummaryFreshness(loadVaultDocs(VAULT_ROOT)) : null;
  const agentBriefInput = args.operation === 'agent_brief'
    ? scopedAgentBriefInput(artifact, args, ontologyAtlasIgnorePatterns)
    : null;
  const queryArtifact = agentBriefInput?.scopedArtifact ?? artifact;
  const queryResult = agentBriefInput?.result ?? queryCompiledOntology(artifact, args, {
    ontologyAtlasIgnorePatterns,
    ...(args.operation === 'builder_context' ? { sourceDocs: loadVaultDocs(VAULT_ROOT) } : {}),
    ...(maintenanceFreshness?.checked ? { staleSummaries: maintenanceFreshness.stale } : {}),
  });
  const validatedResult = ['health', 'workspace_brief', 'agent_brief'].includes(args.operation)
    ? attachVaultValidation(queryResult, args)
    : queryResult;
  const meaningContext = args.operation === 'agent_brief'
    ? projectMeaningContext(
        artifact,
        validatedResult.projectSlug,
        validatedResult.readiness?.status,
        agentBriefInput?.scope,
      )
    : null;
  const attached = args.operation === 'agent_brief'
    ? attachProjectMeaning(validatedResult, artifact, meaningContext)
    : ['health', 'workspace_brief'].includes(args.operation)
      ? attachMeaningReadiness(validatedResult, artifact, args)
      : validatedResult;
  /*
   * **Count it, do not maintain it** (measured 2026-08-17).
   *
   * Two places attach checks (`attachVaultValidation`, `attachProjectMeaning`) and
   * only the first hand-incremented `healthChecks`. So one response said
   * "7 health checks" while carrying 8.
   *
   * Asking every attachment site to keep a counter in step means the next person
   * forgets again — so count once, at the end, and the whole class disappears.
   * Gate: `cli/src/lib/brief-self-consistency.test.mjs`.
   */
  let result = Array.isArray(attached.health?.checks) && attached.readiness
    ? { ...attached, readiness: { ...attached.readiness, healthChecks: attached.health.checks.length } }
    : attached;
  if (args.operation === 'agent_brief') {
    result = refreshAgentBriefHandoffPrompt(result);
    if (args.detail === 'compact') {
      const sourceAccess = privateCurrentProjectSourceAccess(
        result.projectSlug,
        result.projectSource,
        agentBriefInput.scope.graphHash,
        { currentWitnesses: deriveProjectSourceWitnessesFromDocs({ projectSlug: result.projectSlug, docs: agentBriefInput.scope.docs }) },
      );
      result = buildCompactAgentBrief({
        brief: result,
        artifact: queryArtifact,
        docs: agentBriefInput.scope.docs,
        sourceRoot: sourceAccess?.rootPath ?? null,
        confirmSourceCurrent: sourceAccess?.confirmCurrent ?? null,
        sourceAccessRequired: (result.projectSource?.status === 'verified_current'
          && result.projectSource?.currentness === 'current')
          || result.projectSource?.live?.status === 'witnesses_supported',
        task: args.task,
      });
    }
  }
  if (result?.contract === 'agentBriefCompact:v2') return result;
  return {
    ...result,
    compiledSummary: {
      nodes: queryArtifact.nodeCount,
      edges: queryArtifact.edgeCount,
      graphHash: queryArtifact.graphHash,
      maxMtime: queryArtifact.maxMtime,
      resolvedEdges: queryArtifact.resolvedEdgeCount,
      externalEdges: queryArtifact.externalEdgeCount,
      unresolvedEdges: queryArtifact.unresolvedEdgeCount,
      issues: queryArtifact.issues.length,
    },
  };
}

/**
 * Translates a remedy id into **something the reader can act on**.
 *
 * A bare code like `assessment_input_invalid` used to be the whole message. The
 * reader is a person or an agent, and neither can do anything with a code alone.
 * A vault straight out of `init` in particular received "invalid" here, so
 * someone who had done nothing wrong concluded they had broken something.
 */
// One gap id, two different situations (2026-08-17 (28) named the missing
// receipt `competency_not_authored` in both). When the project document already
// carries a parseable `## Competency answers` section, the only missing thing
// is the finalize receipt, and the instruction must say exactly that: a person
// who wrote all five answers must never be told to write them. The generic
// hint below stays for the case where the section is absent or does not parse.
const MEANING_AUTHORED_NOT_FINALIZED_HINT =
  'This project\'s five competency answers are already written, but this vault '
  + 'has no finalize receipt for them. Nothing is broken. Call '
  + 'finalize_project_meaning to record the receipt.';

const MEANING_NEXT_ACTION_HINTS = Object.freeze({
  // Never assert "the section is missing" — a vault can have the section and
  // simply not have finalised it (this repository is one), and telling that user
  // to "add it" is wrong guidance. The parseable-section case is answered by
  // MEANING_AUTHORED_NOT_FINALIZED_HINT above, so this text covers a section
  // that is absent or does not parse.
  author_competency_answers:
    'This project\'s five competency answers have not been finalized yet. '
    + 'Nothing is broken. Fill in the `## Competency answers` section of the '
    + 'project document if it is missing, then call finalize_project_meaning.',
  resolve_competency_question:
    'A competency answer is incomplete: it needs concrete witnesses (concepts, '
    + 'relations, or evidence paths) that resolve in this vault. Fill the gap in '
    + 'the project document, then call finalize_project_meaning again.',
  reevaluate_competency:
    'The graph moved since the answers were finalized. Re-check the competency '
    + 'answers against the current graph, then call finalize_project_meaning again.',
  repair_assessment_input:
    'The assessment input is malformed. Inspect the project document\'s '
    + '`## Competency answers` section and the source receipt.',
  repair_ontology_structure: 'Fix the graph problems that query_ontology health reports first.',
  repair_source_receipt:
    'The source receipt is unusable. Re-bind the project to its code folder '
    + 'with connect_project_source.',
  record_source_role:
    'A source file is bound but its role (production / test) is unrecorded. '
    + 'Record it so evidence counts mean the same thing everywhere.',
  review_inventory_limit:
    'The source inventory hit its bound, so this evidence is partial. Narrow '
    + 'the bound source folder, or read the limit before trusting the counts.',
  connect_source: 'Bind this project to its source with connect_project_source.',
  repair_source_binding:
    'The source binding is unusable. Re-bind with connect_project_source '
    + '({repair: true} if the sidecar is malformed).',
  repair_source_path:
    'A declared evidence path no longer resolves inside the bound source. Fix '
    + 'the path on the node, or re-bind if the folder moved.',
  measure_source: 'Measure the bound source with connect_project_source.',
  remeasure_source: 'The source changed since it was measured. Re-run connect_project_source.',
  verify_source_currentness:
    'The source measurement is stale or unavailable. Re-run connect_project_source '
    + 'before treating this evidence as current.',
  review_source_evidence:
    'The source moved in a way the receipt cannot judge. Look at what changed '
    + 'before relying on the evidence.',
  use_current_evidence: 'Nothing to repair — the measured evidence is current.',
});

function meaningReadinessCheck(artifact) {
  const projectSlugs = (Array.isArray(artifact?.nodes) ? artifact.nodes : [])
    .filter((node) => node?.kind === 'project' && typeof node.slug === 'string')
    .map((node) => node.slug)
    .sort((left, right) => left.localeCompare(right));
  const assessments = projectSlugs.map((projectSlug) => {
    try {
      // The graph engine's health status includes semantic checks; meaning
      // assessment needs the structural readiness input only. Scope and
      // inventory failures below still fail closed via a null graph hash.
      const context = projectMeaningContext(artifact, projectSlug, 'ready');
      return {
        projectSlug,
        status: context.meaningAssessment?.status ?? 'invalid',
        topGap: context.meaningAssessment?.topGap?.id ?? 'assessment_input_invalid',
        // What the changed source says right now about the recorded witnesses,
        // so "source changed" is not the whole story a person gets.
        ...(context.projectSource?.live
          ? {
              sourceLive: {
                status: context.projectSource.live.status,
                sourceRevision: String(context.projectSource.live.sourceRevision ?? '').slice(0, 12),
                witnessSummary: context.projectSource.live.witnessSummary,
              },
            }
          : {}),
        // The remedy was already computed and was being discarded here
        // (2026-08-17), so the reader — person or agent — got only an error code.
        nextAction: context.meaningAssessment?.nextAction?.id ?? 'repair_assessment_input',
        // Whether the `## Competency answers` section parses. This picks the
        // honest hint when the receipt is missing: written-but-not-finalized
        // gets "call finalize_project_meaning", not "write the answers".
        competencyAuthored: Boolean(context.meaningRepairInput?.competency),
      };
    } catch {
      return {
        projectSlug,
        status: 'invalid',
        topGap: 'assessment_input_invalid',
        nextAction: 'repair_assessment_input',
        competencyAuthored: false,
      };
    }
  });
  const unresolved = assessments.filter((assessment) => assessment.status !== 'verified_current');
  if (unresolved.length === 0) {
    return {
      status: 'pass',
      count: assessments.length,
      message: assessments.length === 0
        ? 'No project meaning assessments are in scope.'
        : `Meaning assessments are current for ${assessments.length} project(s).`,
      assessments,
    };
  }
  const first = unresolved[0];
  const firstHint = first.nextAction === 'author_competency_answers' && first.competencyAuthored
    ? MEANING_AUTHORED_NOT_FINALIZED_HINT
    : MEANING_NEXT_ACTION_HINTS[first.nextAction] ?? `Next: ${first.nextAction}.`;
  const liveNote = first.sourceLive
    ? first.sourceLive.status === 'witnesses_supported'
      ? ` All ${first.sourceLive.witnessSummary?.total ?? 0} recorded witness paths still resolve at ${first.sourceLive.sourceRevision}; the receipt is behind the source, not broken.`
      : first.sourceLive.status === 'witnesses_missing'
        ? ` ${first.sourceLive.witnessSummary?.missing ?? 0} of ${first.sourceLive.witnessSummary?.total ?? 0} recorded witness paths no longer resolve at ${first.sourceLive.sourceRevision}.`
        : ''
    : '';
  return {
    status: 'warn',
    count: unresolved.length,
    // A diagnosis without a remedy leaves the reader with nothing to do — above
    // all when the reader is an agent rather than a person (`workspace-brief`).
    message:
      `${unresolved.length} project meaning assessment(s) require review; `
      + `first ${first.projectSlug}: ${first.status} (${first.topGap}). `
      + `${firstHint}${liveNote}`,
    assessments,
  };
}

function attachMeaningReadiness(result, artifact, args = {}) {
  const meaning = meaningReadinessCheck(artifact);
  if (meaning.status === 'pass') return result;
  const check = {
    id: 'meaning_assessment',
    status: meaning.status,
    count: meaning.count,
    message: meaning.message,
  };
  const action = {
    id: 'meaning_assessment',
    kind: 'meaning_assessment',
    severity: 'warn',
    count: meaning.count,
    message: meaning.message,
  };
  const actionLimit = typeof args.limit === 'number' ? args.limit : result.operation === 'workspace_brief' ? 10 : 5;
  if (result.operation === 'health') {
    return {
      ...result,
      status: 'needs_attention',
      checks: [...(Array.isArray(result.checks) ? result.checks : []), check],
    };
  }
  if (result.operation === 'workspace_brief') {
    return {
      ...result,
      status: 'needs_attention',
      health: {
        ...result.health,
        status: 'needs_attention',
        checks: [...(Array.isArray(result.health?.checks) ? result.health.checks : []), check],
      },
      nextActions: [action, ...(Array.isArray(result.nextActions) ? result.nextActions : [])]
        .slice(0, actionLimit),
    };
  }
  return result;
}

function meaningSourceFromProjectSource(projectSource) {
  const receipt = projectSource?.receipt;
  return {
    status: projectSource?.status,
    currentness: projectSource?.currentness,
    topGapId: projectSource?.topGap?.id ?? null,
    ...(receipt ? {
      receiptContractVersion: receipt.contractVersion,
      graphHash: receipt.graphHash,
      sourceId: receipt.sourceId,
      sourceRevision: receipt.sourceRevision,
      sourceFingerprint: receipt.sourceFingerprint,
      measuredAt: receipt.measuredAt,
    } : {}),
  };
}

/**
 * One project's containment scope, its documents, and its graph hash.
 * Shared by the meaning assessment and the source connect tools so the two can
 * never disagree about what "this project" contains — the hash stamped into a
 * receipt and the witnesses checked against the source must come from the same
 * boundary. A bounded/partial scope yields `graphHash: null`, which every
 * caller treats as fail-closed.
 */
function projectSourceScope(artifact, projectSlug, allDocs = null) {
  let scope = null;
  let docs = [];
  let graphHash = null;
  try {
    scope = queryCompiledOntology(artifact, {
      operation: 'project_scope',
      project: projectSlug,
      limit: 500,
    });
    if (!scope.nodes.limited && scope.nodes.total === scope.nodes.rows.length) {
      const scopedSlugs = new Set(scope.nodes.rows.map((node) => node.slug));
      docs = (allDocs ?? loadVaultDocs(VAULT_ROOT)).filter((doc) => scopedSlugs.has(doc.slug));
      graphHash = buildProjectSourceGraphHash(projectSlug, docs);
    }
  } catch {
    // A partial or invalid scope is represented by the fail-closed assessment.
  }
  return { scope, docs, graphHash };
}

function projectMeaningContext(artifact, projectSlug, structureStatus, scopedProject = null) {
  const { scope, docs, graphHash } = scopedProject ?? projectSourceScope(artifact, projectSlug);
  const projectSource = readProjectSourceView(VAULT_ROOT, projectSlug, graphHash, {
    currentWitnesses: deriveProjectSourceWitnessesFromDocs({ projectSlug, docs }),
  });
  const inventoryResult = buildProjectMeaningInventory({
    projectSlug,
    graphHash,
    projectScope: scope,
    artifactEdges: artifact?.edges,
    scopedDocs: docs,
    projectSource,
  });
  const projectDoc = docs.find((doc) => doc.slug === projectSlug && doc.frontmatter?.kind === 'project') ?? null;
  const assessmentInput = {
    vaultRoot: VAULT_ROOT,
    projectSlug,
    projectBody: projectDoc?.body,
    graphHash,
    structure: { status: structureStatus },
    source: meaningSourceFromProjectSource(projectSource),
    inventory: inventoryResult.status === 'ready' ? inventoryResult.inventory : null,
  };
  const meaningAssessment = readProjectMeaningAssessment(assessmentInput);
  let competency = null;
  try {
    competency = parseProjectCompetencyMarkdown(projectDoc?.body);
  } catch {
    // The repair projection fails closed when the human-editable competency block is unavailable.
  }
  const meaningRepairInput = {
    projectSlug,
    graphHash,
    meaningAssessment,
    competency,
    inventoryResult,
    scopedDocs: docs,
  };
  const meaningRepair = buildMeaningRepair(meaningRepairInput);
  return {
    scope,
    docs,
    graphHash,
    projectDoc,
    projectSource,
    inventoryResult,
    assessmentInput,
    meaningAssessment,
    meaningRepair,
    meaningRepairInput,
  };
}

function attachProjectMeaning(agentBrief, artifact, precomputedContext = null) {
  const context = precomputedContext ?? projectMeaningContext(
    artifact,
    agentBrief.projectSlug,
    agentBrief.readiness?.status,
  );
  const meaningIsCurrent = context.meaningAssessment?.status === 'verified_current';
  const meaningAction = meaningIsCurrent
    ? null
    : {
      id: 'meaning_assessment',
      kind: 'meaning_assessment',
      // An unbuilt/uncalibrated ontology is an actionable review state, not a
      // transport failure. Keep the agent out of the green lane without
      // making first-contact MCP verification impossible on a fresh vault.
      severity: 'warn',
      count: 1,
      target: context.meaningAssessment?.topGap?.id ?? 'assessment_input_invalid',
      message:
        'Meaning evidence is not current and complete; review the assessment before treating structural readiness as ontology readiness.',
    };
  const adjustedBrief = meaningIsCurrent
    ? {
      ...agentBrief,
      projectSource: context.projectSource,
      projectSourceRemedy: projectSourceRemedy(context.projectSource),
      meaningAssessment: context.meaningAssessment,
    }
    : {
      ...agentBrief,
      status: 'needs_attention',
      readiness: {
        ...agentBrief.readiness,
        status: agentBrief.readiness?.status === 'ready'
          ? 'needs_attention'
          : agentBrief.readiness?.status,
        score: Math.min(agentBrief.readiness?.score ?? 0, 75),
      },
      health: {
        ...agentBrief.health,
        status: 'needs_attention',
        checks: [
          ...(Array.isArray(agentBrief.health?.checks) ? agentBrief.health.checks : []),
          {
            id: 'meaning_assessment',
            status: 'warn',
            count: 1,
            message: meaningAction.message,
          },
        ],
      },
      nextActions: [
        meaningAction,
        ...(Array.isArray(agentBrief.nextActions) ? agentBrief.nextActions : []),
      ],
      projectSource: context.projectSource,
      projectSourceRemedy: projectSourceRemedy(context.projectSource),
      meaningAssessment: context.meaningAssessment,
    };
  return attachMeaningRepair({
    ...adjustedBrief,
  }, context.meaningRepair);
}

// ── Project source connect / disconnect ───────────────────────────────────

const PROJECT_SOURCE_CONNECT_CONTRACT = 'projectSourceConnect:v1';
const PROJECT_SOURCE_DISCONNECT_CONTRACT = 'projectSourceDisconnect:v1';

function resolveProjectNodeSlug(projectSlug, allDocs) {
  const canonicalSlug = resolveExistingVaultSlug(projectSlug, allDocs);
  if (!canonicalSlug) {
    throw new Error(
      `Project slug does not exist in vault: "${projectSlug}". Use list_concepts({kind:"project"}) to choose an exact project slug.`,
    );
  }
  const projectDoc = allDocs.find((doc) => doc.slug === canonicalSlug);
  if (projectDoc?.frontmatter?.kind !== 'project') {
    throw new Error(
      `connect_project_source requires a kind: project node; received "${canonicalSlug}".`,
    );
  }
  return canonicalSlug;
}

function connectProjectSourceTool({ projectSlug, rootPath, confirm, repair } = {}) {
  requireOptionalNonBlankString(projectSlug, 'projectSlug');
  requireOptionalNonBlankString(rootPath, 'rootPath');
  if (typeof projectSlug !== 'string') throw new Error('projectSlug is required.');
  if (typeof rootPath === 'string' && !isAbsolute(rootPath)) {
    throw new Error(`rootPath must be an absolute local path; received "${rootPath}".`);
  }

  const allDocs = loadVaultDocs(VAULT_ROOT);
  const canonicalSlug = resolveProjectNodeSlug(projectSlug, allDocs);
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const { docs, graphHash } = projectSourceScope(artifact, canonicalSlug, allDocs);
  if (!graphHash) {
    throw new Error(
      `connect_project_source blocked: the project scope for "${canonicalSlug}" is incomplete, so no receipt could detect later ontology drift. Repair the project containment first (query_ontology({operation:"project_scope", project:"${canonicalSlug}"})).`,
    );
  }
  const witnesses = deriveProjectSourceWitnessesFromDocs({ projectSlug: canonicalSlug, docs });

  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  if (sidecar.status === 'malformed' && repair !== true) {
    throw new Error(
      `connect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is malformed. Inspect it, then re-run with repair: true to discard and rewrite it.`,
    );
  }
  const bound = sidecar.status === 'ok'
    ? sidecar.bindings.filter((binding) => binding.projectSlug === canonicalSlug)
    : [];

  let inference = null;
  let selectedRoot = null;
  let mode = bound.length > 0 ? 'replace' : 'connect';
  if (typeof rootPath === 'string') {
    selectedRoot = rootPath;
  } else if (bound.length === 1) {
    selectedRoot = bound[0].rootPath;
    mode = 'remeasure';
  } else {
    const { vaultRootPath, candidates } = collectProjectSourceCandidates(VAULT_ROOT);
    inference = inferProjectSourceProposal({ vaultRootPath, candidates });
    if (inference.status !== 'proposed') {
      throw new Error(
        'connect_project_source found no enclosing code folder for this vault (no git repository and no project manifest above it). '
        + 'Pass rootPath with the absolute folder that holds the code this ontology describes.',
      );
    }
    selectedRoot = inference.candidate.rootPath;
    inference = { ...inference, candidates };
  }

  let probe;
  try {
    probe = inspectProjectSource(selectedRoot);
  } catch (err) {
    throw new Error(
      `connect_project_source could not measure "${selectedRoot}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const measuredAt = new Date().toISOString();
  const receipt = buildProjectSourceReceipt({
    projectSlug: canonicalSlug,
    graphHash,
    probe,
    witnesses,
    measuredAt,
  });
  if (inference) {
    inference = inferProjectSourceProposal({
      vaultRootPath: VAULT_ROOT,
      candidates: inference.candidates,
      witnessSummary: receipt.witnessSummary,
    });
  }

  const binding = {
    projectSlug: canonicalSlug,
    sourceId: probe.sourceId,
    rootPath: probe.rootPath,
    kind: probe.kind,
    boundAt: measuredAt,
  };
  const bindingView = {
    rootPath: probe.rootPath,
    kind: probe.kind,
    sourceId: probe.sourceId,
    dirty: probe.dirty,
    truncated: probe.truncated,
    inventoryFiles: probe.files.length,
  };

  if (confirm !== true) {
    return {
      ok: true,
      changed: false,
      confirmed: false,
      contract: PROJECT_SOURCE_CONNECT_CONTRACT,
      projectSlug: canonicalSlug,
      mode,
      binding: bindingView,
      inference,
      previewReceipt: receipt,
      previousBindingCount: bound.length,
      nextCall: {
        tool: 'connect_project_source',
        arguments: { projectSlug: canonicalSlug, rootPath: probe.rootPath, confirm: true },
      },
      undo: undoPlan(canonicalSlug),
    };
  }

  const written = writeProjectSourceBinding(VAULT_ROOT, { ...binding, receipt }, { repair: repair === true });
  if (written.status === 'blocked_unsafe_path') {
    throw new Error(
      `connect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path. repair: true cannot bypass a symlink or junction boundary.`,
    );
  }
  if (written.status === 'blocked_malformed') {
    throw new Error(
      `connect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is malformed. Re-run with repair: true to discard and rewrite it.`,
    );
  }
  if (written.status !== 'written') {
    throw new Error(
      `connect_project_source could not persist the binding (${written.status}).`,
    );
  }
  const projectSource = readProjectSourceView(VAULT_ROOT, canonicalSlug, graphHash);
  return {
    ok: true,
    changed: true,
    confirmed: true,
    contract: PROJECT_SOURCE_CONNECT_CONTRACT,
    projectSlug: canonicalSlug,
    mode,
    binding: bindingView,
    inference,
    projectSource,
    remedy: projectSourceRemedy(projectSource),
    previousBindingCount: bound.length,
    undo: undoPlan(canonicalSlug),
  };
}

function disconnectProjectSourceTool({ projectSlug, confirm } = {}) {
  requireOptionalNonBlankString(projectSlug, 'projectSlug');
  if (typeof projectSlug !== 'string') throw new Error('projectSlug is required.');

  const allDocs = loadVaultDocs(VAULT_ROOT);
  // A binding can outlive its project node. Disconnect must still be able to
  // clear it, so an unresolvable slug falls back to the literal value.
  const canonicalSlug = resolveExistingVaultSlug(projectSlug, allDocs) ?? projectSlug;
  const sidecar = readProjectSourceBindings(VAULT_ROOT);
  if (sidecar.status === 'unsafe_path') {
    throw new Error(
      `disconnect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path. Replace the symlink or junction with a real vault-local directory first.`,
    );
  }
  if (sidecar.status === 'malformed') {
    throw new Error(
      `disconnect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is malformed. Inspect it by hand, or re-connect with repair: true to rewrite it.`,
    );
  }
  const bound = sidecar.status === 'ok'
    ? sidecar.bindings.filter((binding) => binding.projectSlug === canonicalSlug)
    : [];
  const removable = bound.map((binding) => ({
    rootPath: binding.rootPath,
    kind: binding.kind,
    boundAt: binding.boundAt,
    measuredAt: binding.receipt?.measuredAt ?? null,
  }));

  if (confirm !== true) {
    return {
      ok: true,
      changed: false,
      confirmed: false,
      contract: PROJECT_SOURCE_DISCONNECT_CONTRACT,
      projectSlug: canonicalSlug,
      removed: 0,
      bindings: removable,
      nextCall: {
        tool: 'disconnect_project_source',
        arguments: { projectSlug: canonicalSlug, confirm: true },
      },
    };
  }

  const result = removeProjectSourceBindings(VAULT_ROOT, canonicalSlug);
  if (result.status === 'blocked_unsafe_path') {
    throw new Error(
      `disconnect_project_source blocked: ${PROJECT_SOURCE_STATE_RELATIVE_PATH} is behind an unsafe sidecar path.`,
    );
  }
  if (result.status === 'persistence_failed') {
    throw new Error('disconnect_project_source could not persist the sidecar update.');
  }
  const projectSource = readProjectSourceView(VAULT_ROOT, canonicalSlug, undefined);
  return {
    ok: true,
    changed: result.removed > 0,
    confirmed: true,
    contract: PROJECT_SOURCE_DISCONNECT_CONTRACT,
    projectSlug: canonicalSlug,
    removed: result.removed,
    bindings: removable,
    projectSource,
    remedy: projectSourceRemedy(projectSource),
  };
}

function finalizeProjectMeaningTool({ projectSlug, expected_mtime } = {}) {
  requireOptionalNonBlankString(projectSlug, 'projectSlug');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (typeof projectSlug !== 'string') throw new Error('projectSlug is required.');
  if (typeof expected_mtime !== 'number') throw new Error('expected_mtime is required.');

  const allDocs = loadVaultDocs(VAULT_ROOT);
  const canonicalSlug = resolveExistingVaultSlug(projectSlug, allDocs);
  if (!canonicalSlug) {
    throw new Error(
      `Project slug does not exist in vault: "${projectSlug}". Use list_concepts({kind:"project"}) to choose an exact project slug.`,
    );
  }
  const projectDoc = allDocs.find((doc) => doc.slug === canonicalSlug);
  if (projectDoc?.frontmatter?.kind !== 'project') {
    throw new Error(`finalize_project_meaning requires a kind: project node; received "${canonicalSlug}".`);
  }
  if (projectDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(canonicalSlug, expected_mtime, projectDoc.mtime);
  }

  const validation = validateVaultTool({});
  if (validation.summary.errorFiles > 0) {
    throw new Error(
      `finalize_project_meaning blocked: validate_vault found ${validation.summary.errorFiles} file(s) with errors. Repair them before finalizing.`,
    );
  }

  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const brief = attachVaultValidation(
    queryCompiledOntology(artifact, {
      operation: 'agent_brief',
      project: canonicalSlug,
    }),
    { operation: 'agent_brief', project: canonicalSlug },
  );
  const context = projectMeaningContext(artifact, canonicalSlug, brief.readiness?.status);
  if (!context.graphHash || context.inventoryResult.status !== 'ready') {
    throw new Error(
      `finalize_project_meaning blocked: current project witness inventory is unavailable (${context.inventoryResult.reason ?? 'unknown'}).`,
    );
  }
  const sourceReceipt = context.projectSource.receipt;
  if (!sourceReceipt) {
    throw new Error('finalize_project_meaning blocked: a valid project source receipt is required first.');
  }

  const competency = parseProjectCompetencyMarkdown(context.projectDoc.body);
  const witnessAssessment = deriveMeaningAssessment({
    projectSlug: canonicalSlug,
    graphHash: context.graphHash,
    structure: { status: brief.readiness?.status },
    source: meaningSourceFromProjectSource(context.projectSource),
    competency: {
      contract: MEANING_COMPETENCY_CONTRACT,
      receiptVersion: 1,
      evaluator: MEANING_COMPETENCY_EVALUATOR,
      graphHash: context.graphHash,
      inventory: context.inventoryResult.inventory,
      questions: competency.questions,
    },
  });
  const unresolvedAnswered = witnessAssessment.dimensions.competency.questions.find(
    (row) => row.status === 'answered' && row.witnessStatus !== 'resolved',
  );
  if (unresolvedAnswered) {
    throw new Error(
      `finalize_project_meaning blocked: competency "${unresolvedAnswered.id}" is marked answered but its current witnesses do not resolve.`,
    );
  }

  const receipt = finalizeProjectMeaningReceipt({
    vaultRoot: VAULT_ROOT,
    projectSlug: canonicalSlug,
    projectBody: context.projectDoc.body,
    graphHash: context.graphHash,
    sourceFingerprint: sourceReceipt.sourceFingerprint,
    measuredAt: new Date().toISOString(),
  });
  const meaningAssessment = readProjectMeaningAssessment(context.assessmentInput);
  return {
    ok: true,
    changed: true,
    contract: 'projectMeaningReceipt:v1',
    projectSlug: canonicalSlug,
    bodyDigest: receipt.bodyDigest,
    graphHash: receipt.graphHash,
    sourceFingerprint: receipt.sourceFingerprint,
    measuredAt: receipt.measuredAt,
    meaningAssessment,
  };
}

function attachVaultValidation(result, args = {}) {
  const validation = validateVaultTool({});
  const pathsChecked = validation.pathDrift?.checked !== false;
  const driftCount = validation.pathDrift?.drifts?.length ?? 0;
  const errorCount = validation.summary.errorFiles;
  const frontmatterWarnings = validation.summary.warningFiles;
  const warningCount = frontmatterWarnings + driftCount;
  // **The sentence states what this check looked at.** It used to merge two kinds
  // of warning into one number and say only "validator or source-path warning(s)".
  // So when `health` reported warn:13 on a vault that `validate` called clean, the
  // user had no way to tell whether those 13 were frontmatter or code paths.
  const scopeTail = pathsChecked
    ? ` (frontmatter/graph refs ${frontmatterWarnings}, source paths ${driftCount}; repoRoot ${validation.pathDrift?.repoRoot ?? 'unknown'})`
    : ' (frontmatter/graph refs only — source paths were NOT checked; pass repoRoot / OATLAS_REPO_ROOT to include them)';
  const check = {
    id: 'vault_validation',
    status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass',
    count: errorCount + warningCount,
    pathsChecked,
    message:
      errorCount > 0
        ? `${errorCount} file(s) have blocking schema/frontmatter errors.${scopeTail}`
        : warningCount > 0
          ? `${warningCount} warning(s) require review.${scopeTail}`
          : `Vault schema and graph references validate cleanly.${scopeTail}`,
  };
  const needsAttention = check.status !== 'pass';
  const wasHealthy = result.status === 'healthy';
  const validationAction = {
    id: 'vault_validation',
    kind: 'validate_vault',
    severity: check.status === 'fail' ? 'fail' : 'warn',
    count: check.count,
    message: check.message,
  };
  const defaultLimit = result.operation === 'workspace_brief' ? 10 : 5;
  const actionLimit = typeof args.limit === 'number' ? args.limit : defaultLimit;
  const withValidationAction = (actions = []) => needsAttention
    ? [validationAction, ...actions.filter((action) => action.id !== validationAction.id)]
      .slice(0, actionLimit)
    : actions;

  if (result.operation === 'health') {
    return {
      ...result,
      status: needsAttention ? 'needs_attention' : result.status,
      checks: [...result.checks, check],
      validation,
    };
  }
  if (result.operation === 'workspace_brief') {
    return {
      ...result,
      status: needsAttention ? 'needs_attention' : result.status,
      health: {
        ...result.health,
        status: needsAttention ? 'needs_attention' : result.health.status,
        checks: [...result.health.checks, check],
        validation,
      },
      nextActions: withValidationAction(result.nextActions),
    };
  }
  if (result.operation === 'agent_brief') {
    return {
      ...result,
      status: needsAttention ? 'needs_attention' : result.status,
      readiness: {
        ...result.readiness,
        status: needsAttention && result.readiness.status === 'ready'
          ? 'needs_attention'
          : result.readiness.status,
        score: needsAttention && wasHealthy
          ? Math.max(0, result.readiness.score - 25)
          : result.readiness.score,
        healthChecks: result.readiness.healthChecks + 1,
      },
      health: {
        ...result.health,
        status: needsAttention ? 'needs_attention' : result.health.status,
        checks: [...result.health.checks, check],
        validation,
      },
      nextActions: withValidationAction(result.nextActions),
    };
  }
  return result;
}

function validateQueryOntologyArgs(args = {}) {
  requireNonBlankString(args.operation, 'operation');
  requireOptionalEnum(args.operation, 'operation', QUERY_ONTOLOGY_OPERATIONS);
  requireOptionalNonBlankString(args.targetOperation, 'targetOperation');
  requireOptionalEnum(args.targetOperation, 'targetOperation', QUERY_PLAN_TARGET_OPERATIONS);
  requireOptionalNonBlankString(args.recordId, 'recordId');
  requireOptionalNonBlankString(args.analysisCursor, 'analysisCursor');
  requireOptionalEnum(args.analysisMode, 'analysisMode', ['meaning', 'architecture']);
  if (args.operation === 'analysis_record') requireNonBlankString(args.recordId, 'recordId');
  if (args.recordId !== undefined && args.operation !== 'analysis_record') throw new Error('recordId is only valid for analysis_record.');
  if ((args.analysisMode !== undefined || args.analysisCursor !== undefined) && args.operation !== 'analysis_history') throw new Error('Analysis history filters require analysis_history.');
  if (args.operation === 'analysis_history' && args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100)) throw new Error('Analysis history limit must be between 1 and 100 scanned files.');

  for (const key of [
    'slug',
    'seed',
    'candidateSlug',
    'title',
    'task',
    'from',
    'project',
    'to',
    'type',
    'kind',
    'domain',
    'slugContains',
    'fromKind',
    'toKind',
    'relation',
    'afterActionId',
    'expectedGraphHash',
    'expectedSourceFingerprint',
    'reviewRevision',
    'cursor',
  ]) {
    requireOptionalNonBlankString(args[key], key);
  }
  requireOptionalEnum(args.detail, 'detail', ['compact', 'full']);
  if (args.detail !== undefined && args.operation !== 'agent_brief') {
    throw new Error('detail is only valid for operation "agent_brief".');
  }
  if (args.task !== undefined && (args.operation !== 'agent_brief' || args.detail !== 'compact')) {
    throw new Error('task is only valid for operation "agent_brief" with detail "compact".');
  }
  if (args.operation === 'agent_brief' && args.detail === 'compact' && args.task === undefined) {
    throw new Error('agent_brief detail "compact" requires task.');
  }
  if (typeof args.task === 'string' && args.task.length > AGENT_BRIEF_TASK_MAX_CHARS) {
    throw new Error(`task must contain at most ${AGENT_BRIEF_TASK_MAX_CHARS} characters.`);
  }
  for (const key of [
    'limit',
    'itemLimit',
    'nodeLimit',
    'componentLimit',
    'cycleLimit',
    'recommendationLimit',
    'orderLimit',
  ]) {
    requireOptionalPositiveInteger(args[key], key, { max: 500 });
  }
  requireOptionalPositiveInteger(args.iterations, 'iterations', { max: 100 });
  requireOptionalNonNegativeInteger(args.maxHops, 'maxHops', { max: 20 });
  requireOptionalNonNegativeInteger(args.depth, 'depth', { max: 20 });
  for (const key of ['minDegree', 'maxDegree', 'minInDegree', 'minOutDegree']) {
    requireOptionalNonNegativeInteger(args[key], key);
  }
  requireOptionalDirection(args.direction, 'direction', ['incoming', 'outgoing', 'both', 'undirected']);
  requireOptionalEnum(args.sort, 'sort', ['degree', 'inDegree', 'outDegree', 'slug']);
  if (args.operation === 'recommend_relations') {
    requireOptionalEnum(args.kind, 'kind', ['capability', 'element']);
  } else if (args.operation === 'match_nodes') {
    requireOptionalEnum(args.kind, 'kind', NODE_KIND_VALUES);
  }
  if (args.operation === 'match_edges') {
    requireOptionalEnum(args.fromKind, 'fromKind', NODE_KIND_VALUES);
    requireOptionalEnum(args.toKind, 'toKind', EDGE_TARGET_KIND_VALUES);
  }
  for (const key of [
    'includeExternal',
    'includeUnresolved',
    'includeIsolated',
    'includeOrphans',
    'executableOnly',
    'hasIncoming',
    'hasOutgoing',
  ]) {
    requireOptionalBoolean(args[key], key);
  }
  requireOptionalStringArray(args.types, 'types', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.pattern, 'pattern', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.phases, 'phases', { max: MAINTENANCE_PHASE_VALUES.length });
  requireOptionalStringArray(args.severities, 'severities', { max: MAINTENANCE_SEVERITY_VALUES.length });
  requireOptionalStringArray(args.kinds, 'kinds', { max: MAINTENANCE_KIND_VALUES.length });
  requireOptionalStringArray(args.dependencyTypes, 'dependencyTypes', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.componentTypes, 'componentTypes', { max: RELATION_TYPE_VALUES.length });
  if (args.operation === 'meaning_repair_review') {
    requireNonBlankString(args.project, 'project');
    requireNonBlankString(args.reviewRevision, 'reviewRevision');
    if (args.cursor === undefined) {
      requireNonBlankString(args.expectedGraphHash, 'expectedGraphHash');
      requireNonBlankString(args.expectedSourceFingerprint, 'expectedSourceFingerprint');
    }
    if (args.expectedGraphHash !== undefined && !/^project-graph-v1:[a-f0-9]{8}$/.test(args.expectedGraphHash)) {
      throw new Error('expectedGraphHash must be a project-graph-v1 hash.');
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(args.reviewRevision)) {
      throw new Error('reviewRevision must be a sha256 digest.');
    }
    if (args.expectedSourceFingerprint !== undefined && args.expectedSourceFingerprint.length > 200) {
      throw new Error('expectedSourceFingerprint must contain at most 200 characters.');
    }
    if (args.cursor !== undefined && args.cursor.length > 4096) {
      throw new Error('cursor must contain at most 4096 characters.');
    }
    if (args.cursor !== undefined && !/^mrp1\.[a-f0-9]{32}$/.test(args.cursor)) {
      throw new Error('cursor must be an opaque meaning repair cursor returned by nextCall.');
    }
  }
}

function compactPostWriteMaintenance(limit = 5) {
  COMPILED_ONTOLOGY_CACHE.clear();
  const artifact = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const ontologyAtlasIgnorePatterns = loadOntologyAtlasIgnore(VAULT_ROOT);
  // Node-eligibility gate hand-off (2026-07-31 council). The gate runs inside
  // `commitDoc`, so it has already fired for every door — add_concept,
  // patch_concept, add_relation, and the batch variants alike. Draining here,
  // at the one place a write response is assembled, is what gives batch tools
  // the "skip per row, summarize once at the end" behaviour for free: each row
  // writes with `includePostWriteMaintenance: false`, findings accumulate, and
  // the batch's single closing call collects all of them.
  const nodeEligibilityFindings = drainNodeEligibilityFindings();
  const maintenanceDocs = loadVaultDocs(VAULT_ROOT);
  // Same signal `validate_vault` reports as `summaryFreshness`, surfaced here as an
  // action so an agent planning work sees it without running a second tool. Reading
  // history is bounded to summary nodes and degrades to silence outside a repo.
  const freshness = buildSummaryFreshness(maintenanceDocs);
  const result = queryCompiledOntology(artifact, {
    operation: 'maintenance_plan',
    limit,
  }, {
    ontologyAtlasIgnorePatterns,
    nodeEligibilityFindings,
    staleSummaries: freshness.checked ? freshness.stale : [],
    // The empty-bridge audit needs bodies to tell "created and abandoned" from
    // "documented but childless" — and without that distinction it would fire on
    // 20 of this vault's 38 capabilities. The compiled-cache read above already
    // loads every doc, so this second pass is the same disk we just touched.
    sourceDocs: maintenanceDocs,
  });
  return {
    operation: result.operation,
    sideEffect: result.sideEffect,
    graphHash: result.graphHash,
    summary: result.summary,
    filters: result.filters,
    cursor: result.cursor,
    byPhase: result.byPhase,
    bySeverity: result.bySeverity,
    byKind: result.byKind,
    limited: result.limited,
    nextExecutableAction: compactMaintenanceAction(result.nextExecutableAction),
    nextReviewAction: compactMaintenanceAction(result.nextReviewAction),
    actions: result.actions.map(compactMaintenanceAction),
  };
}

function compactMaintenanceAction(action) {
  if (!action) return null;
  return {
    id: action.id,
    phase: action.phase,
    kind: action.kind,
    severity: action.severity,
    score: action.score,
    executable: action.executable,
    reason: action.reason,
    proposedAction: action.proposedAction,
    node: action.node
      ? {
          slug: action.node.slug,
          kind: action.node.kind,
          title: action.node.title,
        }
      : undefined,
    nodes: compactMaintenanceNodes(action.nodes),
  };
}

function compactMaintenanceNodes(nodesValue) {
  if (!nodesValue) return undefined;
  const compactNode = (node) => ({
    slug: node.slug,
    kind: node.kind,
    title: node.title,
  });
  if (Array.isArray(nodesValue)) {
    return nodesValue.map(compactNode);
  }
  if (typeof nodesValue === 'object') {
    return Object.fromEntries(
      Object.entries(nodesValue).map(([key, node]) => [key, compactNode(node)]),
    );
  }
  return undefined;
}

// validate_vault — one call gives an agent the whole vault's health, in the same
// shape as CLI `ontology-atlas validate --json`. It fills the gap between per-doc
// `warnings` (get_concept) and the vault aggregate (`vaultWarnings` in
// list_concepts): a detailed report combining both.
/**
 * Builds the summary-freshness section of `validate_vault`.
 *
 * Reports domains and projects whose containment list changed after their
 * description was last written — the update path nothing else in this tool checks.
 * `pathDrift` asks whether a node still points at real code; this asks whether a
 * node still describes what it holds.
 *
 * Advisory only. A stale description blocks nothing and is never rewritten here:
 * the body is a human judgement, so the tool asks for a re-judgement and stops.
 *
 * Degrades to `checked: false` outside a repository rather than reporting a clean
 * bill, because not looking is not the same as finding nothing. History reading is
 * bounded to summary nodes (8 of 83 in the dogfood vault), so a vault of ordinary
 * size pays well under a second.
 */
function buildSummaryFreshness(docs) {
  const summarySlugs = docs
    .filter((doc) => SUMMARY_KINDS.includes(doc?.frontmatter?.kind))
    .map((doc) => doc.slug);
  if (summarySlugs.length === 0) {
    return {
      checked: true,
      summaryNodes: 0,
      stale: [],
      hint: 'no domain or project nodes to check.',
    };
  }
  const revisions = collectNodeRevisions({
    repoRoot: REPO_ROOT,
    vaultRoot: VAULT_ROOT,
    slugs: summarySlugs,
  });
  if (!revisions.ok) {
    return {
      checked: false,
      summaryNodes: summarySlugs.length,
      stale: [],
      hint: `Summary freshness was NOT checked (${revisions.reason}). This comparison reads Git history, so a vault outside a repository cannot be judged — read each domain against the nodes it contains by hand.`,
    };
  }
  const stale = findStaleParentSummaries({
    docs,
    revisionsOf: (slug) => revisions.revisionsBySlug.get(slug) ?? [],
  }).map((row) => ({ ...row, score: staleParentScore(row), hint: describeStaleParent(row) }));

  return {
    checked: true,
    summaryNodes: summarySlugs.length,
    stale,
    hint:
      stale.length > 0
        ? `${stale.length} summary node(s) declare a membership that changed after their description was last written. Nothing is blocked; read each against the nodes it contains and re-judge the body.`
        : `all ${summarySlugs.length} summary node(s) were described after their membership last changed.`,
  };
}

/**
 * Judge the wiki pages against their own contract.
 *
 * `validate_vault` cannot answer this and should not try: a wiki page carries no `kind:`
 * **by contract**, so to that validator it is a document with nothing to check, and
 * `suppressLibraryKindIssues` deliberately drops the one issue it would raise. Whether a
 * page fits the shape every writer was handed is a separate question with its own codes,
 * and this tool is where an agent asks it — after writing a page, and before claiming a
 * compile finished.
 *
 * The output is the shape `ontology-atlas wiki-validate --json` prints, so a person
 * reading a terminal and an agent reading a tool result are reading one report.
 */
function validateWikiTool({ paths } = {}) {
  if (paths !== undefined && !Array.isArray(paths)) {
    throw new Error('validate_wiki: `paths` must be an array of vault-relative page paths.');
  }
  const wikiPrefix = `${WIKI_DIR}/`;
  // Every raw source in the folder, so a citation naming a file nobody has is reported
  // rather than trusted. Listing only — no source is opened here or anywhere below.
  const knownSources = listVaultSourcePaths();
  const docs = loadVaultDocs(VAULT_ROOT);
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));

  const requested =
    paths === undefined
      ? docs
          .map((doc) => `${doc.slug}.md`)
          .filter((path) => path.startsWith(wikiPrefix) && !isWikiFurnitureSlug(path))
          .sort()
      : paths.map((path) => String(path));

  const pages = [];
  for (const path of requested) {
    if (!path.startsWith(wikiPrefix)) {
      // Named, not skipped: an agent that asked about the wrong file must learn that,
      // rather than reading an empty problem list as a pass.
      pages.push({
        path,
        ok: false,
        problems: [
          {
            code: 'not-a-wiki-page',
            message: `\`${path}\` is not under \`${wikiPrefix}\`, so the wiki page contract does not apply to it.`,
          },
        ],
      });
      continue;
    }
    const doc = bySlug.get(path.replace(/\.md$/, ''));
    if (!doc) {
      pages.push({
        path,
        ok: false,
        problems: [{ code: 'page-missing', message: `\`${path}\` is not in this folder.` }],
      });
      continue;
    }
    const { ok, problems } = validateWikiPage(doc.raw || '', { knownSources });
    pages.push({ path, ok, problems });
  }

  // The folder half is judged over every page in the folder, whatever `paths` narrowed
  // the report to: whether somebody links to a page is a fact about the other pages,
  // and a page asked about alone would otherwise always read as an orphan.
  const folderPages = docs
    .filter((doc) => doc.slug.startsWith(wikiPrefix) && !isWikiFurnitureSlug(doc.slug))
    .map((doc) => ({ path: `${doc.slug}.md`, raw: doc.raw || '' }));
  const folderByPath = new Map(validateWikiFolder(folderPages).map((entry) => [entry.path, entry.problems]));
  for (const page of pages) {
    const extra = folderByPath.get(page.path) ?? [];
    if (extra.length > 0) {
      page.problems.push(...extra);
      page.ok = false;
    }
  }

  return {
    pageCount: pages.length,
    failingCount: pages.filter((page) => !page.ok).length,
    pages,
  };
}

/** Vault-relative paths under `sources/`. A listing, never a read. */
/**
 * The text of one raw source, in citable units — `read_source`.
 *
 * The path is checked before anything is opened: it must sit under `sources/` and resolve
 * inside the vault, so a request cannot read a file the folder does not hold. The bytes are
 * hashed as read, which is the same `source_hash` a page records.
 */
function readSourceTool({ path, from, limit, sheet } = {}) {
  const relPath = String(path ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!relPath.startsWith('sources/') || relPath.split('/').includes('..') || relPath.endsWith('/')) {
    throw new Error('read_source: `path` must name a file under `sources/`, such as `sources/plan.docx`.');
  }
  const absolute = resolve(VAULT_ROOT, relPath);
  if (!absolute.startsWith(resolve(VAULT_ROOT, 'sources') + sep)) {
    throw new Error('read_source: `path` must stay inside the vault\'s `sources/` folder.');
  }
  let buffer;
  try {
    buffer = readFileSync(absolute);
  } catch {
    throw new Error(`read_source: \`${relPath}\` is not in this folder. \`validate_wiki\` lists the sources every page cites.`);
  }
  const answer = readSourceText(buffer, relPath, { from, limit, sheet });
  answer.sha256 = createHash('sha256').update(buffer).digest('hex');
  return answer;
}

function listVaultSourcePaths() {
  const out = [];
  const stack = [{ dir: join(VAULT_ROOT, 'sources'), prefix: 'sources' }];
  while (stack.length > 0) {
    const { dir, prefix } = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) stack.push({ dir: join(dir, entry.name), prefix: relative });
      else if (entry.isFile()) out.push(relative);
    }
  }
  return out;
}

function validateVaultTool({ repoRoot } = {}) {
  requireOptionalNonBlankString(repoRoot, 'repoRoot');
  const docs = loadVaultDocs(VAULT_ROOT);
  const docIssues = new Map();
  for (const doc of docs) {
    const result = validateVaultDocument(doc.raw || '');
    docIssues.set(doc.slug, result.issues || []);
  }
  for (const [slug, danglingIssues] of groupDanglingIssuesBySlug(docs)) {
    const issues = docIssues.get(slug) || [];
    issues.push(...danglingIssues);
    docIssues.set(slug, issues);
  }
  /*
   * Never tell a node that already has a parent that it has none (2026-08-11).
   * A single-file check cannot know; this one holds the whole vault.
   */
  suppressParentedExpectedFieldIssues(docIssues, docs);
  suppressLibraryKindIssues(docIssues);
  const problems = [];
  let errorFiles = 0;
  let warningFiles = 0;
  // byCode aggregation: { code → { severity, count, files: Set<slug> } }
  const byCodeMap = new Map();
  for (const doc of docs) {
    const issues = docIssues.get(doc.slug) || [];
    if (issues.length === 0) continue;
    let hasError = false;
    const seenInDoc = new Set();
    for (const issue of issues) {
      if (issue.severity === 'error') hasError = true;
      if (!byCodeMap.has(issue.code)) {
        byCodeMap.set(issue.code, {
          severity: issue.severity,
          count: 0,
          files: new Set(),
        });
      }
      const entry = byCodeMap.get(issue.code);
      // severity escalates if any issue of this code is error
      if (issue.severity === 'error') entry.severity = 'error';
      // count = file count (per-file), not per-issue
      if (!seenInDoc.has(issue.code)) {
        seenInDoc.add(issue.code);
        entry.count += 1;
        entry.files.add(doc.slug);
      }
    }
    if (hasError) errorFiles += 1;
    else warningFiles += 1;
    problems.push({
      slug: doc.slug,
      issues: issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
      })),
    });
  }
  const byCode = {};
  for (const [code, entry] of byCodeMap.entries()) {
    byCode[code] = {
      severity: entry.severity,
      count: entry.count,
      files: [...entry.files],
    };
  }
  // Atlas roadmap Track A #2 — vault→code path drift: frontmatter path:/elements:
  // entries that no longer exist on disk. Read-only; resolves against repoRoot
  // (default: active resolved repository root). Surfaced here because it is a vault-health signal the
  // agent already runs validate_vault for at first-contact. The agent fixes via
  // patch_concept (correct the path) or by removing the stale entry.
  const driftRoot = repoRoot ? assertScanRootAllowed(repoRoot, 'repoRoot') : REPO_ROOT;
  // **Do not measure against an ungrounded repo root.** Measuring would flag every
  // file missing from a directory unrelated to the vault as "drift", turning a
  // healthy vault into `needs_attention`. Not looking is not zero — it is *not
  // looked at* — so it reports `checked: false` and how to make it look.
  const driftGrounded = Boolean(repoRoot) || REPO_ROOT_IS_GROUNDED;
  if (!driftGrounded) {
    return {
      scanned: docs.length,
      problems,
      summary: { problemFiles: problems.length, errorFiles, warningFiles, byCode },
      summaryFreshness: buildSummaryFreshness(docs),
      pathDrift: {
        repoRoot: driftRoot,
        checked: false,
        nodesScanned: 0,
        pathsChecked: 0,
        drifts: [],
        hint:
          'Source paths were NOT checked. This vault is not inside a git repository and no repoRoot was given, so the repository it describes is unknown — anything measured against the process working directory would be noise, not drift. Pass repoRoot to validate_vault (or set OATLAS_REPO_ROOT) to check implementation paths.',
      },
    };
  }
  const drift = detectVaultPathDrift({
    docs,
    repoRoot: driftRoot,
    fileExists: existsSync,
  });
  // Atlas roadmap Track A #3 — reconcile suggestion. A drifted path is usually a
  // MOVE; when exactly one existing repo source file shares the missing file's
  // basename, annotate the drift with `suggestedPath` so the fix is "did you
  // mean X?". Only walk the repo when there IS drift (zero cost on a clean vault),
  // and only suggest on a unique basename match (ambiguous names never guess).
  let drifts = drift.drifts;
  let suggestedCount = 0;
  if (drifts.length > 0) {
    try {
      const repoFiles = listSourceFiles(driftRoot).map((abs) => relative(driftRoot, abs));
      drifts = suggestPathReconciliations(drift.drifts, repoFiles);
      suggestedCount = drifts.filter((d) => typeof d.suggestedPath === 'string').length;
    } catch {
      // walk failure (perms / not a dir) — keep plain drifts, never break validate.
      drifts = drift.drifts;
    }
  }
  return {
    scanned: docs.length,
    problems,
    summary: {
      problemFiles: problems.length,
      errorFiles,
      warningFiles,
      byCode,
    },
    summaryFreshness: buildSummaryFreshness(docs),
    pathDrift: {
      repoRoot: drift.repoRoot,
      checked: true,
      nodesScanned: drift.nodesScanned,
      pathsChecked: drift.pathsChecked,
      drifts,
      hint:
        drift.drifts.length > 0
          ? `${drift.drifts.length} frontmatter path(s) point at files missing under repoRoot — fix the .md (patch_concept) or remove the stale entry.${suggestedCount > 0 ? ` ${suggestedCount} have a same-named file elsewhere in the repo (see suggestedPath — likely a move).` : ''} If repoRoot is wrong, re-run validate_vault with the correct repoRoot.`
          : drift.pathsChecked > 0
            ? `all ${drift.pathsChecked} frontmatter source path(s) exist under repoRoot (no code drift).`
            : 'no frontmatter path:/elements: source paths to check.',
    },
  };
}

function findDanglingGraphReferenceIssues(docs) {
  const slugs = new Set(docs.map((d) => d.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const doc of docs) {
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, doc.slug);
    }
  }
  const resolveRef = (rawRef) => {
    if (typeof rawRef !== 'string') return null;
    // Normalise references to NFC as well — slugs are already NFC via
    // `pathToSlug`. Normalising one side only leaves characters that look
    // identical but do not match.
    const ref = rawRef.normalize('NFC');
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  };
  const issues = [];
  for (const doc of docs) {
    for (const { key, ref } of collectNeighborRefs(doc)) {
      if (typeof ref !== 'string' || ref.trim() === '') continue;
      if (key === 'elements' && isPathLikeGraphRef(ref)) continue;
      if (resolveRef(ref)) continue;
      issues.push({
        slug: doc.slug,
        issue: {
          code: 'dangling-graph-reference',
          severity: 'warning',
          message: `\`${key}:\` graph reference "${ref}" does not resolve to any node in the vault.`,
        },
      });
    }
  }
  return issues;
}

/**
 * Two documents claiming the same canonical slug (measured 2026-07-29).
 *
 * **A per-file check cannot catch this in principle** — either file alone looks
 * fine. It arises because `patch_concept` did not stop `frontmatter.slug` being
 * overwritten with a value another node already uses (add_concept blocks it and
 * rename_concept demands `overwrite`; only this path was open). Once it happens,
 * no relation naming that slug can be resolved to one side. The compiler saw
 * `ambiguous-alias` while `validate_vault` quietly returned clean.
 */
function findDuplicateSlugIssues(docs) {
  const byDeclared = new Map();
  for (const doc of docs ?? []) {
    const declared = doc?.frontmatter?.slug;
    const value = typeof declared === 'string' ? declared.trim() : '';
    if (!value) continue;
    if (!byDeclared.has(value)) byDeclared.set(value, []);
    byDeclared.get(value).push(doc);
  }
  const issues = [];
  for (const [declared, group] of byDeclared) {
    if (group.length < 2) continue;
    const all = group.map((doc) => doc.slug);
    for (const doc of group) {
      const rest = all.filter((slug) => slug !== doc.slug);
      issues.push({
        slug: doc.slug,
        issue: {
          code: 'duplicate-slug',
          severity: 'error',
          message:
            `\`slug: ${declared}\` is also claimed by ${rest.join(', ')}. ` +
            `Relations naming it cannot resolve to one node — change one slug or merge with rename_concept.`,
        },
      });
    }
  }
  return issues;
}

function findDuplicateUidIssues(docs) {
  const claimsByUid = new Map();
  for (const doc of docs ?? []) {
    const claims = new Set([
      doc?.frontmatter?.uid,
      ...(Array.isArray(doc?.frontmatter?.merged_uids) ? doc.frontmatter.merged_uids : []),
    ]);
    for (const uid of claims) {
      if (nodeUidIssue(uid)) continue;
      if (!claimsByUid.has(uid)) claimsByUid.set(uid, []);
      claimsByUid.get(uid).push(doc);
    }
  }

  const issues = [];
  for (const [uid, group] of claimsByUid) {
    if (group.length < 2) continue;
    const all = group.map((doc) => doc.slug);
    for (const doc of group) {
      const rest = all.filter((slug) => slug !== doc.slug);
      issues.push({
        slug: doc.slug,
        issue: {
          code: 'duplicate-uid',
          severity: 'error',
          message:
            `UID ${uid} is also claimed by ${rest.join(', ')} as a primary or merged identity. ` +
            'Permanent identity must resolve to exactly one surviving node.',
        },
      });
    }
  }
  return issues;
}

function groupDanglingIssuesBySlug(docs) {
  const bySlug = new Map();
  for (const { slug, issue } of findDanglingGraphReferenceIssues(docs)) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  // Duplicate slugs ride the same whole-vault pass: both are the kind of defect
  // that looks fine one file at a time, so this is the only place that can see them.
  for (const { slug, issue } of findDuplicateSlugIssues(docs)) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  for (const { slug, issue } of findDuplicateUidIssues(docs)) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  return bySlug;
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('scripts/') ||
    ref.startsWith('.claude/') ||
    /\.[A-Za-z0-9]+$/.test(ref)
  );
}

// Thin wrapper over analyze_repo_structure. Zero side effects — it never touches
// vault frontmatter. Only the exact writePlan returned after reviewPlan plus
// independent qualification is a truth entry point for the batch writer.
/**
 * Is this a place we may scan — **it must be inside the vault or its repository.**
 *
 * **Why** (review 2026-08-16, confirmed by measurement): `analyze_repo_structure`,
 * `infer_imports`, `index_project`, and `validate_vault` took a `rootPath` (or
 * `repoRoot`), called `resolve()` on it, and **checked no boundary at all**. So
 * this call succeeded as written:
 *
 * ```
 * analyze_repo_structure {"rootPath":"/etc"}  → ok, returns the directory structure
 * ```
 *
 * Worse, all four are **read tools**, so `OATLAS_READ_ONLY` does not stop them.
 * That mode is recommended when whoever registered the server is not the vault's
 * owner — and it left them unable to write but **able to scan the entire disk**.
 *
 * This collides head-on with what the product promises its users: *"files on the
 * user's disk such as passwords or credentials are never scanned automatically"*
 * (`.claude/rules/local-first.md`), *"we do not scan the user's disk
 * automatically"* (the trust charter). A tool call steered by one line of prompt
 * would break that promise.
 *
 * So only the vault, or that vault's repository, is allowed. Real paths are
 * resolved before comparison to close the symlink escape — the same grammar
 * `absorb_document` already uses.
 */
function assertScanRootAllowed(target, argName = 'rootPath') {
  const canonical = existsSync(target) ? realpathSync(target) : resolve(target);
  const roots = [];
  for (const root of [VAULT_ROOT, REPO_ROOT]) {
    try {
      roots.push(existsSync(root) ? realpathSync(root) : resolve(root));
    } catch {
      roots.push(resolve(root));
    }
  }
  const inside = roots.some((root) => {
    if (canonical === root) return true;
    const rel = relative(root, canonical);
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  });
  if (inside) return canonical;
  throw new Error(
    `${argName} must be inside the vault (${roots[0]}) or its repository (${roots[1]}). ` +
      'This server only reads the folder it was opened for.',
  );
}

function analyzeRepoStructureTool({ rootPath, maxDepth, ignore, proposal, qualification } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonNegativeInteger(maxDepth, 'maxDepth', { max: 10 });
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  const sourceDigest = proposal == null
    ? undefined
    : inspectProjectSource(target).fingerprint;
  // A proposal may cite up to four exact endpoints already observable through
  // infer_imports. Recompute that bounded, read-only receipt in the proposal
  // call so validation does not depend on hidden state from an earlier
  // index_project/infer_imports call.
  const proposalImportEvidence = proposal == null
    ? undefined
    : inferImports(target, { ignore });
  return analyzeRepoStructure(target, {
    maxDepth,
    ignore,
    ...(proposalImportEvidence === undefined
      ? {}
      : { precomputedPythonImports: proposalImportEvidence }),
    proposal,
    qualification,
    sourceDigest,
  });
}

function inspectArchitectureTool({ rootPath, profileSlug, maxFiles } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonBlankString(profileSlug, 'profileSlug');
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  const profiles = findArchitectureProfiles(loadVaultDocs(VAULT_ROOT));
  if (profiles.length === 0) {
    const error = new Error(
      'No architecture-profile/v1 document exists in the active vault. Add a reviewed Markdown profile under architecture/ before inspecting source conformance.',
    );
    error.repairFields = {
      errorCode: 'architecture_profile_missing',
      profileDirectory: 'architecture/',
    };
    throw error;
  }
  let profile = null;
  if (profileSlug !== undefined) {
    profile = profiles.find((candidate) => candidate.slug === profileSlug) ?? null;
    if (!profile) {
      const error = new Error(`Architecture profile not found: ${profileSlug}.`);
      error.repairFields = {
        errorCode: 'architecture_profile_not_found',
        profileSlug,
        availableProfileSlugs: profiles.map((candidate) => candidate.slug),
      };
      throw error;
    }
  } else if (profiles.length === 1) {
    [profile] = profiles;
  } else {
    const error = new Error(
      `Multiple architecture profiles exist; pass profileSlug. Available profiles: ${profiles.map((candidate) => candidate.slug).join(', ')}.`,
    );
    error.repairFields = {
      errorCode: 'architecture_profile_required',
      availableProfileSlugs: profiles.map((candidate) => candidate.slug),
    };
    throw error;
  }
  const imports = inferImports(target, { maxFiles });
  // Measured stamp (2026-08-27 decision, point 2): when the scan ran, which tool version measured,
  // and the exact source state it saw. Reading the source inspection is still side effect 0.
  const measured = buildArchitectureMeasuredStamp(inspectProjectSource(target), {
    toolName: 'ontology-atlas',
    toolVersion: SERVER_VERSION,
  });
  return buildArchitectureBrief(
    profile,
    {
      ...imports,
      rootPath: target,
    },
    { measured },
  );
}

// Thin wrapper over infer_imports. Zero side effects. The resulting moduleEdges
// are rationale-review candidates carrying exact source evidence.
function buildImportStaleEdgeFollowUp(result) {
  const count = Array.isArray(result?.reconciliation?.inVaultNotInCode)
    ? result.reconciliation.inVaultNotInCode.length
    : 0;
  return {
    status: count > 0 ? 'full_follow_up_required' : 'not_present',
    count,
    nextCall: count > 0
      ? {
          tool: 'infer_imports',
          arguments: {
            rootPath: result.rootPath,
            reviewMode: 'full',
            allowLargeResponse: true,
          },
          purpose: 'Read full reconciliation before judging stale vault edges; compact delivery omits stale details.',
        }
      : null,
  };
}

function buildGoPackageImportEvidenceSummary(
  result,
  { sourceFolders, ignore, maxFiles } = {},
) {
  const receipt = result?.packageImportEvidence;
  if (!receipt) return undefined;
  return {
    contract: 'goPackageImports:v1',
    filesScanned: receipt.filesScanned,
    fileScanLimited: receipt.fileScanLimited,
    packageImports: receipt.packageImports.length,
    moduleEdges: receipt.moduleEdges.length,
    fullEvidenceCall: {
      tool: 'infer_imports',
      arguments: {
        rootPath: result.rootPath,
        ...(sourceFolders !== undefined
          ? { sourceFolders: [...new Set(sourceFolders)] }
          : {}),
        ...(ignore !== undefined ? { ignore: [...new Set(ignore)] } : {}),
        ...(maxFiles !== undefined ? { maxFiles } : {}),
        reviewMode: 'full',
        allowLargeResponse: true,
      },
      purpose: 'Read the complete typed Go package-import evidence; focus only contains legacy file edges.',
    },
  };
}

function inferImportsTool({
  rootPath,
  sourceFolders,
  ignore,
  maxFiles,
  reconcile = true,
  reviewMode,
  allowLargeResponse,
  afterReviewId,
  focusPath,
  focusDirection,
  focusLimit,
  focusAfterEdgeId,
} = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalStringArray(sourceFolders, 'sourceFolders', { max: SOURCE_FOLDER_ARRAY_MAX_ITEMS });
  requireOptionalStringArray(ignore, 'ignore', { max: IGNORE_ARRAY_MAX_ITEMS });
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  requireOptionalBoolean(reconcile, 'reconcile');
  requireOptionalEnum(reviewMode, 'reviewMode', ['full', 'next', 'focus']);
  requireOptionalBoolean(allowLargeResponse, 'allowLargeResponse');
  requireOptionalNonBlankString(afterReviewId, 'afterReviewId');
  requireOptionalNonBlankString(focusPath, 'focusPath');
  requireOptionalEnum(focusDirection, 'focusDirection', ['incoming', 'outgoing', 'both']);
  requireOptionalPositiveInteger(focusLimit, 'focusLimit', { max: 100 });
  requireOptionalNonBlankString(focusAfterEdgeId, 'focusAfterEdgeId');
  const requestedReviewMode = reviewMode ?? (focusPath === undefined ? undefined : 'focus');
  if (allowLargeResponse !== undefined && reviewMode !== 'full') {
    throw new Error('allowLargeResponse is only valid with reviewMode "full".');
  }
  if (afterReviewId !== undefined && reviewMode !== 'next') {
    throw new Error('afterReviewId is only valid with reviewMode "next".');
  }
  if (requestedReviewMode === 'focus' && focusPath === undefined) {
    throw new Error('reviewMode "focus" requires focusPath.');
  }
  if (focusPath !== undefined && requestedReviewMode !== 'focus') {
    throw new Error('focusPath is only valid with reviewMode "focus" or with reviewMode omitted.');
  }
  if (
    (focusDirection !== undefined || focusLimit !== undefined || focusAfterEdgeId !== undefined) &&
    requestedReviewMode !== 'focus'
  ) {
    throw new Error('focusDirection, focusLimit, and focusAfterEdgeId are only valid in focus mode.');
  }
  if (reviewMode === 'next' && reconcile === false) {
    throw new Error('reviewMode "next" requires reconcile:true because the review queue is a vault diff.');
  }
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  const result = inferImports(target, {
    sourceFolders,
    ignore,
    maxFiles,
  });

  if (requestedReviewMode === 'focus') {
    const focusReview = buildImportImpactFocus(result.edges, {
      focusPath,
      direction: focusDirection,
      limit: focusLimit,
      afterEdgeId: focusAfterEdgeId ?? null,
    });
    const packageImportEvidenceSummary = buildGoPackageImportEvidenceSummary(result, {
      sourceFolders,
      ignore,
      maxFiles,
    });
    if (packageImportEvidenceSummary) {
      focusReview.interpretation +=
        ' This focus response covers legacy file edges only; use the explicit full-evidence call for typed Go package imports.';
    }
    return {
      contract: 'inferImportsFocus:v1',
      rootPath: result.rootPath,
      filesScanned: result.filesScanned,
      coverage: result.coverage,
      scanSummary: {
        fileEdges: result.edges.length,
        externalImports: result.externalImports.length,
        unresolvedImports: result.unresolved.length,
        moduleEdges: result.moduleEdges.length,
      },
      ...(packageImportEvidenceSummary ? { packageImportEvidenceSummary } : {}),
      focusReview,
    };
  }

  // Atlas roadmap Track A #1 — reconcile the code-derived module edges against
  // the vault's compiled depends_on edges so the agent gets "exactly what to
  // review", not a raw firehose. Read-only; raw imports never land directly.
  // Guarded: a missing/unreadable vault must never fail the import scan.
  if (reconcile !== false) {
    try {
      const artifact = compileOntology(loadVaultDocs(VAULT_ROOT), { includeIndexes: true });
      const nodeSlugs = new Set((artifact.nodes ?? []).map((n) => n.slug).filter(Boolean));
      // Where each node says its implementation lives — used to decide **whether
      // to defer judgement**. Calling a relation implemented in a language the
      // scanner cannot read (Rust and friends) "absent from the code" makes an
      // agent delete a correct relation (measured on this repository itself,
      // 2026-08-17: 3 of 3 were that case).
      const pathBySlug = Object.create(null);
      for (const node of artifact.nodes ?? []) {
        if (node?.slug && typeof node.path === 'string') pathBySlug[node.slug] = node.path;
      }
      const r = reconcileImportEdges({
        moduleEdges: result.moduleEdges,
        compiledEdges: artifact.edges,
        aliasToSlug: artifact.indexes?.aliasToSlug,
        nodeSlugs,
        pathBySlug,
        scannedExtensions: result.coverage?.supportedExtensions,
      });
      result.reconciliation = r;
      // Factual, never-lie hint: only report "in sync" when there is genuinely
      // no drift in any bucket (the prior version falsely claimed "match" while
      // silently swallowing real edges — the bug the gate caught).
      const parts = [];
      if (r.inCodeMissingFromVault.length > 0) {
        parts.push(
          `${r.inCodeMissingFromVault.length} import-backed candidate(s) are missing from the vault with both endpoints already nodes — inspect exact evidence, supply semantic rationale, and obtain human approval before one explicit write`,
        );
      }
      if (r.inCodeMissingEndpointAbsent.length > 0) {
        parts.push(
          `${r.inCodeMissingEndpointAbsent.length} import-backed candidate(s) reference a slug that is not yet a vault node (model endpoints before semantic review)`,
        );
      }
      if (r.inVaultNotInCode.length > 0) {
        parts.push(
          // Never assert "stale". An import is **one kind of evidence**, and a
          // dependency may be a spawned process or a config pointer instead — all
          // three of this repository's own edges were that case (2026-08-17).
          `${r.inVaultNotInCode.length} vault depends_on edge(s) have no matching code import. An import is only one kind of evidence: a dependency can be a process spawn, a config reference, or a runtime contract. Read the code before treating any of these as stale`,
        );
      }
      if (r.notJudgeableByImports.length > 0) {
        parts.push(
          `${r.notJudgeableByImports.length} vault depends_on edge(s) could NOT be judged from imports because an endpoint's implementation is not in a scanned language (do not treat these as stale — read the code yourself or leave them alone)`,
        );
      }
      if (result.unresolved.length > 0) {
        parts.push(
          `${result.unresolved.length} unresolved import(s) could not be compared with the vault (inspect unresolved before claiming sync)`,
        );
      }
      result.reconciliationSummary = {
        inBoth: r.inBoth.length,
        inCodeMissingFromVault: r.inCodeMissingFromVault.length,
        inCodeMissingEndpointAbsent: r.inCodeMissingEndpointAbsent.length,
        inVaultNotInCode: r.inVaultNotInCode.length,
        notJudgeableByImports: r.notJudgeableByImports.length,
        unresolvedImports: result.unresolved.length,
        hint:
          parts.length > 0
            ? `${parts.join('; ')}.`
            : `code import graph and vault depends_on edges are in sync (${r.inBoth.length} shared, no drift).`,
      };
    } catch {
      // No loadable vault (e.g. scanning a foreign repo) — skip reconciliation silently.
      result.reconciliation = null;
    }
  }

  const automaticLimitBytes = 128 * 1024;
  let effectiveReviewMode = requestedReviewMode ?? 'full';
  let delivery;
  if (reviewMode === undefined || (reviewMode === 'full' && allowLargeResponse !== true)) {
    const estimatedFullResponseBytes = estimateMcpToolResultUtf8Bytes(result);
    if (estimatedFullResponseBytes <= automaticLimitBytes) {
      return result;
    }
    if (reviewMode === 'full') {
      const confirmationError = new Error(
        `Estimated full response (${estimatedFullResponseBytes} bytes) exceeds the 128 KiB delivery limit. Retry with reviewMode:"full", allowLargeResponse:true only when the complete arrays are intentionally required, or use reviewMode:"next" for one bounded review packet.`,
      );
      confirmationError.repairFields = {
        largeResponseConfirmationRequired: true,
        estimatedFullResponseBytes,
        automaticLimitBytes,
        retryArguments: {
          reviewMode: 'full',
          allowLargeResponse: true,
        },
        boundedAlternative: {
          reviewMode: 'next',
        },
      };
      throw confirmationError;
    }
    if (reconcile === false || !result.reconciliation || !result.reconciliationSummary) {
      const deliveryError = new Error(
        `Estimated full response (${estimatedFullResponseBytes} bytes) exceeds the automatic 128 KiB delivery limit, but compact review requires reconcile:true and a loadable active vault. Retry with reconcile:true, or explicitly opt in to the large payload with reviewMode:"full", allowLargeResponse:true.`,
      );
      deliveryError.repairFields = {
        estimatedFullResponseBytes,
        automaticLimitBytes,
        requiredForCompact: {
          reconcile: true,
          loadableActiveVault: true,
        },
        explicitFullOverride: {
          reviewMode: 'full',
          allowLargeResponse: true,
        },
      };
      throw deliveryError;
    }
    effectiveReviewMode = 'next';
    delivery = {
      selection: 'automatic_compact',
      reason: 'estimated_full_response_exceeds_limit',
      estimatedFullResponseBytes,
      automaticLimitBytes,
      explicitFullAvailable: true,
      explicitFullArguments: {
        reviewMode: 'full',
        allowLargeResponse: true,
      },
    };
  }

  if (effectiveReviewMode === 'next') {
    if (!result.reconciliation || !result.reconciliationSummary) {
      throw new Error(
        'reviewMode "next" requires a loadable active vault so import candidates can be reconciled against existing ontology nodes.',
      );
    }
    const nextReview = buildNextImportRelationReview(result.reconciliation, {
      afterReviewId: afterReviewId ?? null,
      rootPath: result.rootPath,
    });
    const packageImportEvidenceSummary = buildGoPackageImportEvidenceSummary(result, {
      sourceFolders,
      ignore,
      maxFiles,
    });
      return {
        contract: 'inferImportsReview:v1',
        ...(delivery ? { delivery } : {}),
        rootPath: result.rootPath,
        filesScanned: result.filesScanned,
        coverage: result.coverage,
      scanSummary: {
        fileEdges: result.edges.length,
        externalImports: result.externalImports.length,
        unresolvedImports: result.unresolved.length,
        moduleEdges: result.moduleEdges.length,
      },
      ...(packageImportEvidenceSummary ? { packageImportEvidenceSummary } : {}),
      reconciliationSummary: result.reconciliationSummary,
      staleEdgeFollowUp: buildImportStaleEdgeFollowUp(result),
      reviewQueue: {
        total: nextReview?.cursor.total ?? 0,
        returned: nextReview ? 1 : 0,
        exhausted: nextReview === null,
        afterReviewId: afterReviewId ?? null,
      },
      nextReview,
    };
  }

  return result;
}

function estimateMcpToolResultUtf8Bytes(result) {
  const response = {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
  return Buffer.byteLength(JSON.stringify(response), 'utf8');
}

function indexProjectTool({ rootPath, maxDepth, maxFiles, threshold, skipImports = false } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonNegativeInteger(maxDepth, 'maxDepth', { max: 10 });
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  requireOptionalPositiveInteger(threshold, 'threshold');
  requireOptionalBoolean(skipImports, 'skipImports');

  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  let imports = null;
  let importAnalysis = null;
  let thresholdApplied = null;
  if (!skipImports) {
    imports = inferImportsTool({
      rootPath: target,
      maxFiles,
      reviewMode: 'full',
      allowLargeResponse: true,
    });
    // Keep one full receipt: analysis consumes this exact object once, while
    // the plan below reports bounded counters without returning the firehose.
    importAnalysis = imports;
    if (threshold && threshold > 1 && Array.isArray(imports.moduleEdges)) {
      const before = imports.moduleEdges.length;
      thresholdApplied = {
        threshold,
        filteredOut: before - imports.moduleEdges.filter((edge) => Number(edge.count) >= threshold).length,
      };
    }
  }
  const analyze = analyzeRepoStructure(target, {
    maxDepth,
    precomputedPythonImports: importAnalysis,
  });
  const validation = validateVaultTool({ repoRoot: target });

  const conceptCount =
    (analyze.project ? 1 : 0) +
    analyze.domains.length +
    analyze.capabilities.length +
    analyze.elements.length;
  const conceptCandidates = [
    ...(analyze.project ? [analyze.project] : []),
    ...analyze.domains,
    ...analyze.capabilities,
    ...analyze.elements,
  ];
  const compiled = COMPILED_ONTOLOGY_CACHE.get({ includeIndexes: true });
  const vaultProjectNodes = (compiled.nodes ?? []).filter((node) => node.kind === 'project');
  const analyzedProjectSlug = analyze.project?.slug ?? null;
  const matchingVaultProject = analyzedProjectSlug
    ? vaultProjectNodes.find(
        (node) =>
          node.slug === analyzedProjectSlug ||
          node.frontmatter?.slug === analyzedProjectSlug ||
          compiled.indexes?.aliasToSlug?.[analyzedProjectSlug] === node.slug,
      )
    : null;
  const vaultRelativeToTarget = relative(target, VAULT_ROOT);
  const vaultInsideTarget =
    vaultRelativeToTarget === '' ||
    (!vaultRelativeToTarget.startsWith(`..${sep}`) && vaultRelativeToTarget !== '..');
  const uninitializedVault =
    vaultProjectNodes.length === 1 &&
    vaultProjectNodes[0].slug === 'project' &&
    /^my project$/i.test(String(vaultProjectNodes[0].title ?? ''));
  const validationAlignment = matchingVaultProject
    ? 'matching-project'
    : uninitializedVault
      ? 'uninitialized-vault'
      : vaultProjectNodes.length > 0 && analyzedProjectSlug
        ? 'mismatched-project'
        : 'unknown';
  const validationAppliesToAnalyzedProject =
    Boolean(matchingVaultProject) || (uninitializedVault && vaultInsideTarget);
  const validationNote = validationAppliesToAnalyzedProject
    ? validationAlignment === 'matching-project'
      ? 'The active vault project identity matches the analyzed repository.'
      : 'The starter vault is inside the analyzed repository; validation is a pre-bootstrap baseline.'
    : 'The active vault is not proven to describe the analyzed repository; treat these counts as active-vault diagnostics, not analyzed-project quality.';
  const existingSlugs = new Set((compiled.nodes ?? []).map((node) => node.slug));
  const aliasToSlug = compiled.indexes?.aliasToSlug ?? {};
  const ambiguousAliases = new Set(
    (compiled.ambiguousAliases ?? []).map((row) => row.alias),
  );
  const candidateSlugs = conceptCandidates.map((candidate) => candidate.slug);
  const existingConceptSlugs = candidateSlugs
    .filter((slug) => existingSlugs.has(slug) || aliasToSlug[slug])
    .sort();
  const ambiguousConceptSlugs = candidateSlugs
    .filter(
      (slug) =>
        !existingSlugs.has(slug) &&
        !aliasToSlug[slug] &&
        ambiguousAliases.has(slug),
    )
    .sort();
  const newConceptSlugs = candidateSlugs
    .filter(
      (slug) =>
        !existingSlugs.has(slug) &&
        !aliasToSlug[slug] &&
        !ambiguousAliases.has(slug),
    )
    .sort();
  const conceptDelta = {
    candidates: conceptCount,
    existing: existingConceptSlugs.length,
    ambiguous: ambiguousConceptSlugs.length,
    new: newConceptSlugs.length,
    limited: newConceptSlugs.length > 10 || ambiguousConceptSlugs.length > 10,
    sampleAmbiguousSlugs: ambiguousConceptSlugs.slice(0, 10),
    sampleNewSlugs: newConceptSlugs.slice(0, 10),
  };
  const importModuleEdges = thresholdApplied
    ? imports.moduleEdges.filter((edge) => Number(edge.count) >= thresholdApplied.threshold)
    : (imports?.moduleEdges ?? []);
  const packageImportEvidence = imports?.packageImportEvidence;
  const packageModuleEdges = thresholdApplied
    ? (packageImportEvidence?.moduleEdges ?? []).filter(
        (edge) => Number(edge.count) >= thresholdApplied.threshold,
      )
    : (packageImportEvidence?.moduleEdges ?? []);
  const importRelations = importModuleEdges.length + packageModuleEdges.length;
  const reviewCalls = [
    {
      tool: 'analyze_repo_structure',
      arguments: {
        rootPath: analyze.rootPath,
        ...(maxDepth !== undefined ? { maxDepth } : {}),
      },
    },
    ...(imports
      ? [{
          tool: 'infer_imports',
          arguments: {
            rootPath: analyze.rootPath,
            ...(maxFiles !== undefined ? { maxFiles } : {}),
          },
        }]
      : []),
  ];

  return {
    mode: 'plan',
    sideEffect: 0,
    rootPath: analyze.rootPath,
    vaultRoot: VAULT_ROOT,
    analyze: {
      framework: analyze.framework,
      project: analyze.project ?? null,
      domains: analyze.domains.length,
      capabilities: analyze.capabilities.length,
      elements: analyze.elements.length,
      suggestedRelations: analyze.suggestedRelations.length,
    },
    imports: imports
      ? {
          filesScanned: imports.filesScanned,
          moduleEdges: importModuleEdges.length,
          packageImports: packageImportEvidence?.packageImports?.length ?? 0,
          packageModuleEdges: packageModuleEdges.length,
          coverage: imports.coverage,
          ...(imports.staleEdgeFollowUp ? { staleEdgeFollowUp: imports.staleEdgeFollowUp } : {}),
          ...(thresholdApplied ? { thresholdApplied } : {}),
          ...(imports.reconciliationSummary ? { reconciliationSummary: imports.reconciliationSummary } : {}),
        }
      : null,
    plan: {
      concepts: conceptCount,
      conceptDelta,
      suggestedRelations: analyze.suggestedRelations.length,
      importRelations,
      phases: [
        'analyze_repo_structure',
        imports ? 'infer_imports' : 'infer_imports skipped',
        'validate_vault',
        'CLI index --apply may write analyzer concepts/containment; inferred imports remain rationale-review-required',
      ],
    },
    validation: {
      scanned: validation.scanned,
      problemFiles: validation.summary?.problemFiles ?? 0,
      errorFiles: validation.summary?.errorFiles ?? 0,
      warningFiles: validation.summary?.warningFiles ?? 0,
      pathDrift: validation.pathDrift?.drifts?.length ?? 0,
      appliesToAnalyzedProject: validationAppliesToAnalyzedProject,
      alignment: validationAlignment,
      note: validationNote,
    },
    meaningGate: {
      policy: analyze.meaningGate.policy,
      sourceStructureRole: analyze.meaningGate.sourceStructureRole,
      businessOntology: {
        domains: analyze.meaningGate.businessOntology.domains.length,
        capabilities: analyze.meaningGate.businessOntology.capabilities.length,
        evidence: analyze.meaningGate.businessOntology.evidence.length,
        evidenceRows: summarizeBusinessEvidenceRows(analyze.meaningGate.businessOntology.evidence),
      },
      proposedBusinessOntology: {
        domains: analyze.meaningGate.proposedBusinessOntology.domains.length,
        capabilities: analyze.meaningGate.proposedBusinessOntology.capabilities.length,
        domainRows: summarizeProposedBusinessConceptRows(
          analyze.meaningGate.proposedBusinessOntology.domains,
        ),
        capabilityRows: summarizeProposedBusinessConceptRows(
          analyze.meaningGate.proposedBusinessOntology.capabilities,
        ),
      },
      implementationEvidence: {
        elements: analyze.meaningGate.implementationEvidence.elements.length,
        reviewRequiredCapabilities:
          analyze.meaningGate.implementationEvidence.reviewRequiredCapabilities.length,
        reviewRequiredRows: summarizeReviewRequiredCapabilityRows(
          analyze.meaningGate.implementationEvidence.reviewRequiredCapabilities,
        ),
      },
      reviewQuestions: analyze.meaningGate.reviewQuestions,
    },
    extractionContract: analyze.extractionContract,
    semanticEvidence: analyze.semanticEvidence,
    configurationEvidence: analyze.configurationEvidence,
    next: {
      applyTool: 'add_concepts; add_relation only after semantic rationale + human approval',
      cliApply: 'ontology-atlas index [rootPath] --apply --vault [vault]',
      review: 'plan.concepts counts raw candidates, not accepted ontology claims; inspect extractionContract and proposedBusinessOntology, manually resolve ambiguous aliases, answer the competency questions, then run reviewCalls. CLI apply never promotes inferred imports to depends_on.',
      reviewCalls,
    },
  };
}

function summarizeBusinessEvidenceRows(rows) {
  return [...rows]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'capability' ? -1 : 1;
      return String(a.slug).localeCompare(String(b.slug));
    })
    .slice(0, MEANING_GATE_EVIDENCE_ROW_LIMIT)
    .map((row) => ({
      slug: row.slug,
      kind: row.kind,
      source: row.source,
    }));
}

function summarizeReviewRequiredCapabilityRows(rows) {
  return rows.slice(0, MEANING_GATE_REVIEW_ROW_LIMIT).map((row) => ({
    slug: row.slug,
    reason: row.reason,
    evidence: {
      source: row.evidence.source,
    },
  }));
}

function summarizeProposedBusinessConceptRows(rows) {
  return rows.slice(0, MEANING_GATE_REVIEW_ROW_LIMIT).map((row) => ({
    slug: row.slug,
    reason: row.reason,
    evidence: {
      source: row.evidence.source,
      ...(row.evidence.line ? { line: row.evidence.line } : {}),
    },
  }));
}

function publicBacklinkUpdates(result) {
  return {
    updates: result.updates,
    totalUpdated: result.totalUpdated,
  };
}

function renameConcept({ oldSlug, newSlug, confirm = false, overwrite = false, expected_mtime }) {
  requireNonBlankString(oldSlug, 'oldSlug');
  requireNonBlankString(newSlug, 'newSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(overwrite, 'overwrite');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (oldSlug === newSlug) {
    throw new Error('oldSlug and newSlug are identical.');
  }
  /*
   * ⚠️ **Names differing only in case are stopped here** (review 2026-08-16 — the
   * document actually disappearing was reproduced).
   *
   * The check above is a string comparison, so it treats `Auth` and `auth` as
   * different. macOS and Windows filesystems treat them as the **same file**, so
   * writing the new name and deleting the old one deleted what had just been
   * written — and this tool returned `ok: true, moved: true`. Measured:
   *
   * ```
   * rename_concept{oldSlug:"Auth", newSlug:"auth", confirm:true, overwrite:true}
   *   → ok:true, moved:true, backlinkUpdates:{totalUpdated:1}
   *   → neither Auth.md nor auth.md left on disk; references left dangling
   * ```
   *
   * The write layer guards it too (`applyAllOrNothing`'s same-file detection), but
   * that alone yields a **half-finished rename**: references point at the new name
   * while the filename on disk does not change. Half-finished is not success — say
   * plainly that it cannot be done here, and name the path that works.
   */
  if (oldSlug.toLowerCase() === newSlug.toLowerCase()) {
    throw new Error(
      `oldSlug and newSlug differ only in letter case ("${oldSlug}" → "${newSlug}"). ` +
        'On macOS and Windows those are the same file, so this rename would delete the ' +
        'document instead of renaming it. Rename through a different name first ' +
        `(for example "${newSlug}-tmp"), then to "${newSlug}".`,
    );
  }
  // Resolve the caller's spelling to the on-disk one before anything else. A
  // wrong-case oldSlug passes `existsSync` on macOS/Windows while every backlink
  // match below is case-sensitive — reproduced: rename deleted the document,
  // redirected 0 backlinks, and reported success (bug sweep 2026-09-01).
  const diskOldSlug = canonicalDiskSlug(VAULT_ROOT, oldSlug);
  if (!diskOldSlug) {
    throw new Error(missingSlugMessage('Source slug does not exist in vault', oldSlug));
  }
  requireNodeNotReservedForHuman(readDocIfPresent(diskOldSlug), 'rename_concept');
  const canonicalTarget = canonicalDiskSlug(VAULT_ROOT, newSlug);
  if (canonicalTarget && canonicalTarget !== newSlug) {
    throw new Error(
      `Target slug "${newSlug}" collides with existing "${canonicalTarget}" — the names ` +
        'differ only in letter case, which is the same file on macOS and Windows. ' +
        'Choose a different name or rename that document out of the way first.',
    );
  }
  const targetExists = vaultSlugExists(VAULT_ROOT, newSlug);
  if (!overwrite && targetExists) {
    throw new Error(
      `Target slug already exists: "${newSlug}". Pass overwrite: true to replace it.`,
    );
  }
  // **The destination is a write too** (Codex review, 2026-09-02). Guarding only
  // the source left `overwrite: true` as a door: the reserved document at the
  // destination was read, then replaced with the source's bytes, and its
  // reservation went with it. A refusal that covers the operand but not the
  // casualty is not a refusal.
  if (targetExists) {
    requireNodeNotReservedForHuman(readDocIfPresent(newSlug), 'rename_concept');
  }

  const sourcePath = slugToPath(VAULT_ROOT, diskOldSlug);
  const targetPath = slugToPath(VAULT_ROOT, newSlug);
  const sourceDoc = readDoc(VAULT_ROOT, sourcePath);
  const targetDoc = overwrite && targetExists ? readDoc(VAULT_ROOT, targetPath) : null;

  // Slug flatness — rename writes directly rather than through writeDoc, so the
  // same gate is applied here (closing the door on path-shaped identity returning
  // through rename).
  const renameSlugIssue = flatSlugIssue(sourceDoc.frontmatter?.kind, newSlug);
  if (renameSlugIssue) throw new Error(renameSlugIssue);

  // Source mtime conflict guard — compare against `expected` right after the read.
  if (typeof expected_mtime === 'number' && sourceDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(diskOldSlug, expected_mtime, sourceDoc.mtime);
  }

  // Step 1 — dry-run preview of every backlink rewrite.
  // An overwrite target is about to be replaced wholesale by the source document.
  // Planning backlink rewrites for that stale target inverts the order: right
  // after the source is written, the stale target overwrites it again.
  const replacedSlugs = overwrite ? [newSlug] : [];
  const preview = redirectBacklinks(VAULT_ROOT, diskOldSlug, newSlug, {
    dryRun: true,
    excludeSlugs: replacedSlugs,
  });

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({ dryRun: true, wouldChange: true }),
      uid: sourceDoc.frontmatter.uid,
      oldSlug: diskOldSlug,
      newSlug,
      sourcePath,
      targetPath,
      moved: false,
      backlinkUpdates: publicBacklinkUpdates(preview),
      message: `dry-run — pass confirm:true to actually move the file and redirect ${preview.totalUpdated} backlinks.`,
    };
  }

  /**
   * Step 2 — **three steps bound into one plan, applied all-or-nothing.**
   *
   * It used to write each step immediately in order: create the new file, rewrite
   * backlinks, delete the old file. The comment claimed *"partial failure doesn't
   * lose data"*, which was true (no data is lost) — but **the graph split**.
   * Measured 2026-08-01: with one of three references read-only, two nodes with
   * the same title remained and the references forked across both names. And
   * `validate` and `health` both called that vault clean. The tool description's
   * promise of "one atomic graph-level operation" was false.
   *
   * Now only the plan is built (`deferWrite`) and applied once at the end. On
   * failure it rolls back — as long as the process lives, the vault is as it started.
   */
  const nextFrontmatter = { ...sourceDoc.frontmatter };
  // Update `slug:` only when it mirrors the file slug. A differing value is a
  // user-facing alias (the dogfood vault's `project.md` carries
  // `slug: ontology-atlas`) that other documents reference by that spelling;
  // overwriting it with newSlug severed every alias-form ref while
  // backlinkUpdates reported nothing (bug sweep 2026-09-01).
  if (typeof nextFrontmatter.slug === 'string' && nextFrontmatter.slug.trim() === diskOldSlug) {
    nextFrontmatter.slug = newSlug;
  }
  const result = redirectBacklinks(VAULT_ROOT, diskOldSlug, newSlug, {
    dryRun: false,
    deferWrite: true,
    excludeSlugs: replacedSlugs,
  });
  applyAllOrNothing([
    {
      op: 'write',
      path: targetPath,
      content: buildMarkdown({ frontmatter: nextFrontmatter, body: sourceDoc.body }),
      ...(targetDoc
        ? { expectedRaw: targetDoc.raw, expectedMtime: targetDoc.mtime }
        : { expectedAbsent: true }),
    },
    ...result.plan,
    // Deletion is last, and the plan preserves that order. Rollback runs in
    // reverse, so the old file is restored before the new one is removed.
    ...(sourcePath !== targetPath
      ? [{
          op: 'delete',
          path: sourcePath,
          expectedRaw: sourceDoc.raw,
          expectedMtime: sourceDoc.mtime,
        }]
      : []),
  ], { requireRevisions: true });

  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    uid: sourceDoc.frontmatter.uid,
    oldSlug: diskOldSlug,
    newSlug,
    sourcePath,
    targetPath,
    moved: true,
    backlinkUpdates: publicBacklinkUpdates(result),
    changed: true,
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function looksLikeGeneratedStarter(body, kind) {
  const text = String(body || '');
  if (text.length > 800) return false;
  const markers = {
    project: /One- or two-line summary of this project/i,
    domain: /(?:Describe the stable responsibility or problem boundary|A \*domain\* is a large area of the project)/i,
    capability: /(?:Describe the observable, implementation-independent ability|A \*capability\* is one user-visible feature)/i,
    element: /(?:Describe the distinct implementation role|implementation element)/i,
    document: /(?:State what this narrative or reference artifact explains|source document)/i,
  };
  return Boolean(markers[kind]?.test(text));
}

function reclassifyConcept({ slug, newKind, newSlug, domain, body, confirm = false, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireNonBlankString(newKind, 'newKind');
  if (!ADD_CONCEPT_KINDS.has(newKind)) throw new Error(formatAllowedValueError('newKind', newKind, [...ADD_CONCEPT_KINDS]));
  requireOptionalNonBlankString(newSlug, 'newSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (domain !== undefined && domain !== null) requireNonBlankString(domain, 'domain');
  if (body !== undefined && typeof body !== 'string') throw new Error('body must be a string.');
  if ((newKind === 'capability' || newKind === 'element') && (domain === undefined || domain === null)) {
    throw new Error(`domain is required when reclassifying to kind "${newKind}".`);
  }
  const canonicalOld = resolveExistingVaultSlug(slug);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalOld ?? slug), 'reclassify_concept');
  if (!canonicalOld) throw new Error(missingSlugMessage('Source slug does not exist in vault', slug));
  const canonicalNew = newSlug || canonicalOld;
  if (canonicalNew !== canonicalOld && vaultSlugExists(VAULT_ROOT, canonicalNew)) throw new Error(`Target slug already exists: "${canonicalNew}".`);
  const sourcePath = slugToPath(VAULT_ROOT, canonicalOld);
  const targetPath = slugToPath(VAULT_ROOT, canonicalNew);
  const sourceDoc = readDoc(VAULT_ROOT, sourcePath);
  if (typeof expected_mtime === 'number' && sourceDoc.mtime !== expected_mtime) throw new VaultConflictError(canonicalOld, expected_mtime, sourceDoc.mtime);
  const oldKind = sourceDoc.frontmatter.kind;
  // Slug flatness — reclassify writes directly too, so the new (kind, slug) pair is measured.
  const reclassifySlugIssue = flatSlugIssue(newKind, canonicalNew);
  if (reclassifySlugIssue) throw new Error(reclassifySlugIssue);
  const title = sourceDoc.frontmatter.title || canonicalNew.split('/').pop();
  let nextBody = sourceDoc.body;
  let bodyAction = 'preserved';
  if (body !== undefined) {
    nextBody = body;
    bodyAction = 'replaced_explicitly';
  } else if (looksLikeGeneratedStarter(sourceDoc.body, oldKind)) {
    nextBody = defaultBody(newKind, title);
    bodyAction = 'regenerated_starter';
  }
  const backlinkUpdates = canonicalNew === canonicalOld
    ? { updates: [], totalUpdated: 0 }
    : redirectBacklinks(VAULT_ROOT, canonicalOld, canonicalNew, { dryRun: true });
  const dryRun = !confirm;
  const base = {
    ok: false,
    dryRun,
    changed: false,
    ...destructivePreviewState({ dryRun, wouldChange: true }),
    uid: sourceDoc.frontmatter.uid,
    oldSlug: canonicalOld,
    newSlug: canonicalNew,
    oldKind,
    newKind,
    sourcePath,
    targetPath,
    bodyAction,
    backlinkUpdates: publicBacklinkUpdates(backlinkUpdates),
  };
  if (!confirm) return base;
  const nextFrontmatter = { ...sourceDoc.frontmatter, kind: newKind };
  // Same alias rule as rename_concept: only a `slug:` mirroring the file slug
  // follows the move; a differing value is a referenced user-facing alias.
  if (typeof nextFrontmatter.slug !== 'string' || nextFrontmatter.slug.trim() === canonicalOld) {
    nextFrontmatter.slug = canonicalNew;
  }
  if (domain === null || !['capability', 'element'].includes(newKind)) delete nextFrontmatter.domain;
  else if (domain !== undefined) nextFrontmatter.domain = domain;
  // One plan, for the same reason as rename: this tool also creates a file,
  // rewrites backlinks, and deletes the old file, and stopping midway left a
  // half-vault with a forked kind.
  const appliedBacklinks = canonicalNew === canonicalOld
    ? backlinkUpdates
    : redirectBacklinks(VAULT_ROOT, canonicalOld, canonicalNew, { dryRun: false, deferWrite: true });
  applyAllOrNothing([
    {
      op: 'write',
      path: targetPath,
      content: buildMarkdown({ frontmatter: nextFrontmatter, body: nextBody }),
      ...(sourcePath === targetPath
        ? { expectedRaw: sourceDoc.raw, expectedMtime: sourceDoc.mtime }
        : { expectedAbsent: true }),
    },
    ...(appliedBacklinks.plan ?? []),
    ...(sourcePath !== targetPath
      ? [{
          op: 'delete',
          path: sourcePath,
          expectedRaw: sourceDoc.raw,
          expectedMtime: sourceDoc.mtime,
        }]
      : []),
  ], { requireRevisions: true });
  return {
    ...base,
    ok: true,
    dryRun: false,
    changed: true,
    backlinkUpdates: publicBacklinkUpdates(appliedBacklinks),
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function mergeConcepts({ fromSlug, intoSlug, confirm = false, expected_mtime, expected_into_mtime }) {
  requireNonBlankString(fromSlug, 'fromSlug');
  requireNonBlankString(intoSlug, 'intoSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  requireOptionalNonNegativeNumber(expected_into_mtime, 'expected_into_mtime');
  if (fromSlug === intoSlug) {
    throw new Error('fromSlug and intoSlug are identical.');
  }
  // Operate on the disk's spelling, not the caller's — a wrong-case slug passes
  // `existsSync` on macOS/Windows while backlink matching is case-sensitive, so
  // the merge would delete the source and redirect nothing (bug sweep 2026-09-01).
  const diskFromSlug = canonicalDiskSlug(VAULT_ROOT, fromSlug);
  if (!diskFromSlug) {
    throw new Error(missingSlugMessage('fromSlug does not exist in vault', fromSlug));
  }
  requireNodeNotReservedForHuman(readDocIfPresent(diskFromSlug), 'merge_concepts');
  const diskIntoSlug = canonicalDiskSlug(VAULT_ROOT, intoSlug);
  requireNodeNotReservedForHuman(readDocIfPresent(diskIntoSlug), 'merge_concepts');
  if (!diskIntoSlug) {
    throw new Error(missingSlugMessage('intoSlug does not exist in vault', intoSlug));
  }
  if (diskFromSlug === diskIntoSlug) {
    throw new Error(
      `fromSlug and intoSlug name the same document on disk ("${diskFromSlug}") — ` +
        'the spellings differ only in letter case.',
    );
  }
  fromSlug = diskFromSlug;
  intoSlug = diskIntoSlug;

  const fromPath = slugToPath(VAULT_ROOT, fromSlug);
  const fromDoc = readDoc(VAULT_ROOT, fromPath);
  const intoPath = slugToPath(VAULT_ROOT, intoSlug);
  const intoDoc = readDoc(VAULT_ROOT, intoPath);
  const identityHistory = mergeNodeIdentityHistory(fromDoc.frontmatter, intoDoc.frontmatter);
  const absorbedUids = identityHistory.absorbedUids;

  // R11 closeout — fromSlug mtime conflict guard.
  if (typeof expected_mtime === 'number' && fromDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(fromSlug, expected_mtime, fromDoc.mtime);
  }
  if (typeof expected_into_mtime === 'number' && intoDoc.mtime !== expected_into_mtime) {
    throw new VaultConflictError(intoSlug, expected_into_mtime, intoDoc.mtime);
  }

  const preview = redirectBacklinks(VAULT_ROOT, fromSlug, intoSlug, { dryRun: true });

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({ dryRun: true, wouldChange: true }),
      fromUid: fromDoc.frontmatter.uid,
      intoUid: intoDoc.frontmatter.uid,
      absorbedUids,
      fromSlug,
      intoSlug,
      fromPath,
      deleted: false,
      backlinkUpdates: publicBacklinkUpdates(preview),
      capturedFrom: {
        frontmatter: fromDoc.frontmatter,
        bodyExcerpt: extractSummaryExcerpt(fromDoc.body, 200),
      },
      message: `dry-run — pass confirm:true to redirect ${preview.totalUpdated} backlinks and then permanently delete ${fromSlug}.md.`,
    };
  }

  // Rewrite plus delete in one plan. Rewrites used to be written per file
  // immediately with the delete separate — if one file failed to write, only some
  // references pointed at the new name and `fromSlug` survived (and both checks
  // reported clean).
  const result = redirectBacklinks(VAULT_ROOT, fromSlug, intoSlug, {
    dryRun: false,
    deferWrite: true,
  });
  const intoPlanIndex = result.plan.findIndex((operation) => operation.path === intoPath);
  const redirectedInto = intoPlanIndex >= 0
    ? parseFrontmatter(result.plan[intoPlanIndex].content)
    : { frontmatter: intoDoc.frontmatter, body: intoDoc.body };
  const intoIdentityWrite = {
    op: 'write',
    path: intoPath,
    expectedRaw: intoDoc.raw,
    expectedMtime: intoDoc.mtime,
    content: buildMarkdown({
      frontmatter: {
        ...redirectedInto.frontmatter,
        uid: identityHistory.survivorUid,
        merged_uids: identityHistory.merged_uids,
      },
      body: redirectedInto.body,
    }),
  };
  if (intoPlanIndex >= 0) result.plan[intoPlanIndex] = intoIdentityWrite;
  else result.plan.push(intoIdentityWrite);
  applyAllOrNothing([
    ...result.plan,
    {
      op: 'delete',
      path: fromPath,
      expectedRaw: fromDoc.raw,
      expectedMtime: fromDoc.mtime,
    },
  ], { requireRevisions: true });

  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    fromUid: fromDoc.frontmatter.uid,
    intoUid: intoDoc.frontmatter.uid,
    absorbedUids,
    fromSlug,
    intoSlug,
    fromPath,
    deleted: true,
    backlinkUpdates: publicBacklinkUpdates(result),
    changed: true,
    capturedFrom: {
      frontmatter: fromDoc.frontmatter,
      body: fromDoc.body,
      bodyExcerpt: extractSummaryExcerpt(fromDoc.body, 200),
    },
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

const ABSORB_BACKUP_SUFFIX = '.pre-absorb.bak';

// Slice 0 — absorb_document. Mirror of cli/src/commands/absorb.mjs's write
// path; core plan logic lives in ./absorb.mjs (mirrored at
// cli/src/lib/absorb.mjs, kept in lock-step by
// tests/contract/absorb.contract.test.ts).
/**
 * `review_state: human_decides` on the file `absorb_document` was pointed at.
 *
 * Absorption is the one write path whose target is named by absolute path rather
 * than by slug, so it never reaches the slug-based guard or the plan guard. A
 * file that is not a reserved node returns null and absorption proceeds.
 */
function reservedSourceIssue(absolutePath) {
  let frontmatter;
  try {
    frontmatter = parseFrontmatter(readFileSync(absolutePath, 'utf-8')).frontmatter ?? {};
  } catch {
    return null;
  }
  if (frontmatter[REVIEW_STATE_KEY] !== REVIEW_STATE_HUMAN_DECIDES) return null;
  const note = frontmatter[REVIEW_NOTE_KEY];
  const slug = typeof frontmatter.slug === 'string' ? frontmatter.slug : absolutePath;
  return (
    `${slug} carries ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES}, so it is reserved for a person and absorbing it would rewrite it` +
    (note ? ` — what they have to decide: ${note}` : '') +
    '. Report it and let the person decide.'
  );
}

function absorbDocumentTool({ filePath, confirm = false, allowOutsideRepo = false }) {
  requireNonBlankString(filePath, 'filePath');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(allowOutsideRepo, 'allowOutsideRepo');
  const requestedPath = resolve(filePath);
  if (!existsSync(requestedPath) || !statSync(requestedPath).isFile()) {
    throw new Error(`file not found: ${requestedPath}`);
  }
  // Resolve symlinks before enforcing the boundary. Otherwise a path that
  // appears to live inside repoRoot could rewrite a target outside it.
  const abs = realpathSync(requestedPath);
  const canonicalRepoRoot = realpathSync(REPO_ROOT);
  const repoRelative = relative(canonicalRepoRoot, abs);
  const outsideRepo = repoRelative === '..' || repoRelative.startsWith(`..${sep}`);
  const backupPath = `${abs}${ABSORB_BACKUP_SUFFIX}`;
  const blockedReasons = [
    ...(outsideRepo && !allowOutsideRepo
      ? [
          `source file is outside repoRoot (${canonicalRepoRoot}); repeat with allowOutsideRepo:true only after reviewing the absolute path`,
        ]
      : []),
    ...(existsSync(backupPath)
      ? [`backup already exists and would be overwritten: ${backupPath}`]
      : []),
    // **Absorption rewrites its source**, and a source can be a vault node a
    // person reserved (Codex review, 2026-09-02). It does not go through the
    // multi-file plan guard, so the refusal has to be stated here. A backup
    // makes the rewrite recoverable; it does not make it permitted.
    ...(reservedSourceIssue(abs) ? [reservedSourceIssue(abs)] : []),
  ];
  const raw = readFileSync(abs, 'utf-8');
  const sourceLabel = basename(abs).replace(/\.md$/i, '');
  const plan = buildAbsorptionPlan(raw, {
    sourceLabel,
    isSlugTaken: (slug) => existsSync(slugToPath(VAULT_ROOT, slug)),
  });

  const sectionsOut = plan.sections.map((section) => ({
    heading: section.heading,
    category: section.category,
    kind: section.kind,
    role: section.role,
    confidence: section.confidence,
    action: section.action,
    targetSlug: section.targetSlug,
    injectionSuspect: section.injection.suspect,
    injectionMatches: section.injection.matches.map((m) => m.pattern),
  }));

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({
        dryRun: true,
        wouldChange: true,
        blockedReasons,
      }),
      filePath: abs,
      outsideRepo,
      sourceLabel,
      title: plan.title,
      summary: plan.summary,
      sections: sectionsOut,
      message:
        `dry-run — ${plan.summary.absorbed} section(s) would be absorbed as document/policy nodes, ` +
        `${plan.summary.suggested} suggested (not written), ${plan.summary.injectionSuspect} injection-suspect ` +
        `(excluded from absorption). ` +
        (blockedReasons.length > 0
          ? `Confirmation is blocked: ${blockedReasons.join('; ')}.`
          : 'Pass confirm:true to write.'),
    };
  }

  // **The dry-run branch reports; this branch blocks.** `blockedReasons` is
  // assembled above for the preview and never consulted here — each condition is
  // re-thrown on the write path individually. A refusal added to the list alone
  // would read as enforced and write anyway, which is how this one was found
  // (Codex review, 2026-09-02: the first fix landed in the list and the test
  // still recorded `ok: true, dryRun: false`).
  const reservedSource = reservedSourceIssue(abs);
  if (reservedSource) {
    throw new Error(`absorb_document blocked: ${reservedSource}`);
  }
  if (outsideRepo && !allowOutsideRepo) {
    throw new Error(
      `absorb_document blocked: source file is outside repoRoot (${canonicalRepoRoot}): ${abs}. ` +
        'Run a dry-run, review the absolute path, then pass allowOutsideRepo:true only if this rewrite is intended.',
    );
  }
  if (existsSync(backupPath)) {
    throw new Error(
      `backup already exists, refusing to overwrite: ${backupPath} — remove or rename it first.`,
    );
  }

  /*
   * All-or-nothing (2026-09-01 review): rename/merge/reclassify apply their
   * multi-file writes as one unit, and absorption has the same shape — N new
   * node files plus one source rewrite. Writing sections in a bare loop meant a
   * mid-loop failure (a slug created concurrently, EACCES, ENOSPC) left a
   * half-absorbed vault, and the retry re-planned around the already-landed
   * files into `-2`-suffixed duplicates. writeDoc still performs each write
   * (slug/identity validation, uid minting, the growth gate); the pre-check
   * refuses before anything lands and the rollback removes what this call
   * created — every written file is new, so unlink restores the vault.
   */
  const absorbSections = plan.sections.filter((section) => section.action === 'absorb');
  for (const section of absorbSections) {
    if (existsSync(slugToPath(VAULT_ROOT, section.targetSlug))) {
      throw new Error(
        `absorb_document refused before writing anything: "${section.targetSlug}" already exists ` +
          '(created since the dry-run). The vault is unchanged — run the dry-run again and re-confirm.',
      );
    }
  }
  const written = [];
  try {
    for (const section of absorbSections) {
      const fm = buildFrontmatter({
        slug: section.targetSlug,
        kind: 'document',
        title: section.targetTitle,
        role: 'policy',
        source: relative(VAULT_ROOT, abs),
        // Absorption is a write through this server too — same stamp, same identity source.
        [CREATED_BY_KEY]: agentProvenance(),
      });
      const body = `# ${section.targetTitle}\n\n${section.body}\n`;
      const writtenPath = writeDoc(VAULT_ROOT, section.targetSlug, { frontmatter: fm, body });
      written.push({ slug: section.targetSlug, filePath: writtenPath });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rollbackFailures = [];
    for (const entry of written) {
      try {
        unlinkSync(entry.filePath);
      } catch (rollbackError) {
        rollbackFailures.push(`${entry.filePath} (${rollbackError?.code ?? rollbackError})`);
      }
    }
    if (rollbackFailures.length > 0) {
      // Saying "I do not know" beats saying "it is fine" — name what was left behind.
      throw new Error(
        `absorb_document failed mid-write AND rollback could not remove ${rollbackFailures.length} file(s):\n  ` +
          `${rollbackFailures.join('\n  ')}\nRemove them by hand before retrying. Original error: ${message}`,
      );
    }
    throw new Error(
      `absorb_document failed before completing; every section written by this call was rolled back ` +
        `and the vault is unchanged. Original error: ${message}`,
    );
  }

  // Backup *after* the vault writes succeed — if a write throws above, the
  // original source file is left untouched and the caller can retry safely.
  copyFileSync(abs, backupPath);
  const pointer = buildSlimPointer(plan);
  // Atomic replace: a bare writeFileSync truncates the user's document first,
  // so a death between truncate and write destroyed the very file being absorbed.
  writeFileAtomically(abs, pointer);

  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    filePath: abs,
    outsideRepo,
    sourceLabel,
    title: plan.title,
    summary: plan.summary,
    sections: sectionsOut,
    written,
    backupPath,
    changed: true,
    message: `absorbed ${written.length} section(s) into the vault; source rewritten as a slim pointer (backup at ${backupPath}).`,
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function deleteConcept({ slug, confirm = false, force = false, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(force, 'force');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  // Existence check, so a dry run never falsely reports "deletable". (deleteDoc
  // throws again at the real delete step, but the dry-run path never reaches
  // deleteDoc, hence the separate check.)
  let filePath = slugToPath(VAULT_ROOT, slug);
  // Resolve to the disk's spelling before the backlink safety check — a
  // wrong-case slug passes `existsSync` on macOS/Windows while `findBacklinks`
  // matches case-sensitively, so a referenced node was deletable without force
  // and without a warning (bug sweep 2026-09-01).
  const diskSlug = canonicalDiskSlug(VAULT_ROOT, slug);
  if (!diskSlug) {
    throw new Error(missingSlugMessage('Doc not found', slug));
  }
  slug = diskSlug;
  filePath = slugToPath(VAULT_ROOT, slug);
  const sourceDoc = readDoc(VAULT_ROOT, filePath);
  requireNodeNotReservedForHuman(sourceDoc, 'delete_concept');
  // Ambiguous-tail referrers included: a doc whose ref merely *could* mean this
  // node still blocks an un-forced delete (bug sweep 2026-09-01).
  const backlinks = findBacklinks(VAULT_ROOT, slug, { includeAmbiguousTailRefs: true });

  if (!confirm) {
    const blockedReasons =
      backlinks.length > 0 && !force
        ? [`${backlinks.length} backlink(s) require force:true before confirmation`]
        : [];
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({
        dryRun: true,
        wouldChange: true,
        blockedReasons,
      }),
      uid: sourceDoc.frontmatter.uid,
      slug,
      filePath,
      backlinks,
      message:
        backlinks.length > 0
          ? `dry-run — ${backlinks.length} backlinks point here, so confirm:true alone is refused. Pass force:true as well to push through.`
          : 'dry-run — pass confirm:true to delete it for real.',
    };
  }

  if (backlinks.length > 0 && !force) {
    throw new Error(
      `Refusing to delete: ${backlinks.length} backlinks point here: ` +
        backlinks.map((b) => b.slug).join(', ') +
        ' — force:true pushes through (the referring nodes are left dangling).',
    );
  }

  const deleted = deleteDoc(VAULT_ROOT, slug, {
    expectedMtime: typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    uid: deleted.frontmatter.uid,
    slug,
    filePath: deleted.filePath ?? filePath,
    forced: backlinks.length > 0 ? true : undefined,
    backlinksAtDelete: backlinks.length > 0 ? backlinks : undefined,
    changed: true,
    captured: {
      frontmatter: deleted.frontmatter,
      body: deleted.body,
      bodyExcerpt: extractSummaryExcerpt(deleted.body, 200),
    },
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function missingSlugMessage(prefix, slug, { createHint = false } = {}) {
  const suggestions = suggestSimilarSlugs(VAULT_ROOT, slug);
  const lines = [
    `${prefix}: "${slug}". Use list_concepts() to see all slugs, or find_evidence({title:"${slug}"}) to search by title.`,
  ];
  if (createHint) {
    lines.push('If the endpoint is real but absent, create it first with add_concept(slug, kind, title).');
  }
  if (suggestions.length > 0) {
    lines.push(`Similar slugs in this vault: ${suggestions.map((s) => `"${s}"`).join(', ')}.`);
  }
  return lines.join(' ');
}

// ── Boot ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[ontology-atlas-mcp] connected. vault=${VAULT_ROOT}`);
