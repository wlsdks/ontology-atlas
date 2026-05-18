import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

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
} from './ontology-engine.mjs';

import {
  advisoryHealthChecksSummary,
  advisoryNextActionsSummary,
  analyzeRepoStructureFailure,
  batchCapFailure,
  batchRowIsolationFailure,
  buildFirstContactRequests,
  buildGetConceptSmokeSlug,
  buildGetConceptsSmokeSlugs,
  buildDestructiveDryRunSmokeRequests,
  buildPatchConflictGuardSmokeRequest,
  buildDirectGraphReadSmokeRequests,
  buildLimitedQueryConceptsSmokeRequest,
  buildGraphQuerySmokeArgs,
  buildGraphQuerySmokeRequests,
  compileFullArtifactFailure,
  compileIndexesFailure,
  compileIndexesSummary,
  compileSummaryFailure,
  diagnosisBlockingFailure,
  diagnosisIssueCount,
  destructiveDryRunFailure,
  destructiveDryRunSmokeFailure,
  DYNAMIC_FIRST_CONTACT_RESPONSE_IDS,
  patchConflictGuardFailure,
  EXPECTED_DESTRUCTIVE_TOOLS,
  EXPECTED_IDEMPOTENT_TOOLS,
  EXPECTED_READ_TOOLS,
  EXPECTED_TOOLS,
  EXPECTED_WRITE_TOOLS,
  FIRST_CONTACT_RESPONSE_LABELS,
  OPTIONAL_FIRST_CONTACT_RESPONSE_IDS,
  expectedToolTitle,
  expectedToolSplitLabel,
  firstContactMissingResponseLabels,
  firstContactErrorFailure,
  findBacklinksFailure,
  findEvidenceFailure,
  findNeighborsFailure,
  findOrphansFailure,
  findPathFailure,
  formatCount,
  formatHopCount,
  getConceptFailure,
  getConceptsFailure,
  hasAllFirstContactResponses,
  hasFirstContactErrorResponse,
  healthChecksSummary,
  healthSummary,
  initialExpectedFirstContactIds,
  inferImportsFailure,
  importModuleEdgeKindOutputSummary,
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  initializeInstructionsFailure,
  listConceptsFailure,
  listKindsFailure,
  limitedQueryConceptsFailure,
  maintenanceFilterEnumSummary,
  maintenanceBucketOutputSummary,
  maintenanceMissingCursorFailure,
  maintenanceNextActionOutputSummary,
  maintenanceReadyCursorFailure,
  maintenanceResumeCursorFailure,
  overviewFailure,
  overviewQueryPlanFailure,
  parserSmokeFailure,
  parseVerifyArgs,
  parseVerifyKillGraceMs,
  parseVerifyTimeoutMs,
  normalizeVerifyArgs,
  resolveVerifyVault,
  neighborsFailure,
  pathQueryFailure,
  projectProbeFailure,
  projectMapQueryPlanFailure,
  projectScopeFailure,
  queryConceptsFailure,
  serverStartupFailure,
  serverSignalFailure,
  strictArgsFailure,
  strictMultiArgsFailure,
  strictUnknownToolFailure,
  strictEnumFailure,
  strictGraphKindFilterFailure,
  strictRecommendRelationsKindFilterFailure,
  strictMatchNodesSortFailure,
  strictMatchEdgesTypeFailure,
  strictMaintenanceFilterFailure,
  strictRelationFilterFailure,
  strictFindNeighborsTypeFailure,
  strictFindOrphansKindFailure,
  strictQueryConceptsFilterFailure,
  strictListConceptsKindFailure,
  strictRelationCheckFailure,
  strictAddRelationFailure,
  structuredContentFailure,
  structuredContentMismatchSummary,
  structuredContentParityStatus,
  structuredContentVerifySummary,
  expectedToolsListAnnotationSummary,
  tunedHealthScopeOutputSummary,
  tunedWorkspaceBriefScopeOutputSummary,
  toolsListAnnotationSummary,
  toolsListInventoryFailure,
  toolsListSchemaFailure,
  VAULT_ISSUE_CODE_VALUES,
  validationCodeSummary,
  validateVaultFailure,
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
  verifyCountConsistencyFailure,
  verifyCountConsistencySummary,
  verifyKillGraceValueErrorMessage,
  verifyRetryEnvForVault,
  verifyRetryExample,
  verifySuccessMessage,
  verifyTimeoutFailure,
  verifyTimeoutValueErrorMessage,
  verifyUsage,
  verifyVaultPathError,
  emptyVerifyVaultFailure,
  vaultWarningsFailure,
  workspaceBriefSummary,
} from '../scripts/verify.mjs';
import { expectedResponseIds, missingResponseLabels } from '../scripts/json-rpc-lines.mjs';
import { GRAPH_ARRAY_KEYS } from './vault.mjs';
import { assertPnpmScriptsExist } from '../../scripts/lib/pnpm-script-refs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const ROOT_PKG = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
const VERIFY_SCRIPT = join(__dirname, '..', 'scripts', 'verify.mjs');

function strictErrorResponse(text, extraResult = {}) {
  return {
    result: {
      isError: true,
      content: [{ text }],
      structuredContent: {
        ok: false,
        errorCode: 'invalid_arguments',
        error: text,
        ...structuredValueRepairDetails(text),
      },
      ...extraResult,
    },
  };
}

function structuredValueRepairDetails(text) {
  const allowedValue = String(text).match(/^(.+?) must be one of: (.+)\. Received: "([^"]+)"\.(?: Did you mean "([^"]+)"\?)?$/i);
  if (!allowedValue) return {};
  const [, valueName, allowedText, receivedValue, suggestion] = allowedValue;
  return {
    valueName,
    receivedValue,
    ...(suggestion ? { suggestion } : {}),
    allowedValues: allowedText.split(',').map((value) => value.trim()).filter(Boolean),
  };
}

describe('verify.mjs first-contact gates', () => {
  it('keeps package metadata tool count aligned with verify inventory', () => {
    const described = MCP_PKG.description.match(/(\d+) tools \((\d+) read \+ (\d+) write\)/);
    assert.ok(described, 'package description must include tool count and read/write split');
    assert.equal(described[1], String(EXPECTED_TOOLS.length));
    assert.equal(described[2], String(EXPECTED_READ_TOOLS.length));
    assert.equal(described[3], String(EXPECTED_WRITE_TOOLS.length));
    assert.equal(expectedToolSplitLabel(), `${described[2]} read + ${described[3]} write`);
  });

  it('summarizes tools/list annotation coverage for verify output', () => {
    const readTools = new Set(EXPECTED_READ_TOOLS);
    const destructiveTools = new Set(EXPECTED_DESTRUCTIVE_TOOLS);
    const idempotentTools = new Set(EXPECTED_IDEMPOTENT_TOOLS);
    const tools = EXPECTED_TOOLS.map((name) => ({
      name,
      annotations: {
        title: expectedToolTitle(name),
        readOnlyHint: readTools.has(name),
        destructiveHint: destructiveTools.has(name),
        idempotentHint: idempotentTools.has(name),
        openWorldHint: false,
      },
    }));

    assert.equal(
      toolsListAnnotationSummary(tools),
      expectedToolsListAnnotationSummary(),
    );

    tools.find((tool) => tool.name === 'list_concepts').annotations.openWorldHint = true;
    assert.equal(
      toolsListAnnotationSummary(tools),
      '23/23 titled; 15/15 read; 8/8 write; 3/3 destructive; 2/2 idempotent; 22/23 local-only',
    );
    assert.equal(toolsListAnnotationSummary(null), 'missing tools/list');
  });

  it('fails ambiguous tools/list inventory before schema checks', () => {
    const tools = EXPECTED_TOOLS.map((name) => ({ name }));
    assert.equal(toolsListInventoryFailure(tools), null);
    assert.equal(toolsListInventoryFailure(null), 'no tools/list response');
    assert.equal(
      toolsListInventoryFailure([
        ...tools,
        { name: 'list_concepts' },
      ]),
      'tools mismatch — missing: (none), extra: (none), duplicates: list_concepts, invalidNames: 0',
    );
    assert.equal(
      toolsListInventoryFailure(tools.filter((tool) => tool.name !== 'get_concept')),
      'tools mismatch — missing: get_concept, extra: (none), duplicates: (none), invalidNames: 0',
    );
    assert.equal(
      toolsListInventoryFailure([
        ...tools,
        { name: 'unknown_tool' },
      ]),
      'tools mismatch — missing: (none), extra: unknown_tool, duplicates: (none), invalidNames: 0',
    );
    assert.equal(
      toolsListInventoryFailure([
        ...tools,
        { name: '' },
        {},
      ]),
      'tools mismatch — missing: (none), extra: (none), duplicates: (none), invalidNames: 2',
    );
  });

  it('formats row counts for human-facing verify output', () => {
    assert.equal(formatCount(0, 'partial row'), '0 partial rows');
    assert.equal(formatCount(1, 'partial row'), '1 partial row');
    assert.equal(formatCount(2, 'ok row'), '2 ok rows');
  });

  it('formats infer_imports module edge kind evidence for verify output', () => {
    assert.equal(
      importModuleEdgeKindOutputSummary([
        {
          from: 'capabilities/auth',
          to: 'capabilities/user',
          count: 3,
          kindCounts: { static: 2, dynamic: 1 },
        },
        {
          from: 'capabilities/billing',
          to: 'elements/src/shared/api',
          count: 1,
          kindCounts: { reexport: 1 },
        },
      ]),
      'capabilities/auth->capabilities/user x3 (static:2/dynamic:1), capabilities/billing->elements/src/shared/api x1 (reexport:1)',
    );
    assert.equal(
      importModuleEdgeKindOutputSummary([
        { from: 'a', to: 'b', count: 1, kindCounts: { static: 1 } },
        { from: 'c', to: 'd', count: 1, kindCounts: { require: 1 } },
        { from: 'e', to: 'f', count: 1, kindCounts: { side: 1 } },
      ], 2),
      'a->b x1 (static:1), c->d x1 (require:1), +1 more',
    );
    assert.equal(importModuleEdgeKindOutputSummary([]), 'none');
  });

  it('fails tools/list schema drift for strict arguments, graph-query enums, batch caps, and write safety', () => {
    const postWriteDescription =
      'postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers';
    const compactProposedActionTools = ['add_concept', 'add_relation', 'patch_concept'];
    const maintenanceSummaryRequired = [
      'totalActions',
      'filteredActions',
      'remainingActions',
      'executableActions',
      'reviewActions',
      'compileIssues',
      'dependencyCycles',
      'canonicalizationActions',
      'danglingReferences',
      'relationRecommendations',
      'externalElementRefs',
      'externalElementRefsIgnored',
      'unassignedNodes',
      'emptyDomains',
    ];
    const compactNodeSchema = {
      type: 'object',
      required: ['slug', 'kind', 'title'],
      properties: {
        slug: { type: 'string' },
        kind: { type: 'string', enum: NODE_KIND_VALUES },
        title: { type: 'string' },
      },
      additionalProperties: false,
    };
    const relationArrayPatchSchema = {
      type: 'object',
      properties: Object.fromEntries(
        GRAPH_ARRAY_KEYS.map((key) => [key, { type: 'array', items: { type: 'string', minLength: 1 } }]),
      ),
      additionalProperties: false,
    };
    const conceptNeighborsSchema = {
      type: 'object',
      required: ['domains', 'domain', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes'],
      properties: {
        domains: { type: 'array', items: { type: 'string' } },
        domain: { type: ['string', 'null'] },
        capabilities: { type: 'array', items: { type: 'string' } },
        elements: { type: 'array', items: { type: 'string' } },
        dependencies: { type: 'array', items: { type: 'string' } },
        relates: { type: 'array', items: { type: 'string' } },
        contains: { type: 'array', items: { type: 'string' } },
        describes: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    };
    const outgoingEdgesSchema = {
      type: 'array',
      items: {
        type: 'object',
        required: ['to', 'via'],
        properties: {
          to: { type: 'string' },
          via: { type: 'string' },
        },
        additionalProperties: false,
      },
    };
    const vaultWarningsSchema = {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'severity', 'message'],
        properties: {
          code: { type: 'string', enum: VAULT_ISSUE_CODE_VALUES },
          severity: { type: 'string', enum: ['error', 'warning'] },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
    };
    const nonBlankStringSchema = {
      type: 'string',
      minLength: 1,
      pattern: '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$',
    };
    const nonBlankStringOrArraySchema = {
      type: ['array', 'string'],
      minLength: 1,
      pattern: '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$',
      items: nonBlankStringSchema,
    };
    const backlinkKeyChangeSchema = {
      type: 'object',
      required: ['key'],
      properties: {
        key: nonBlankStringSchema,
        before: nonBlankStringOrArraySchema,
        after: nonBlankStringOrArraySchema,
      },
      additionalProperties: false,
    };
    const backlinkRewritePlanSchema = {
      type: 'object',
      required: ['updates', 'totalUpdated'],
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            required: ['slug', 'title', 'beforeKeys', 'afterKeys', 'bodyChanged'],
            properties: {
              slug: nonBlankStringSchema,
              title: nonBlankStringSchema,
              beforeKeys: { type: 'array', items: backlinkKeyChangeSchema },
              afterKeys: { type: 'array', items: backlinkKeyChangeSchema },
              bodyChanged: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        totalUpdated: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    };
    const capturedDocSchema = {
      type: 'object',
      required: ['frontmatter'],
      properties: {
        frontmatter: { type: 'object' },
        body: { type: 'string' },
        bodyExcerpt: { type: 'string' },
      },
      additionalProperties: false,
    };
    const backlinkRowSchema = {
      type: 'object',
      required: ['slug', 'kind', 'title', 'mtime'],
      properties: {
        slug: nonBlankStringSchema,
        kind: nonBlankStringSchema,
        title: nonBlankStringSchema,
        domain: nonBlankStringSchema,
        mtime: { type: 'number', minimum: 0 },
        matchedKeys: { type: 'array', items: nonBlankStringSchema },
        matchedInBody: { type: 'boolean' },
      },
      additionalProperties: false,
    };
    const compactProposedActionSchema = {
      type: ['object', 'null'],
      required: ['tool', 'args'],
      properties: {
        tool: { type: 'string', enum: compactProposedActionTools },
        args: {
          oneOf: [
            {
              type: 'object',
              required: ['slug', 'kind', 'title'],
              properties: {
                slug: { type: 'string' },
                kind: { type: 'string', enum: NODE_KIND_VALUES },
                title: { type: 'string' },
              },
              additionalProperties: false,
            },
            {
              type: 'object',
              required: ['from', 'to', 'type'],
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                type: { type: 'string', enum: WRITE_RELATION_TYPE_VALUES },
              },
              additionalProperties: false,
            },
            {
              type: 'object',
              required: ['slug', 'frontmatter', 'expected_mtime'],
              properties: {
                slug: { type: 'string' },
                frontmatter: relationArrayPatchSchema,
                expected_mtime: { type: 'number', minimum: 0 },
              },
              additionalProperties: false,
            },
          ],
        },
      },
      additionalProperties: false,
    };
    const compactActionProperties = {
      id: { type: 'string' },
      phase: { type: 'string', enum: MAINTENANCE_PHASE_VALUES },
      kind: { type: 'string', enum: MAINTENANCE_KIND_VALUES },
      severity: { type: 'string', enum: MAINTENANCE_SEVERITY_VALUES },
      score: { type: 'number', minimum: 0 },
      executable: { type: 'boolean' },
      reason: { type: 'string' },
      proposedAction: compactProposedActionSchema,
      node: compactNodeSchema,
      nodes: {
        type: ['array', 'object'],
        items: compactNodeSchema,
        additionalProperties: compactNodeSchema,
      },
    };
    const compactActionSchema = {
      type: 'object',
      required: ['id', 'phase', 'kind', 'severity', 'score', 'executable', 'reason', 'proposedAction'],
      properties: compactActionProperties,
      additionalProperties: false,
    };
    const postWriteMaintenanceSchema = {
      type: 'object',
      required: [
        'operation',
        'sideEffect',
        'graphHash',
        'summary',
        'filters',
        'cursor',
        'byPhase',
        'bySeverity',
        'byKind',
        'limited',
        'nextExecutableAction',
        'nextReviewAction',
        'actions',
      ],
      properties: {
        operation: { type: 'string', enum: ['maintenance_plan'] },
        sideEffect: { type: 'boolean' },
        graphHash: { type: 'string' },
        summary: {
          type: 'object',
          required: maintenanceSummaryRequired,
          properties: Object.fromEntries(
            maintenanceSummaryRequired.map((key) => [key, { type: 'integer', minimum: 0 }]),
          ),
          additionalProperties: false,
        },
        filters: {
          type: 'object',
          required: ['executableOnly', 'phases', 'severities', 'kinds'],
          properties: {
            executableOnly: { type: 'boolean' },
            phases: { type: 'array', items: { type: 'string', enum: MAINTENANCE_PHASE_VALUES } },
            severities: { type: 'array', items: { type: 'string', enum: MAINTENANCE_SEVERITY_VALUES } },
            kinds: { type: 'array', items: { type: 'string', enum: MAINTENANCE_KIND_VALUES } },
          },
          additionalProperties: false,
        },
        cursor: {
          type: 'object',
          required: ['afterActionId', 'found', 'reason', 'startIndex', 'nextAfterActionId', 'hasMore'],
          properties: {
            afterActionId: { type: ['string', 'null'] },
            found: { type: 'boolean' },
            reason: { type: ['string', 'null'] },
            startIndex: { type: ['integer', 'null'], minimum: 0 },
            nextAfterActionId: { type: ['string', 'null'] },
            hasMore: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        byPhase: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
        bySeverity: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
        byKind: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
        limited: { type: 'boolean' },
        nextExecutableAction: { ...compactActionSchema, type: ['object', 'null'] },
        nextReviewAction: { ...compactActionSchema, type: ['object', 'null'] },
        actions: { type: 'array', items: compactActionSchema },
      },
      additionalProperties: false,
    };
    const tools = [
      {
        name: 'list_concepts',
        inputSchema: {
          additionalProperties: false,
          properties: {
            kind: {
              type: 'string',
              minLength: 1,
              enum: NODE_KIND_VALUES,
              description:
                'Filter to one canonical ontology kind (project, domain, capability, element, document, vault-readme). Omit to return all. Invalid kind typos fail closed with nearest-value hints instead of returning an empty list.',
            },
            domain: { type: 'string' },
            since: {
              type: 'number',
              minimum: 0,
              description:
                'Non-negative mtime threshold. Filter to nodes with `mtime > since` (ms). Pair with the `mtime` returned in earlier `list_concepts` / `get_concept` responses for incremental sync — "what changed since I last looked". Strict greater-than (mtime === since 는 제외) so re-passing the max from a previous response does not double-fetch.',
            },
            summary: {
              type: 'boolean',
              description:
                'When true, each node row includes a `summary` (max 200 chars, prose-only — heading / 표 / 코드블록 / 리스트 / 인용 skip 후 첫 단락만, same `extractSummaryExcerpt` helper as `get_concept` / `find_evidence`). Useful for "scan + overview" without N follow-up `get_concept` calls. Default false to keep payload small.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'Positive integer max rows to return. Defaults to 100, max 500.',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['total', 'vaultRoot', 'nodes'],
          properties: {
            total: { type: 'integer', minimum: 0 },
            vaultRoot: { type: 'string', minLength: 1 },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title', 'mtime'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  mtime: { type: 'number', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
            vaultWarnings: {
              type: 'object',
              required: ['errorCount', 'warningCount'],
              properties: {
                errorCount: { type: 'integer', minimum: 0 },
                warningCount: { type: 'integer', minimum: 0 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'get_concepts',
        description:
          'Fetch multiple nodes in one call — same per-row shape as get_concept. Use when you have K specific slugs and need their full details — saves K-1 round-trips. Order of `concepts[]` matches input `slugs[]`; successful rows return canonical `slug`. Missing or invalid slug rows return `{ slug, ok: false, error }` rather than aborting the batch, so later valid slugs still resolve.',
        inputSchema: {
          additionalProperties: false,
          required: ['slugs'],
          properties: {
            slugs: {
              type: 'array',
              maxItems: 50,
              items: { type: 'string' },
              description:
                'Vault-relative slugs, unique tail slugs, or frontmatter `slug` aliases (e.g. ["capabilities/x", "elements/y"]). Omit the .md extension. Max 50 per call.',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['concepts'],
          properties: {
            concepts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['ok', 'slug'],
                properties: {
                  ok: { type: 'boolean' },
                  slug: { type: 'string' },
                  frontmatter: { type: 'object' },
                  excerpt: { type: 'string' },
                  neighbors: conceptNeighborsSchema,
                  outgoingEdges: outgoingEdgesSchema,
                  mtime: { type: 'number', minimum: 0 },
                  warnings: vaultWarningsSchema,
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'find_orphans',
        description:
          'List orphan nodes — docs that no other node references via any frontmatter array key. Useful as a cleanup starting point or to answer "which nodes are unused?". Same matching policy as find_backlinks (full slug or final segment). Root/sentinel kinds like project and vault-readme are excluded by default.',
        inputSchema: {
          additionalProperties: false,
          properties: {
            kind: {
              type: 'string',
              minLength: 1,
              enum: NODE_KIND_VALUES,
              description: 'Restrict to one kind (e.g. capability). Omit for all kinds.',
            },
            excludeKinds: {
              type: 'array',
              maxItems: NODE_KIND_VALUES.length,
              items: { type: 'string', enum: NODE_KIND_VALUES },
              description: "Defaults to ['project', 'vault-readme']. Pass [] to include every kind. Typos fail with nearest-value hints.",
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['total', 'orphans'],
          properties: {
            total: { type: 'integer', minimum: 0 },
            orphans: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title', 'mtime'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  mtime: { type: 'number', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'add_concept',
        description:
          `Changed writes return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          required: ['slug', 'kind', 'title'],
          properties: {},
        },
        outputSchema: {
          type: 'object',
          required: ['ok', 'slug', 'filePath', 'changed'],
          properties: {
            ok: { type: 'boolean' },
            slug: { type: 'string' },
            filePath: { type: 'string' },
            changed: { type: 'boolean' },
            warnings: { type: 'array', items: { type: 'string' } },
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'add_concepts',
        description:
          `Batch writes isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include \`receivedField\` plus one-row \`unknownFields\`, multi unknown-field rows report every unknown field with nearest hints and Received fields, duplicate input slugs report the later \`concepts[n]\` row plus first-seen \`concepts[m]\` with structured \`rowName\` / \`firstSeenAt\`. Invalid-only batches return no row-level write metadata and no top-level \`postWriteMaintenance\`, and changed batches return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          required: ['concepts'],
          properties: { concepts: { type: 'array', maxItems: 50 } },
        },
        outputSchema: {
          type: 'object',
          required: ['concepts'],
          properties: {
            concepts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'ok'],
                properties: {
                  slug: { type: 'string' },
                  ok: { type: 'boolean' },
                  filePath: { type: 'string' },
                  changed: { type: 'boolean' },
                  warnings: { type: 'array', items: { type: 'string' } },
                  error: { type: 'string' },
                  errorCode: { type: 'string' },
                  valueName: { type: 'string' },
                  receivedValue: { type: 'string' },
                  suggestion: { type: 'string' },
                  allowedValues: { type: 'array', items: { type: 'string' } },
                  rowName: { type: 'string' },
                  receivedField: { type: 'string' },
                  unknownFields: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        suggestion: { type: 'string' },
                      },
                      required: ['name'],
                      additionalProperties: false,
                    },
                  },
                  allowedFields: { type: 'array', items: { type: 'string' } },
                  receivedFields: { type: 'array', items: { type: 'string' } },
                  conflictSubject: { type: 'string' },
                  conflictSlug: { type: 'string' },
                  firstSeenAt: { type: 'string' },
                  recoveryTools: { type: 'array', items: { type: 'string' } },
                  avoidTools: { type: 'array', items: { type: 'string' } },
                },
                additionalProperties: false,
              },
            },
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'add_relations',
        description:
          `Batch writes isolate non-object row shape, unknown type with closest-value hint and structured \`valueName\` / \`receivedValue\` / \`suggestion\` / \`allowedValues\`, and unknown row fields as ok:false rows with relations[n] labels and structured \`rowName\`, single unknown-field rows include \`receivedField\` plus one-row \`unknownFields\`, and multi unknown-field rows report every unknown field with nearest hints, \`allowedFields\`, \`receivedFields\`, and Received fields. Invalid-only batches return no row-level \`changed\` / \`alreadyExists\` write metadata and no top-level \`postWriteMaintenance\`, and changed batches return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          required: ['relations'],
          properties: {
            relations: {
              type: 'array',
              maxItems: 50,
              items: {
                properties: {
                  type: {
                    type: 'string',
                    enum: WRITE_RELATION_TYPE_VALUES,
                  },
                  expected_mtime: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['relations'],
          properties: {
            relations: {
              type: 'array',
              items: {
                type: 'object',
                required: ['ok', 'from', 'to', 'type'],
                properties: {
                  ok: { type: 'boolean' },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  type: { type: 'string' },
                  alreadyExists: { type: 'boolean' },
                  key: { type: 'string' },
                  changed: { type: 'boolean' },
                  error: { type: 'string' },
                  errorCode: { type: 'string' },
                  valueName: { type: 'string' },
                  receivedValue: { type: 'string' },
                  suggestion: { type: 'string' },
                  allowedValues: { type: 'array', items: { type: 'string' } },
                  rowName: { type: 'string' },
                  receivedField: { type: 'string' },
                  unknownFields: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        suggestion: { type: 'string' },
                      },
                      required: ['name'],
                      additionalProperties: false,
                    },
                  },
                  allowedFields: { type: 'array', items: { type: 'string' } },
                  receivedFields: { type: 'array', items: { type: 'string' } },
                  missingSubject: { type: 'string' },
                  missingSlug: { type: 'string' },
                  similarSlugs: { type: 'array', items: { type: 'string' } },
                  recoveryTools: { type: 'array', items: { type: 'string' } },
                  createTool: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'add_relation',
        description:
          `Invalid relation \`type\` is rejected before endpoint slug resolution with a closest-value hint and structured \`valueName\` / \`receivedValue\` / \`suggestion\` / \`allowedValues\` repair fields, with no \`changed\`, \`alreadyExists\`, or \`postWriteMaintenance\` write metadata. Changed writes return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          properties: {
            type: {
              type: 'string',
              enum: WRITE_RELATION_TYPE_VALUES,
            },
            expected_mtime: { type: 'number', minimum: 0 },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['ok', 'from', 'to', 'type'],
          properties: {
            ok: { type: 'boolean' },
            from: { type: 'string' },
            to: { type: 'string' },
            type: { type: 'string' },
            key: { type: 'string' },
            changed: { type: 'boolean' },
            alreadyExists: { type: 'boolean' },
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'patch_concept',
        description:
          `Changed writes return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          properties: { expected_mtime: { type: 'number', minimum: 0 } },
        },
        outputSchema: {
          type: 'object',
          required: ['ok', 'slug', 'filePath', 'changed', 'postWriteMaintenance'],
          properties: {
            ok: { type: 'boolean' },
            slug: { type: 'string' },
            filePath: { type: 'string' },
            changed: { type: 'boolean' },
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'rename_concept',
        description:
          `Confirmed writes return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          properties: {
            confirm: { type: 'boolean' },
            overwrite: { type: 'boolean' },
            expected_mtime: { type: 'number', minimum: 0 },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['ok', 'oldSlug', 'newSlug', 'sourcePath', 'targetPath', 'moved', 'backlinkUpdates'],
          properties: {
            ok: { type: 'boolean' },
            dryRun: { type: 'boolean' },
            oldSlug: { type: 'string' },
            newSlug: { type: 'string' },
            sourcePath: { type: 'string' },
            targetPath: { type: 'string' },
            moved: { type: 'boolean' },
            backlinkUpdates: backlinkRewritePlanSchema,
            message: { type: 'string' },
            changed: { type: 'boolean' },
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'merge_concepts',
        description:
          `Confirmed writes return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          properties: {
            confirm: { type: 'boolean' },
            expected_mtime: { type: 'number', minimum: 0 },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['ok', 'fromSlug', 'intoSlug', 'fromPath', 'deleted', 'backlinkUpdates', 'capturedFrom'],
          properties: {
            ok: { type: 'boolean' },
            dryRun: { type: 'boolean' },
            fromSlug: { type: 'string' },
            intoSlug: { type: 'string' },
            fromPath: { type: 'string' },
            deleted: { type: 'boolean' },
            backlinkUpdates: backlinkRewritePlanSchema,
            capturedFrom: capturedDocSchema,
            message: { type: 'string' },
            changed: { type: 'boolean' },
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'delete_concept',
        description:
          `Confirmed deletes return ${postWriteDescription}.`,
        inputSchema: {
          additionalProperties: false,
          properties: {
            confirm: { type: 'boolean' },
            force: { type: 'boolean' },
            expected_mtime: { type: 'number', minimum: 0 },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['ok', 'slug', 'filePath'],
          properties: {
            ok: { type: 'boolean' },
            dryRun: { type: 'boolean' },
            slug: nonBlankStringSchema,
            filePath: nonBlankStringSchema,
            backlinks: { type: 'array', items: backlinkRowSchema },
            message: nonBlankStringSchema,
            forced: { type: 'boolean' },
            backlinksAtDelete: { type: 'array', items: backlinkRowSchema },
            changed: { type: 'boolean' },
            captured: capturedDocSchema,
            postWriteMaintenance: postWriteMaintenanceSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'query_ontology',
        description:
          'Run graph queries including `maintenance_plan` with cursor `nextAfterActionId`/`hasMore` pagination metadata and current-page `nextExecutableAction` / `nextReviewAction` pointers.',
        inputSchema: {
          additionalProperties: false,
          required: ['operation'],
          properties: {
            operation: { enum: QUERY_ONTOLOGY_OPERATIONS },
            targetOperation: { enum: QUERY_PLAN_TARGET_OPERATIONS },
            afterActionId: {
              description:
                'maintenance_plan only: cursor.nextAfterActionId matches the last returned action id, cursor.hasMore matches whether more remaining actions exist after this page, nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity. Unknown cursors return cursor.nextAfterActionId=null, cursor.hasMore=false.',
            },
            componentLimit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'health/workspace_brief only: positive integer max connected components to inspect.',
            },
            cycleLimit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'health/workspace_brief only: positive integer max dependency cycles to inspect.',
            },
            recommendationLimit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'health/workspace_brief only: positive integer max relation recommendations to inspect.',
            },
            orderLimit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'health/workspace_brief only: positive integer max topological-order rows to inspect.',
            },
            nodeLimit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'components/communities/health/workspace_brief only: positive integer max node summaries.',
            },
            types: { type: 'array', maxItems: RELATION_TYPE_VALUES.length, items: { type: 'string', enum: RELATION_TYPE_VALUES } },
            pattern: { type: 'array', maxItems: RELATION_TYPE_VALUES.length, items: { type: 'string', enum: RELATION_TYPE_VALUES } },
            type: { type: 'string', enum: RELATION_TYPE_VALUES },
            relation: { type: 'string', enum: RELATION_TYPE_VALUES },
            kind: {
              type: 'string',
              enum: NODE_KIND_VALUES,
              description:
                'match_nodes: optional node kind filter (project, domain, capability, element, document, vault-readme). recommend_relations currently supports capability or element.',
            },
            fromKind: {
              type: 'string',
              enum: NODE_KIND_VALUES,
              description:
                'match_edges only: optional source node kind filter (project, domain, capability, element, document, vault-readme). Source must be a real ontology node, not external/unresolved.',
            },
            toKind: {
              type: 'string',
              enum: EDGE_TARGET_KIND_VALUES,
              description:
                'match_edges only: optional target kind filter (project, domain, capability, element, document, vault-readme, external, unresolved). Use external or unresolved for non-node refs.',
            },
            dependencyTypes: {
              type: 'array',
              maxItems: RELATION_TYPE_VALUES.length,
              items: { type: 'string', enum: RELATION_TYPE_VALUES },
              description: 'health/workspace_brief only: dependency relation types.',
            },
            componentTypes: {
              type: 'array',
              maxItems: RELATION_TYPE_VALUES.length,
              items: { type: 'string', enum: RELATION_TYPE_VALUES },
              description: 'health/workspace_brief only: relation types used for connected-component checks.',
            },
            phases: { type: 'array', maxItems: MAINTENANCE_PHASE_VALUES.length, items: { enum: MAINTENANCE_PHASE_VALUES } },
            severities: { type: 'array', maxItems: MAINTENANCE_SEVERITY_VALUES.length, items: { enum: MAINTENANCE_SEVERITY_VALUES } },
            kinds: {
              type: 'array',
              maxItems: MAINTENANCE_KIND_VALUES.length,
              items: {
                enum: MAINTENANCE_KIND_VALUES,
              },
            },
          },
        },
      },
      {
        name: 'list_kinds',
        description:
          'Vault kind distribution — { total, byKind: { capability: N, ... } }. A quick census so AI agents can size up the vault without paging through list_concepts.',
        inputSchema: { additionalProperties: false, properties: {} },
        outputSchema: {
          type: 'object',
          required: ['total', 'byKind'],
          properties: {
            total: { type: 'integer', minimum: 0 },
            byKind: {
              type: 'object',
              additionalProperties: { type: 'integer', minimum: 0 },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'query_concepts',
        description:
          'Typed filter DSL — search vault nodes by predicate.\n\n' +
          'Grammar (case-insensitive keywords, whitespace-tolerant):\n' +
          '  filter    := atom (AND|OR atom)*\n' +
          '  atom      := NOT? predicate\n' +
          '  predicate := key=value | key!=value | has(key)\n\n' +
          'Example: `kind=capability AND domain=auth AND NOT has(elements)`.',
        inputSchema: {
          additionalProperties: false,
          required: ['filter'],
          properties: {
            filter: {
              type: 'string',
              description:
                'Filter expression. Example: kind=capability AND has(elements). Supports NOT / AND / OR. Wrap values containing whitespace or special characters with "..." or \'...\'.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'Positive integer max rows to return. Defaults to 100, max 500.',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['filter', 'parsedAs', 'total', 'matches', 'limited'],
          properties: {
            filter: { type: 'string' },
            parsedAs: { type: 'string' },
            total: { type: 'integer', minimum: 0 },
            matches: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title', 'mtime'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  mtime: { type: 'number', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
            limited: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'compile_ontology',
        description:
          'Compile the whole markdown vault into a deterministic graph artifact. Includes a stable semantic graphHash and maxMtime for cache invalidation. side effect 0. Large vaults (100+ nodes) can exceed the MCP token cap with the default full payload — use `summary: true` for cheap polling, or `nodesLimit/nodesOffset` / `edgesLimit/edgesOffset` to slice arrays.',
        inputSchema: {
          additionalProperties: false,
          properties: {
            summary: {
              type: 'boolean',
              description:
                'When true, omit `nodes` / `edges` / `aliases` / `ambiguousAliases` / `canonicalizationActions` / `indexes` arrays. Cheap polling for cache invalidation and graph-size assessment.',
            },
            nodesLimit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'Positive integer max nodes to return. Pair with `nodesOffset` to paginate. Omit for unlimited (backward compat), max 500 when provided.',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: [
            'version',
            'graphHash',
            'maxMtime',
            'nodeCount',
            'edgeCount',
            'resolvedEdgeCount',
            'externalEdgeCount',
            'unresolvedEdgeCount',
            'aliasCount',
            'ambiguousAliasCount',
            'issueCount',
            'canonicalizationActionCount',
            'byKind',
            'byDomain',
          ],
          properties: {
            version: { type: 'integer', minimum: 1 },
            graphHash: { type: 'string' },
            maxMtime: { type: 'number', minimum: 0 },
            nodeCount: { type: 'integer', minimum: 0 },
            edgeCount: { type: 'integer', minimum: 0 },
            resolvedEdgeCount: { type: 'integer', minimum: 0 },
            externalEdgeCount: { type: 'integer', minimum: 0 },
            unresolvedEdgeCount: { type: 'integer', minimum: 0 },
            aliasCount: { type: 'integer', minimum: 0 },
            ambiguousAliasCount: { type: 'integer', minimum: 0 },
            issueCount: { type: 'integer', minimum: 0 },
            canonicalizationActionCount: { type: 'integer', minimum: 0 },
            byKind: {
              type: 'object',
              additionalProperties: { type: 'integer', minimum: 0 },
            },
            byDomain: {
              type: 'object',
              additionalProperties: { type: 'integer', minimum: 0 },
            },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title', 'mtime', 'outDegree', 'inDegree'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  mtime: { type: 'number' },
                  outDegree: { type: 'integer', minimum: 0 },
                  inDegree: { type: 'integer', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external'],
                properties: {
                  id: { type: 'string' },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  via: { type: 'string' },
                  ref: { type: 'string' },
                  resolved: { type: 'boolean' },
                  external: { type: 'boolean' },
                },
                additionalProperties: false,
              },
            },
            nodesPagination: {
              type: 'object',
              required: ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset'],
              properties: {
                offset: { type: 'integer', minimum: 0 },
                limit: { type: 'integer', minimum: 0 },
                total: { type: 'integer', minimum: 0 },
                returned: { type: 'integer', minimum: 0 },
                hasMore: { type: 'boolean' },
                nextOffset: { type: ['integer', 'null'], minimum: 0 },
              },
              additionalProperties: false,
            },
            edgesPagination: {
              type: 'object',
              required: ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset'],
              properties: {
                offset: { type: 'integer', minimum: 0 },
                limit: { type: 'integer', minimum: 0 },
                total: { type: 'integer', minimum: 0 },
                returned: { type: 'integer', minimum: 0 },
                hasMore: { type: 'boolean' },
                nextOffset: { type: ['integer', 'null'], minimum: 0 },
              },
              additionalProperties: false,
            },
            aliases: {
              type: 'array',
              items: {
                type: 'object',
                required: ['alias', 'slug'],
                properties: {
                  alias: { type: 'string' },
                  slug: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            ambiguousAliases: {
              type: 'array',
              items: {
                type: 'object',
                required: ['alias', 'slugs'],
                properties: {
                  alias: { type: 'string' },
                  slugs: { type: 'array', items: { type: 'string' } },
                },
                additionalProperties: false,
              },
            },
            issues: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'severity', 'message'],
                properties: {
                  code: { type: 'string', enum: ['ambiguous-alias', 'dangling-graph-reference'] },
                  severity: { type: 'string', enum: ['warning'] },
                  message: { type: 'string' },
                  alias: { type: 'string' },
                  slugs: { type: 'array', items: { type: 'string' } },
                  slug: { type: 'string' },
                  via: { type: 'string' },
                  ref: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            canonicalizationActions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'keys', 'frontmatter', 'expected_mtime'],
                properties: {
                  slug: { type: 'string' },
                  keys: { type: 'array', items: { type: 'string', enum: GRAPH_ARRAY_KEYS } },
                  frontmatter: {
                    type: 'object',
                    properties: Object.fromEntries(
                      GRAPH_ARRAY_KEYS.map((key) => [key, { type: 'array', items: { type: 'string', minLength: 1 } }]),
                    ),
                    additionalProperties: false,
                  },
                  expected_mtime: { type: 'number', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
            indexes: {
              type: 'object',
              properties: {
                out: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'string' } },
                },
                in: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'string' } },
                },
                byKind: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'string' } },
                },
                byDomain: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'string' } },
                },
                edgeById: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    required: ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external'],
                    properties: {
                      id: { type: 'string' },
                      from: { type: 'string' },
                      to: { type: 'string' },
                      via: { type: 'string' },
                      ref: { type: 'string' },
                      resolved: { type: 'boolean' },
                      external: { type: 'boolean' },
                    },
                    additionalProperties: false,
                  },
                },
                aliasToSlug: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
              additionalProperties: false,
            },
            summary: {
              type: 'object',
              required: ['nodes', 'edges', 'graphHash', 'maxMtime', 'resolvedEdges', 'externalEdges', 'unresolvedEdges', 'aliases', 'ambiguousAliases', 'issues'],
              properties: {
                nodes: { type: 'integer', minimum: 0 },
                edges: { type: 'integer', minimum: 0 },
                graphHash: { type: 'string' },
                maxMtime: { type: 'number', minimum: 0 },
                resolvedEdges: { type: 'integer', minimum: 0 },
                externalEdges: { type: 'integer', minimum: 0 },
                unresolvedEdges: { type: 'integer', minimum: 0 },
                aliases: { type: 'integer', minimum: 0 },
                ambiguousAliases: { type: 'integer', minimum: 0 },
                issues: { type: 'integer', minimum: 0 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'analyze_repo_structure',
        description:
          'R16 (autonomous ingest base) — analyze a code repository and propose ontology node candidates. side effect 0 (vault frontmatter NOT modified). Returns deterministic candidates the agent should review and selectively pass to add_concept. Use this once when a user asks "bootstrap the ontology". Single source of truth preserved — only the user writes to the vault.',
        inputSchema: {
          additionalProperties: false,
          properties: {
            rootPath: {
              type: 'string',
              minLength: 1,
              description: 'Repository root to analyze. Defaults to the MCP server cwd.',
            },
            maxDepth: { type: 'integer', minimum: 0, maximum: 10 },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['rootPath', 'framework', 'domains', 'capabilities', 'elements', 'suggestedRelations', 'skipped'],
          properties: {
            rootPath: { type: 'string' },
            project: {
              type: 'object',
              required: ['slug', 'title'],
              properties: {
                slug: { type: 'string' },
                title: { type: 'string' },
              },
              additionalProperties: false,
            },
            framework: { enum: ['fsd', 'next', 'generic'] },
            domains: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'title', 'evidence'],
                properties: {
                  slug: { type: 'string' },
                  title: { type: 'string' },
                  evidence: {
                    type: 'object',
                    required: ['source'],
                    properties: { source: { type: 'string' } },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
            capabilities: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'title', 'evidence'],
                properties: {
                  slug: { type: 'string' },
                  title: { type: 'string' },
                  evidence: {
                    type: 'object',
                    required: ['source'],
                    properties: { source: { type: 'string' } },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
            elements: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'title', 'evidence'],
                properties: {
                  slug: { type: 'string' },
                  title: { type: 'string' },
                  evidence: {
                    type: 'object',
                    required: ['source'],
                    properties: { source: { type: 'string' } },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
            suggestedRelations: {
              type: 'array',
              items: {
                type: 'object',
                required: ['from', 'to', 'type'],
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  type: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            skipped: {
              type: 'array',
              items: {
                type: 'object',
                required: ['path', 'reason'],
                properties: {
                  path: { type: 'string' },
                  reason: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'infer_imports',
        description:
          'R17 (autonomous ingest deeper) — walk TS/JS files in a code repo and infer file-level + module-level import edges. side effect 0 (vault frontmatter NOT modified). The agent reviews moduleEdges with kindCounts and selectively passes accepted edges to add_relation as `depends_on`. Use after analyze_repo_structure to pull real dependency edges from the code, not just suggestedRelations heuristics. Single source of truth preserved — only the user writes to the vault.',
        inputSchema: {
          additionalProperties: false,
          properties: {
            rootPath: { type: 'string' },
            sourceFolders: { type: 'array', maxItems: 50, items: { type: 'string' } },
            ignore: { type: 'array', maxItems: 200, items: { type: 'string' } },
            maxFiles: {
              type: 'integer',
              minimum: 1,
              maximum: 50000,
              description: 'Positive integer cap on files walked (default 5000, max 50000). Hard stop to avoid pathological monorepos.',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['rootPath', 'filesScanned', 'edges', 'externalImports', 'unresolved', 'moduleEdges'],
          properties: {
            rootPath: { type: 'string' },
            filesScanned: { type: 'integer', minimum: 0 },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                required: ['from', 'to', 'kind'],
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  kind: { enum: IMPORT_EDGE_KIND_VALUES },
                },
                additionalProperties: false,
              },
            },
            externalImports: {
              type: 'array',
              items: {
                type: 'object',
                required: ['from', 'spec'],
                properties: {
                  from: { type: 'string' },
                  spec: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            unresolved: {
              type: 'array',
              items: {
                type: 'object',
                required: ['from', 'spec', 'reason'],
                properties: {
                  from: { type: 'string' },
                  spec: { type: 'string' },
                  reason: { enum: IMPORT_UNRESOLVED_REASON_VALUES },
                },
                additionalProperties: false,
              },
            },
            moduleEdges: {
              type: 'array',
              items: {
                type: 'object',
                required: ['from', 'to', 'count', 'kindCounts'],
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  count: { type: 'integer', minimum: 1 },
                  kindCounts: {
                    type: 'object',
                    properties: {
                      ...Object.fromEntries(
                        IMPORT_EDGE_KIND_VALUES.map((kind) => [kind, { type: 'integer', minimum: 1 }]),
                      ),
                    },
                    additionalProperties: false,
                    minProperties: 1,
                  },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'add_concept',
        description:
          'Successful writes return postWriteMaintenance with score, proposedAction, and current-page nextExecutableAction / nextReviewAction pointers.',
        inputSchema: { additionalProperties: false, properties: {} },
      },
      {
        name: 'validate_vault',
        description:
          'R+ (cycle 46) — validate every doc in the vault, return per-doc + per-code aggregate. side effect 0. Use when an agent needs the whole-vault health view: first-contact before writes, before / after a batch write, or surfacing issues to the user.',
        inputSchema: { additionalProperties: false, properties: {} },
        outputSchema: {
          type: 'object',
          required: ['scanned', 'problems', 'summary'],
          properties: {
            scanned: { type: 'integer', minimum: 0 },
            problems: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'issues'],
                properties: {
                  slug: { type: 'string' },
                  issues: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['code', 'severity', 'message'],
                      properties: {
                        code: { type: 'string', enum: VAULT_ISSUE_CODE_VALUES },
                        severity: { type: 'string', enum: ['error', 'warning'] },
                        message: { type: 'string' },
                      },
                      additionalProperties: false,
                    },
                  },
                },
                additionalProperties: false,
              },
            },
            summary: {
              type: 'object',
              required: ['problemFiles', 'errorFiles', 'warningFiles', 'byCode'],
              properties: {
                problemFiles: { type: 'integer', minimum: 0 },
                errorFiles: { type: 'integer', minimum: 0 },
                warningFiles: { type: 'integer', minimum: 0 },
                byCode: {
                  type: 'object',
                  propertyNames: { enum: VAULT_ISSUE_CODE_VALUES },
                  additionalProperties: {
                    type: 'object',
                    required: ['severity', 'count', 'files'],
                    properties: {
                      severity: { enum: ['error', 'warning'] },
                      count: { type: 'integer', minimum: 0 },
                      files: { type: 'array', items: { type: 'string' } },
                    },
                    additionalProperties: false,
                  },
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'get_concept',
        inputSchema: { additionalProperties: false, required: ['slug'], properties: {} },
        outputSchema: {
          type: 'object',
          required: ['slug', 'frontmatter', 'excerpt', 'neighbors', 'outgoingEdges', 'mtime'],
          properties: {
            slug: { type: 'string' },
            frontmatter: { type: 'object' },
            excerpt: { type: 'string' },
            neighbors: conceptNeighborsSchema,
            outgoingEdges: outgoingEdgesSchema,
            mtime: { type: 'number', minimum: 0 },
            warnings: vaultWarningsSchema,
          },
          additionalProperties: false,
        },
      },
      {
        name: 'find_evidence',
        description:
          'Find vault docs that mention a given concept by title. Useful when an AI agent asks where a capability is realized in code or docs. Each match includes a prose `excerpt` (max 200 chars, heading/표/코드 skip) so agents see *what the matching doc says* without an extra get_concept call.',
        inputSchema: {
          additionalProperties: false,
          required: ['title'],
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              description: 'Concept title to search for (case-insensitive substring match).',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['query', 'matches'],
          properties: {
            query: { type: 'string' },
            matches: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title', 'mtime', 'matchedIn', 'excerpt'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  mtime: { type: 'number', minimum: 0 },
                  matchedIn: { enum: ['frontmatter', 'body'] },
                  excerpt: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'find_backlinks',
        description:
          'Return every node that points to the target slug. Scans both frontmatter array keys (capabilities / elements / dependencies / relates / contains / describes etc.) and the wikilinks / markdown links in the body. Used by AI agents to walk the graph from a node to its dependents.',
        inputSchema: {
          additionalProperties: false,
          required: ['slug'],
          properties: {
            slug: {
              type: 'string',
              minLength: 1,
              description: 'Target vault-relative slug (omit the .md extension).',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['target', 'total', 'matches'],
          properties: {
            target: { type: 'string' },
            total: { type: 'integer', minimum: 0 },
            matches: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title', 'mtime'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  mtime: { type: 'number', minimum: 0 },
                  matchedKeys: { type: 'array', items: { type: 'string' } },
                  matchedInBody: { type: 'boolean' },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'find_neighbors',
        inputSchema: {
          additionalProperties: false,
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
            direction: {
              type: 'string',
              enum: ['outgoing', 'incoming', 'both'],
              description: 'Edge direction to include. Defaults to both.',
            },
            types: {
              type: 'array',
              maxItems: RELATION_TYPE_VALUES.length,
              items: { type: 'string', enum: RELATION_TYPE_VALUES },
              description:
                'Optional relation types/frontmatter keys to include, e.g. ["domain", "depends_on", "contains"]. Public add_relation types are normalized to stored graph keys.',
            },
            includeNodes: {
              type: 'boolean',
              description:
                'When true (default), include neighbor node summaries for resolved edges.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'Positive integer max edges to return. Defaults to 100, max 500.',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['center', 'requested', 'direction', 'totalEdges', 'limited', 'edges'],
          properties: {
            center: { type: 'string' },
            requested: { type: 'string' },
            direction: { enum: ['outgoing', 'incoming', 'both'] },
            types: { type: 'array', items: { type: 'string' } },
            totalEdges: { type: 'integer', minimum: 0 },
            limited: { type: 'boolean' },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                required: ['direction', 'from', 'to', 'via', 'ref', 'resolved'],
                properties: {
                  direction: { enum: ['outgoing', 'incoming'] },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  via: { type: 'string' },
                  ref: { type: 'string' },
                  resolved: { type: 'boolean' },
                },
                additionalProperties: false,
              },
            },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title', 'mtime'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  mtime: { type: 'number', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'find_path',
        inputSchema: {
          additionalProperties: false,
          required: ['from', 'to'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            maxHops: {
              type: 'integer',
              minimum: 0,
              maximum: 20,
              description: 'Non-negative integer maximum hop count (default 5, max 20).',
            },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['from', 'to', 'found'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            hopCount: { type: 'integer', minimum: 0 },
            hops: { type: 'array', items: { type: 'string' } },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                required: ['from', 'to', 'via'],
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  via: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['slug', 'kind', 'title'],
                properties: {
                  slug: { type: 'string' },
                  kind: { type: 'string' },
                  title: { type: 'string' },
                  domain: { type: 'string' },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    ].map((tool) => ({
      ...tool,
      annotations: {
        title: expectedToolTitle(tool.name),
        readOnlyHint: EXPECTED_READ_TOOLS.includes(tool.name),
        destructiveHint: EXPECTED_DESTRUCTIVE_TOOLS.includes(tool.name),
        idempotentHint: EXPECTED_IDEMPOTENT_TOOLS.includes(tool.name),
        openWorldHint: false,
      },
    }));
    const withQueryTool = (queryTool) => [
      ...tools.filter((tool) => tool.name !== 'query_ontology'),
      queryTool,
    ];
    const queryOntologyTool = tools.find((tool) => tool.name === 'query_ontology');
    const listKindsTool = tools.find((tool) => tool.name === 'list_kinds');
    const withListKindsTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'list_kinds'),
      tool,
    ];
    const validateVaultTool = tools.find((tool) => tool.name === 'validate_vault');
    const withValidateVaultTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'validate_vault'),
      tool,
    ];
    const findOrphansTool = tools.find((tool) => tool.name === 'find_orphans');
    const withFindOrphansTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'find_orphans'),
      tool,
    ];
    const queryConceptsTool = tools.find((tool) => tool.name === 'query_concepts');
    const withQueryConceptsTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'query_concepts'),
      tool,
    ];
    const findEvidenceTool = tools.find((tool) => tool.name === 'find_evidence');
    const withFindEvidenceTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'find_evidence'),
      tool,
    ];
    const findBacklinksTool = tools.find((tool) => tool.name === 'find_backlinks');
    const withFindBacklinksTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'find_backlinks'),
      tool,
    ];
    const compileOntologyTool = tools.find((tool) => tool.name === 'compile_ontology');
    const withCompileOntologyTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'compile_ontology'),
      tool,
    ];
    const analyzeRepoTool = tools.find((tool) => tool.name === 'analyze_repo_structure');
    const withAnalyzeRepoTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'analyze_repo_structure'),
      tool,
    ];
    const inferImportsTool = tools.find((tool) => tool.name === 'infer_imports');
    const withInferImportsTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'infer_imports'),
      tool,
    ];
    const listConceptsTool = tools.find((tool) => tool.name === 'list_concepts');
    const withListConceptsTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'list_concepts'),
      tool,
    ];
    const findNeighborsTool = tools.find((tool) => tool.name === 'find_neighbors');
    const withFindNeighborsTool = (tool) => [
      ...tools.filter((candidate) => candidate.name !== 'find_neighbors'),
      tool,
    ];

    assert.equal(toolsListSchemaFailure(tools), null);
    assert.equal(toolsListSchemaFailure(null), 'tools/list response missing tools array');
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'add_concept' && tool.outputSchema
          ? { ...tool, description: 'Successful writes return postWriteMaintenance with current-page nextExecutableAction / nextReviewAction pointers.' }
          : tool
      ))),
      'add_concept description missing maintenance action score guidance',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'add_concept' && tool.outputSchema
          ? {
              ...tool,
              description: 'Successful writes return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
              outputSchema: {
                ...tool.outputSchema,
                properties: {
                  ...tool.outputSchema.properties,
                  postWriteMaintenance: { type: 'object' },
                },
              },
            }
          : tool
      ))),
      'add_concept outputSchema postWriteMaintenance required drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'patch_concept'
          ? { ...tool, description: 'Changed writes return postWriteMaintenance with score and proposedAction.' }
          : tool
      ))),
      'patch_concept description missing maintenance next action pointer guidance',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'patch_concept'
          ? {
              ...tool,
              description: 'Changed writes return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
              outputSchema: {
                ...tool.outputSchema,
                properties: {
                  ...tool.outputSchema.properties,
                  postWriteMaintenance: { type: 'object' },
                },
              },
            }
          : tool
      ))),
      'patch_concept outputSchema postWriteMaintenance required drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'add_relation'
          ? { ...tool, description: 'Invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint and structured `valueName` / `receivedValue` / `suggestion` / `allowedValues` repair fields, with no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata. Changed writes return postWriteMaintenance with score and current-page nextExecutableAction / nextReviewAction pointers.' }
          : tool
      ))),
      'add_relation description missing executable maintenance proposedAction guidance',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'add_relation'
          ? { ...tool, description: 'Invalid relation `type` is rejected before endpoint slug resolution with a closest-value hint and structured `valueName` / `receivedValue` / `suggestion` / `allowedValues` repair fields, with no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata. Changed writes return postWriteMaintenance with score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.' }
          : tool
      ))),
      'add_relation description missing maintenance bucket guidance',
    );
    assert.equal(
      toolsListSchemaFailure([{ name: 'list_concepts', inputSchema: { properties: {} } }]),
      'tools/list schema missing additionalProperties:false: list_concepts',
    );
    assert.equal(
      toolsListSchemaFailure(withListConceptsTool(
        {
          ...listConceptsTool,
          inputSchema: {
            ...listConceptsTool.inputSchema,
            properties: {
              ...listConceptsTool.inputSchema.properties,
              kind: {
                type: 'string',
                minLength: 1,
                description: 'Filter to one kind.',
              },
            },
          },
        },
      )),
      'list_concepts.kind schema guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure(withListConceptsTool(
        {
          ...listConceptsTool,
          inputSchema: {
            ...listConceptsTool.inputSchema,
            properties: {
              ...listConceptsTool.inputSchema.properties,
              since: {
                type: 'number',
                minimum: 0,
                description: 'Non-negative mtime threshold.',
              },
            },
          },
        },
      )),
      'list_concepts inputSchema since incremental-sync guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure(withListConceptsTool(
        {
          ...listConceptsTool,
          inputSchema: {
            ...listConceptsTool.inputSchema,
            properties: {
              ...listConceptsTool.inputSchema.properties,
              summary: {
                type: 'boolean',
                description: 'When true, each node row includes a summary.',
              },
            },
          },
        },
      )),
      'list_concepts inputSchema summary preview guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure(withListConceptsTool(
        {
          ...listConceptsTool,
          inputSchema: {
            ...listConceptsTool.inputSchema,
            properties: {
              ...listConceptsTool.inputSchema.properties,
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 500,
                description: 'Positive integer max rows to return.',
              },
            },
          },
        },
      )),
      'list_concepts inputSchema limit default description drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'list_concepts'
          ? { ...tool, annotations: { ...tool.annotations, title: 'List concept rows' } }
          : tool
      ))),
      'tools/list title annotation drift: list_concepts (expected "List Concepts", got "List concept rows")',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'list_concepts'
          ? { ...tool, outputSchema: { ...tool.outputSchema, required: ['nodes', 'total', 'vaultRoot'] } }
          : tool
      ))),
      'list_concepts outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'list_concepts'
          ? {
            ...tool,
            outputSchema: {
              ...tool.outputSchema,
              properties: {
                ...tool.outputSchema.properties,
                nodes: {
                  ...tool.outputSchema.properties.nodes,
                  items: {
                    ...tool.outputSchema.properties.nodes.items,
                    properties: {
                      ...tool.outputSchema.properties.nodes.items.properties,
                      mtime: { type: 'integer', minimum: 0 },
                    },
                  },
                },
              },
            },
          }
          : tool
      ))),
      'list_concepts outputSchema node mtime drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'list_kinds'
          ? { ...tool, outputSchema: { ...tool.outputSchema, required: ['byKind', 'total'] } }
          : tool
      ))),
      'list_kinds outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure(withListKindsTool({
        ...listKindsTool,
        description: 'Kind counts.',
      })),
      'list_kinds description missing census guidance',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'list_kinds'
          ? {
            ...tool,
            outputSchema: {
              ...tool.outputSchema,
              properties: {
                ...tool.outputSchema.properties,
                byKind: { type: 'object', additionalProperties: { type: 'number', minimum: 0 } },
              },
            },
          }
          : tool
      ))),
      'list_kinds outputSchema byKind drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'validate_vault'
          ? { ...tool, outputSchema: { ...tool.outputSchema, required: ['summary', 'problems', 'scanned'] } }
          : tool
      ))),
      'validate_vault outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure(withValidateVaultTool({
        ...validateVaultTool,
        description: 'Validate vault.',
      })),
      'validate_vault description missing first-contact health guidance',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'validate_vault'
          ? {
            ...tool,
            outputSchema: {
              ...tool.outputSchema,
              properties: {
                ...tool.outputSchema.properties,
                summary: {
                  ...tool.outputSchema.properties.summary,
                  properties: {
                    ...tool.outputSchema.properties.summary.properties,
                    byCode: {
                      type: 'object',
                      propertyNames: tool.outputSchema.properties.summary.properties.byCode.propertyNames,
                      additionalProperties: {
                        ...tool.outputSchema.properties.summary.properties.byCode.additionalProperties,
                        properties: {
                          ...tool.outputSchema.properties.summary.properties.byCode.additionalProperties.properties,
                          severity: { enum: ['warning', 'error'] },
                        },
                      },
                    },
                  },
                },
              },
            },
          }
          : tool
      ))),
      'validate_vault outputSchema byCode severity drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'validate_vault'
          ? {
            ...tool,
            outputSchema: {
              ...tool.outputSchema,
              properties: {
                ...tool.outputSchema.properties,
                problems: {
                  ...tool.outputSchema.properties.problems,
                  items: {
                    ...tool.outputSchema.properties.problems.items,
                    properties: {
                      ...tool.outputSchema.properties.problems.items.properties,
                      issues: {
                        ...tool.outputSchema.properties.problems.items.properties.issues,
                        items: {
                          ...tool.outputSchema.properties.problems.items.properties.issues.items,
                          properties: {
                            ...tool.outputSchema.properties.problems.items.properties.issues.items.properties,
                            code: { type: 'string', enum: VAULT_ISSUE_CODE_VALUES.slice(0, -1) },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }
          : tool
      ))),
      'validate_vault outputSchema issue code drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'validate_vault'
          ? {
            ...tool,
            outputSchema: {
              ...tool.outputSchema,
              properties: {
                ...tool.outputSchema.properties,
                summary: {
                  ...tool.outputSchema.properties.summary,
                  properties: {
                    ...tool.outputSchema.properties.summary.properties,
                    byCode: {
                      ...tool.outputSchema.properties.summary.properties.byCode,
                      propertyNames: { enum: VAULT_ISSUE_CODE_VALUES.slice(0, -1) },
                    },
                  },
                },
              },
            },
          }
          : tool
      ))),
      'validate_vault outputSchema byCode key drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'list_concepts'
          ? { ...tool, annotations: { ...tool.annotations, readOnlyHint: false } }
          : tool
      ))),
      'tools/list readOnlyHint annotation drift: list_concepts (expected true, got false)',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'add_concept'
          ? { ...tool, annotations: { ...tool.annotations, readOnlyHint: true } }
          : tool
      ))),
      'tools/list readOnlyHint annotation drift: add_concept (expected false, got true)',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'list_concepts'
          ? { ...tool, annotations: { ...tool.annotations, openWorldHint: true } }
          : tool
      ))),
      'tools/list openWorldHint annotation drift: list_concepts (expected false, got true)',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'merge_concepts'
          ? { ...tool, annotations: { ...tool.annotations, destructiveHint: false } }
          : tool
      ))),
      'tools/list destructiveHint annotation drift: merge_concepts (expected true, got false)',
    );
    assert.equal(
      toolsListSchemaFailure(tools.map((tool) => (
        tool.name === 'add_relations'
          ? { ...tool, annotations: { ...tool.annotations, idempotentHint: false } }
          : tool
      ))),
      'tools/list idempotentHint annotation drift: add_relations (expected true, got false)',
    );
    assert.equal(
      toolsListSchemaFailure(tools.filter((tool) => tool.name !== 'query_ontology')),
      'tools/list response missing query_ontology tool',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        description: 'Run graph queries including maintenance_plan.',
      })),
      'query_ontology description missing current-page maintenance next pointers',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        description: 'Run graph queries including `maintenance_plan` with current-page `nextExecutableAction` / `nextReviewAction` pointers.',
      })),
      'query_ontology description missing maintenance cursor pagination metadata',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            afterActionId: { description: 'maintenance_plan only: cursor id.' },
          },
        },
      })),
      'query_ontology afterActionId description missing current-page next pointers',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            afterActionId: {
              description:
                'maintenance_plan only: nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page.',
            },
          },
        },
      })),
      'query_ontology afterActionId description missing current-page next pointer detail fields',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            afterActionId: {
              description:
                'maintenance_plan only: cursor.hasMore matches whether more remaining actions exist after this page, nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity.',
            },
          },
        },
      })),
      'query_ontology afterActionId description missing nextAfterActionId pagination guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            afterActionId: {
              description:
                'maintenance_plan only: cursor.nextAfterActionId matches the last returned action id, nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity.',
            },
          },
        },
      })),
      'query_ontology afterActionId description missing hasMore pagination guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            afterActionId: {
              description:
                'maintenance_plan only: cursor.nextAfterActionId matches the last returned action id, cursor.hasMore matches whether more remaining actions exist after this page, nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity.',
            },
          },
        },
      })),
      'query_ontology afterActionId description missing unknown-cursor pagination guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            componentLimit: { type: 'integer', minimum: 0, maximum: 500, description: 'health/workspace_brief only.' },
          },
        },
      })),
      'query_ontology componentLimit health tuning schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            dependencyTypes: { type: 'array', maxItems: RELATION_TYPE_VALUES.length, items: { type: 'number' }, description: 'health/workspace_brief only.' },
          },
        },
      })),
      'query_ontology dependencyTypes health tuning schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool({
        ...queryOntologyTool,
        inputSchema: {
          ...queryOntologyTool.inputSchema,
          properties: {
            ...queryOntologyTool.inputSchema.properties,
            componentTypes: { type: 'array', maxItems: RELATION_TYPE_VALUES.length, items: { type: 'string', enum: RELATION_TYPE_VALUES }, description: 'components only.' },
          },
        },
      })),
      'query_ontology componentTypes health tuning description drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.filter((tool) => tool.name !== 'find_orphans')),
      'tools/list response missing find_orphans tool',
    );
    assert.equal(
      toolsListSchemaFailure(withFindOrphansTool({
        ...findOrphansTool,
        description: 'List orphan nodes.',
      })),
      'find_orphans description missing cleanup guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withFindOrphansTool({
        ...findOrphansTool,
        inputSchema: {
          ...findOrphansTool.inputSchema,
          properties: {
            ...findOrphansTool.inputSchema.properties,
            kind: {
              type: 'string',
              minLength: 1,
              enum: NODE_KIND_VALUES,
              description: 'Kind filter.',
            },
          },
        },
      })),
      'find_orphans.kind schema guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindOrphansTool({
        ...findOrphansTool,
        inputSchema: {
          ...findOrphansTool.inputSchema,
          properties: {
            ...findOrphansTool.inputSchema.properties,
            excludeKinds: {
              type: 'array',
              maxItems: NODE_KIND_VALUES.length,
              items: { type: 'number' },
              description: "Defaults to ['project', 'vault-readme'].",
            },
          },
        },
      })),
      'find_orphans.excludeKinds schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindOrphansTool({
        ...findOrphansTool,
        inputSchema: {
          ...findOrphansTool.inputSchema,
          properties: {
            ...findOrphansTool.inputSchema.properties,
            excludeKinds: {
              type: 'array',
              maxItems: NODE_KIND_VALUES.length,
              items: { type: 'string', enum: NODE_KIND_VALUES },
              description: 'Pass [] to include every kind.',
            },
          },
        },
      })),
      'find_orphans.excludeKinds default description drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            required: [],
          },
        },
      )),
      'query_ontology required schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryConceptsTool(
        {
          ...queryConceptsTool,
          description: 'Typed filter DSL.',
        },
      )),
      'query_concepts description missing typed filter DSL guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryConceptsTool(
        {
          ...queryConceptsTool,
          inputSchema: {
            ...queryConceptsTool.inputSchema,
            properties: {
              ...queryConceptsTool.inputSchema.properties,
              filter: {
                type: 'string',
                description: 'Filter expression.',
              },
            },
          },
        },
      )),
      'query_concepts inputSchema filter DSL guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryConceptsTool(
        {
          ...queryConceptsTool,
          inputSchema: {
            ...queryConceptsTool.inputSchema,
            properties: {
              ...queryConceptsTool.inputSchema.properties,
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 500,
                description: 'Positive integer max rows to return.',
              },
            },
          },
        },
      )),
      'query_concepts inputSchema limit default description drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'query_concepts'),
        {
          ...tools.find((tool) => tool.name === 'query_concepts'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'query_concepts').outputSchema,
            required: ['filter', 'parsedAs', 'matches', 'total', 'limited'],
          },
        },
      ]),
      'query_concepts outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'query_concepts'),
        {
          ...tools.find((tool) => tool.name === 'query_concepts'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'query_concepts').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'query_concepts').outputSchema.properties,
              matches: {
                ...tools.find((tool) => tool.name === 'query_concepts').outputSchema.properties.matches,
                items: {
                  ...tools.find((tool) => tool.name === 'query_concepts').outputSchema.properties.matches.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'query_concepts').outputSchema.properties.matches.items.properties,
                    mtime: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ]),
      'query_concepts outputSchema row mtime drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'compile_ontology'),
        {
          ...tools.find((tool) => tool.name === 'compile_ontology'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'compile_ontology').outputSchema,
            required: tools.find((tool) => tool.name === 'compile_ontology').outputSchema.required.filter((name) => name !== 'graphHash'),
          },
        },
      ]),
      'compile_ontology outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        description: 'Compile the vault.',
      })),
      'compile_ontology description missing large-vault guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        inputSchema: {
          ...compileOntologyTool.inputSchema,
          properties: {
            ...compileOntologyTool.inputSchema.properties,
            summary: { type: 'boolean', description: 'Short result.' },
          },
        },
      })),
      'compile_ontology summary schema guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        inputSchema: {
          ...compileOntologyTool.inputSchema,
          properties: {
            ...compileOntologyTool.inputSchema.properties,
            nodesLimit: {
              type: 'integer',
              minimum: 1,
              maximum: 500,
              description: 'Positive integer max nodes to return.',
            },
          },
        },
      })),
      'compile_ontology nodesLimit pagination guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'compile_ontology'),
        {
          ...tools.find((tool) => tool.name === 'compile_ontology'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'compile_ontology').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'compile_ontology').outputSchema.properties,
              byKind: {
                type: 'object',
                additionalProperties: { type: 'number', minimum: 0 },
              },
            },
          },
        },
      ]),
      'compile_ontology outputSchema byKind drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        outputSchema: {
          ...compileOntologyTool.outputSchema,
          properties: {
            ...compileOntologyTool.outputSchema.properties,
            nodes: undefined,
          },
        },
      })),
      'compile_ontology outputSchema nodes drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        outputSchema: {
          ...compileOntologyTool.outputSchema,
          properties: {
            ...compileOntologyTool.outputSchema.properties,
            edges: {
              ...compileOntologyTool.outputSchema.properties.edges,
              items: {
                ...compileOntologyTool.outputSchema.properties.edges.items,
                required: ['id', 'from', 'to', 'via', 'ref', 'resolved'],
              },
            },
          },
        },
      })),
      'compile_ontology outputSchema edges drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        outputSchema: {
          ...compileOntologyTool.outputSchema,
          properties: {
            ...compileOntologyTool.outputSchema.properties,
            nodesPagination: {
              ...compileOntologyTool.outputSchema.properties.nodesPagination,
              properties: {
                ...compileOntologyTool.outputSchema.properties.nodesPagination.properties,
                returned: { type: 'number', minimum: 0 },
              },
            },
          },
        },
      })),
      'compile_ontology outputSchema nodesPagination drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        outputSchema: {
          ...compileOntologyTool.outputSchema,
          properties: {
            ...compileOntologyTool.outputSchema.properties,
            canonicalizationActions: {
              ...compileOntologyTool.outputSchema.properties.canonicalizationActions,
              items: {
                ...compileOntologyTool.outputSchema.properties.canonicalizationActions.items,
                required: ['slug', 'keys', 'frontmatter'],
              },
            },
          },
        },
      })),
      'compile_ontology outputSchema canonicalizationActions drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        outputSchema: {
          ...compileOntologyTool.outputSchema,
          properties: {
            ...compileOntologyTool.outputSchema.properties,
            indexes: {
              ...compileOntologyTool.outputSchema.properties.indexes,
              properties: {
                ...compileOntologyTool.outputSchema.properties.indexes.properties,
                aliasToSlug: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                },
              },
            },
          },
        },
      })),
      'compile_ontology outputSchema indexes.aliasToSlug drift',
    );
    assert.equal(
      toolsListSchemaFailure(withCompileOntologyTool({
        ...compileOntologyTool,
        outputSchema: {
          ...compileOntologyTool.outputSchema,
          properties: {
            ...compileOntologyTool.outputSchema.properties,
            summary: {
              ...compileOntologyTool.outputSchema.properties.summary,
              required: ['nodes', 'edges', 'graphHash'],
            },
          },
        },
      })),
      'compile_ontology outputSchema summary drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'analyze_repo_structure'),
        {
          ...tools.find((tool) => tool.name === 'analyze_repo_structure'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema.properties,
              framework: { enum: ['fsd', 'generic'] },
            },
          },
        },
      ]),
      'analyze_repo_structure outputSchema framework drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'analyze_repo_structure'),
        {
          ...tools.find((tool) => tool.name === 'analyze_repo_structure'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema.properties,
              project: {
                ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema.properties.project,
                additionalProperties: true,
              },
            },
          },
        },
      ]),
      'analyze_repo_structure outputSchema project drift',
    );
    assert.equal(
      toolsListSchemaFailure(withAnalyzeRepoTool({
        ...analyzeRepoTool,
        description: 'Analyze repository.',
      })),
      'analyze_repo_structure description missing bootstrap safety guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withAnalyzeRepoTool({
        ...analyzeRepoTool,
        inputSchema: {
          ...analyzeRepoTool.inputSchema,
          properties: {
            ...analyzeRepoTool.inputSchema.properties,
            rootPath: {
              type: 'string',
              minLength: 1,
              description: 'Repository root.',
            },
          },
        },
      })),
      'analyze_repo_structure rootPath schema guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'analyze_repo_structure'),
        {
          ...tools.find((tool) => tool.name === 'analyze_repo_structure'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema.properties,
              capabilities: {
                ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema.properties.capabilities,
                items: {
                  ...tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema.properties.capabilities.items,
                  required: ['slug', 'title'],
                },
              },
            },
          },
        },
      ]),
      'analyze_repo_structure outputSchema capabilities rows drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'infer_imports'),
        {
          ...tools.find((tool) => tool.name === 'infer_imports'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'infer_imports').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties,
              edges: {
                ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.edges,
                items: {
                  ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.edges.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.edges.items.properties,
                    kind: { enum: ['static', 'side'] },
                  },
                },
              },
            },
          },
        },
      ]),
      'infer_imports outputSchema edge kind drift',
    );
    assert.equal(
      toolsListSchemaFailure(withInferImportsTool({
        ...inferImportsTool,
        description: 'Infer imports.',
      })),
      'infer_imports description missing dependency-ingest safety guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withInferImportsTool({
        ...inferImportsTool,
        inputSchema: {
          ...inferImportsTool.inputSchema,
          properties: {
            ...inferImportsTool.inputSchema.properties,
            maxFiles: {
              type: 'integer',
              minimum: 1,
              maximum: 50000,
              description: 'Positive integer cap on files walked.',
            },
          },
        },
      })),
      'infer_imports maxFiles hard-stop guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'infer_imports'),
        {
          ...tools.find((tool) => tool.name === 'infer_imports'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'infer_imports').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties,
              unresolved: {
                ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.unresolved,
                items: {
                  ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.unresolved.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.unresolved.items.properties,
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ]),
      'infer_imports outputSchema unresolved reason drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'infer_imports'),
        {
          ...tools.find((tool) => tool.name === 'infer_imports'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'infer_imports').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties,
              moduleEdges: {
                ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.moduleEdges,
                items: {
                  ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.moduleEdges.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.moduleEdges.items.properties,
                    count: { type: 'number', minimum: 1 },
                  },
                },
              },
            },
          },
        },
      ]),
      'infer_imports outputSchema moduleEdges count drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'infer_imports'),
        {
          ...tools.find((tool) => tool.name === 'infer_imports'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'infer_imports').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties,
              moduleEdges: {
                ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.moduleEdges,
                items: {
                  ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.moduleEdges.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'infer_imports').outputSchema.properties.moduleEdges.items.properties,
                    kindCounts: {
                      type: 'object',
                      properties: {
                        static: { type: 'integer', minimum: 1 },
                        dynamic: { type: 'integer', minimum: 1 },
                        require: { type: 'integer', minimum: 1 },
                        reexport: { type: 'integer', minimum: 1 },
                        side: { type: 'number', minimum: 1 },
                      },
                      additionalProperties: false,
                      minProperties: 1,
                    },
                  },
                },
              },
            },
          },
        },
      ]),
      'infer_imports outputSchema moduleEdges kindCounts drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              operation: { enum: QUERY_ONTOLOGY_OPERATIONS.filter((operation) => operation !== 'health') },
            },
          },
        },
      )),
      'query_ontology operation enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              targetOperation: { enum: [...QUERY_PLAN_TARGET_OPERATIONS, 'query_plan'] },
            },
          },
        },
      )),
      'query_ontology targetOperation enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              phases: { items: { enum: ['repair', 'link'] } },
            },
          },
        },
      )),
      'query_ontology phases enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              severities: { items: { enum: ['warn'] } },
            },
          },
        },
      )),
      'query_ontology severities enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              kinds: { items: { enum: ['add_missing_relation'] } },
            },
          },
        },
      )),
      'query_ontology maintenance kinds enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              kind: { type: 'string', enum: NODE_KIND_VALUES.filter((kind) => kind !== 'document') },
            },
          },
        },
      )),
      'query_ontology kind graph kind enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              kind: {
                ...queryOntologyTool.inputSchema.properties.kind,
                description: 'match_nodes: optional node kind filter.',
              },
            },
          },
        },
      )),
      'query_ontology kind graph kind description drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              fromKind: { type: 'string', enum: NODE_KIND_VALUES.filter((kind) => kind !== 'domain') },
            },
          },
        },
      )),
      'query_ontology fromKind graph kind enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              fromKind: {
                ...queryOntologyTool.inputSchema.properties.fromKind,
                description: 'match_edges only: optional source node kind filter.',
              },
            },
          },
        },
      )),
      'query_ontology fromKind graph kind description drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              toKind: { type: 'string', enum: EDGE_TARGET_KIND_VALUES.filter((kind) => kind !== 'external') },
            },
          },
        },
      )),
      'query_ontology toKind graph kind enum schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...queryOntologyTool,
          inputSchema: {
            ...queryOntologyTool.inputSchema,
            properties: {
              ...queryOntologyTool.inputSchema.properties,
              toKind: {
                ...queryOntologyTool.inputSchema.properties.toKind,
                description: 'match_edges only: optional target kind filter.',
              },
            },
          },
        },
      )),
      'query_ontology toKind graph kind description drift',
    );
    assert.equal(
      toolsListSchemaFailure(tools.filter((tool) => tool.name !== 'get_concepts')),
      'tools/list response missing get_concepts tool',
    );
    assert.equal(
      toolsListSchemaFailure([
        tools[0],
        {
          ...tools[1],
          description: 'Fetch multiple nodes in one call.',
        },
        ...tools.slice(2),
      ]),
      'get_concepts description missing batch partial-result guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        tools[0],
        {
          ...tools[1],
          inputSchema: {
            ...tools[1].inputSchema,
            properties: {
              ...tools[1].inputSchema.properties,
              slugs: {
                type: 'array',
                maxItems: 50,
                items: { type: 'string' },
                description: 'Vault-relative slugs. Max 50 per call.',
              },
            },
          },
        },
        ...tools.slice(2),
      ]),
      'get_concepts inputSchema slugs alias and cap guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        tools[0],
        {
          ...tools[1],
          inputSchema: {
            ...tools[1].inputSchema,
            required: [],
          },
        },
        ...tools.slice(2),
      ]),
      'get_concepts required schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        tools[0],
        {
          ...tools[1],
          outputSchema: { ...tools[1].outputSchema, required: [] },
        },
        ...tools.slice(2),
      ]),
      'get_concepts outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        tools[0],
        {
          ...tools[1],
          outputSchema: {
            ...tools[1].outputSchema,
            properties: {
              ...tools[1].outputSchema.properties,
              concepts: {
                ...tools[1].outputSchema.properties.concepts,
                items: {
                  ...tools[1].outputSchema.properties.concepts.items,
                  properties: {
                    ...tools[1].outputSchema.properties.concepts.items.properties,
                    mtime: { type: 'integer', minimum: 0 },
                  },
                },
              },
            },
          },
        },
        ...tools.slice(2),
      ]),
      'get_concepts outputSchema row mtime drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        tools[0],
        tools[1],
        {
          ...tools.find((tool) => tool.name === 'get_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'get_concept').outputSchema,
            required: ['slug', 'frontmatter'],
          },
        },
        ...tools.filter((tool) => !['list_concepts', 'get_concepts', 'get_concept'].includes(tool.name)),
      ]),
      'get_concept outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        tools[0],
        tools[1],
        {
          ...tools.find((tool) => tool.name === 'get_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'get_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'get_concept').outputSchema.properties,
              neighbors: {
                ...tools.find((tool) => tool.name === 'get_concept').outputSchema.properties.neighbors,
                properties: {
                  ...tools.find((tool) => tool.name === 'get_concept').outputSchema.properties.neighbors.properties,
                  dependencies: { type: 'object' },
                },
              },
            },
          },
        },
        ...tools.filter((tool) => !['list_concepts', 'get_concepts', 'get_concept'].includes(tool.name)),
      ]),
      'get_concept outputSchema neighbors dependencies drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_evidence'),
        {
          ...tools.find((tool) => tool.name === 'find_evidence'),
          outputSchema: { ...tools.find((tool) => tool.name === 'find_evidence').outputSchema, required: ['matches', 'query'] },
        },
      ]),
      'find_evidence outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindEvidenceTool(
        {
          ...findEvidenceTool,
          description: 'Find vault docs.',
        },
      )),
      'find_evidence description missing excerpt guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withFindEvidenceTool(
        {
          ...findEvidenceTool,
          inputSchema: {
            ...findEvidenceTool.inputSchema,
            properties: {
              ...findEvidenceTool.inputSchema.properties,
              title: {
                type: 'string',
                minLength: 1,
                description: 'Concept title to search for.',
              },
            },
          },
        },
      )),
      'find_evidence inputSchema title guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_evidence'),
        {
          ...tools.find((tool) => tool.name === 'find_evidence'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'find_evidence').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_evidence').outputSchema.properties,
              matches: {
                ...tools.find((tool) => tool.name === 'find_evidence').outputSchema.properties.matches,
                items: {
                  ...tools.find((tool) => tool.name === 'find_evidence').outputSchema.properties.matches.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'find_evidence').outputSchema.properties.matches.items.properties,
                    matchedIn: { enum: ['frontmatter'] },
                  },
                },
              },
            },
          },
        },
      ]),
      'find_evidence outputSchema match matchedIn drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_backlinks'),
        {
          ...tools.find((tool) => tool.name === 'find_backlinks'),
          outputSchema: { ...tools.find((tool) => tool.name === 'find_backlinks').outputSchema, required: ['matches', 'target', 'total'] },
        },
      ]),
      'find_backlinks outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindBacklinksTool(
        {
          ...findBacklinksTool,
          description: 'Return backlinks.',
        },
      )),
      'find_backlinks description missing dependent-walk guidance',
    );
    assert.equal(
      toolsListSchemaFailure(withFindBacklinksTool(
        {
          ...findBacklinksTool,
          inputSchema: {
            ...findBacklinksTool.inputSchema,
            properties: {
              ...findBacklinksTool.inputSchema.properties,
              slug: {
                type: 'string',
                minLength: 1,
                description: 'Target slug.',
              },
            },
          },
        },
      )),
      'find_backlinks inputSchema slug guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_backlinks'),
        {
          ...tools.find((tool) => tool.name === 'find_backlinks'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'find_backlinks').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_backlinks').outputSchema.properties,
              matches: {
                ...tools.find((tool) => tool.name === 'find_backlinks').outputSchema.properties.matches,
                items: {
                  ...tools.find((tool) => tool.name === 'find_backlinks').outputSchema.properties.matches.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'find_backlinks').outputSchema.properties.matches.items.properties,
                    matchedKeys: { type: 'array', items: { type: 'number' } },
                  },
                },
              },
            },
          },
        },
      ]),
      'find_backlinks outputSchema match matchedKeys drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_neighbors'),
        {
          ...tools.find((tool) => tool.name === 'find_neighbors'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema.properties,
              edges: {
                ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema.properties.edges,
                items: {
                  ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema.properties.edges.items,
                  required: ['direction', 'from', 'to', 'via', 'resolved'],
                },
              },
            },
          },
        },
      ]),
      'find_neighbors outputSchema edges drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_neighbors'),
        {
          ...tools.find((tool) => tool.name === 'find_neighbors'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema.properties,
              nodes: {
                ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema.properties.nodes,
                items: {
                  ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema.properties.nodes.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'find_neighbors').outputSchema.properties.nodes.items.properties,
                    mtime: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ]),
      'find_neighbors outputSchema node mtime drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindNeighborsTool(
        {
          ...findNeighborsTool,
          inputSchema: {
            ...findNeighborsTool.inputSchema,
            properties: {
              ...findNeighborsTool.inputSchema.properties,
              direction: {
                type: 'string',
                enum: ['outgoing', 'incoming', 'both'],
                description: 'Edge direction to include.',
              },
            },
          },
        },
      )),
      'find_neighbors inputSchema direction default description drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindNeighborsTool(
        {
          ...findNeighborsTool,
          inputSchema: {
            ...findNeighborsTool.inputSchema,
            properties: {
              ...findNeighborsTool.inputSchema.properties,
              types: {
                type: 'array',
                maxItems: RELATION_TYPE_VALUES.length,
                items: { type: 'string' },
                description: 'Optional relation types/frontmatter keys to include.',
              },
            },
          },
        },
      )),
      'find_neighbors inputSchema types alias guidance drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindNeighborsTool(
        {
          ...findNeighborsTool,
          inputSchema: {
            ...findNeighborsTool.inputSchema,
            properties: {
              ...findNeighborsTool.inputSchema.properties,
              includeNodes: {
                type: 'boolean',
                description: 'Include neighbor node summaries for resolved edges.',
              },
            },
          },
        },
      )),
      'find_neighbors inputSchema includeNodes default description drift',
    );
    assert.equal(
      toolsListSchemaFailure(withFindNeighborsTool(
        {
          ...findNeighborsTool,
          inputSchema: {
            ...findNeighborsTool.inputSchema,
            properties: {
              ...findNeighborsTool.inputSchema.properties,
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 500,
                description: 'Positive integer max edges to return.',
              },
            },
          },
        },
      )),
      'find_neighbors inputSchema limit default description drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_path'),
        {
          ...tools.find((tool) => tool.name === 'find_path'),
          inputSchema: {
            ...tools.find((tool) => tool.name === 'find_path').inputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_path').inputSchema.properties,
              maxHops: {
                type: 'integer',
                minimum: 0,
                maximum: 20,
                description: 'Non-negative integer maximum hop count.',
              },
            },
          },
        },
      ]),
      'find_path inputSchema maxHops default description drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_path'),
        {
          ...tools.find((tool) => tool.name === 'find_path'),
          outputSchema: { ...tools.find((tool) => tool.name === 'find_path').outputSchema, required: ['from', 'found', 'to'] },
        },
      ]),
      'find_path outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_path'),
        {
          ...tools.find((tool) => tool.name === 'find_path'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'find_path').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties,
              edges: {
                ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties.edges,
                items: {
                  ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties.edges.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties.edges.items.properties,
                    via: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      ]),
      'find_path outputSchema edge via drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_path'),
        {
          ...tools.find((tool) => tool.name === 'find_path'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'find_path').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties,
              nodes: {
                ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties.nodes,
                items: {
                  ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties.nodes.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'find_path').outputSchema.properties.nodes.items.properties,
                    title: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      ]),
      'find_path outputSchema node title drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_orphans'),
        {
          ...tools.find((tool) => tool.name === 'find_orphans'),
          outputSchema: { ...tools.find((tool) => tool.name === 'find_orphans').outputSchema, required: ['orphans', 'total'] },
        },
      ]),
      'find_orphans outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'find_orphans'),
        {
          ...tools.find((tool) => tool.name === 'find_orphans'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'find_orphans').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'find_orphans').outputSchema.properties,
              orphans: {
                ...tools.find((tool) => tool.name === 'find_orphans').outputSchema.properties.orphans,
                items: {
                  ...tools.find((tool) => tool.name === 'find_orphans').outputSchema.properties.orphans.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'find_orphans').outputSchema.properties.orphans.items.properties,
                    mtime: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ]),
      'find_orphans outputSchema row mtime drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing row isolation guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes isolate non-object row shape and unknown row fields as ok:false rows and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing row label guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing single-field repair guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, multi unknown-field rows report every unknown field with nearest hints and Received fields, and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing single-field repair guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, unknown-field rows report every unknown field with nearest hints and Received fields, and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing multi-field received fields guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every unknown field with nearest hints and Received fields, and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing duplicate row guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every unknown field with nearest hints and Received fields, duplicate input slugs report the later `concepts[n]` row plus first-seen `concepts[m]`, and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing duplicate structured row repair guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          description: 'Batch writes isolate non-object row shape and unknown row fields as ok:false rows with concepts[n] labels, single unknown-field rows include `receivedField` plus one-row `unknownFields`, multi unknown-field rows report every unknown field with nearest hints and Received fields, duplicate input slugs report the later `concepts[n]` row plus first-seen `concepts[m]` with structured `rowName` / `firstSeenAt`, and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_concepts description missing invalid-only no-write metadata guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          inputSchema: {
            ...tools.find((tool) => tool.name === 'add_concepts').inputSchema,
            properties: { concepts: { type: 'array', maxItems: 51 } },
          },
        },
      ]),
      'add_concepts.concepts batch cap schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_concepts').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties,
              concepts: {
                ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts,
                items: {
                  ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts.items,
                  required: ['slug'],
                },
              },
            },
          },
        },
      ]),
      'add_concepts outputSchema rows drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_concepts').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties,
              concepts: {
                ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts,
                items: {
                  ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts.items.properties,
                    unknownFields: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          suggestion: { type: 'string' },
                        },
                        required: ['name'],
                        additionalProperties: false,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ]),
      'add_concepts outputSchema row unknownFields item drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_concepts').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties,
              concepts: {
                ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts,
                items: {
                  ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts.items.properties,
                    allowedValues: { type: 'array', items: { type: 'number' } },
                  },
                },
              },
            },
          },
        },
      ]),
      'add_concepts outputSchema row allowedValues drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concepts'),
        {
          ...tools.find((tool) => tool.name === 'add_concepts'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_concepts').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties,
              concepts: {
                ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts,
                items: {
                  ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'add_concepts').outputSchema.properties.concepts.items.properties,
                    receivedValue: {},
                  },
                },
              },
            },
          },
        },
      ]),
      'add_concepts outputSchema row receivedValue drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing row isolation guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint, and unknown row fields as ok:false rows and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing row label guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint, and unknown row fields as ok:false rows with relations[n] labels and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing structured rowName guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName` and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing single-field repair guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, multi unknown-field rows report every unknown field with nearest hints and Received fields, and return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing single-field repair guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and unknown-field rows report every unknown field with nearest hints and Received fields. Return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing multi-field received fields guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and multi unknown-field rows report every unknown field with nearest hints and Received fields. Return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing structured field-list guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields. Return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing closest-value type guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields. Return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing structured value repair guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          description: 'Batch writes isolate non-object row shape, unknown type with closest-value hint and structured `valueName` / `receivedValue` / `suggestion` / `allowedValues`, and unknown row fields as ok:false rows with relations[n] labels and structured `rowName`, single unknown-field rows include `receivedField` plus one-row `unknownFields`, and multi unknown-field rows report every unknown field with nearest hints, `allowedFields`, `receivedFields`, and Received fields. Return postWriteMaintenance with byPhase bySeverity byKind score proposedAction and current-page nextExecutableAction / nextReviewAction pointers.',
        },
      ]),
      'add_relations description missing invalid-only no-write metadata guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_relations').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties,
              relations: {
                ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations,
                items: {
                  ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items.properties,
                    alreadyExists: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ]),
      'add_relations outputSchema row alreadyExists drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_relations').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties,
              relations: {
                ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations,
                items: {
                  ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items.properties,
                    unknownFields: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                        },
                        required: ['name'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ]),
      'add_relations outputSchema row unknownFields item drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_relations').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties,
              relations: {
                ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations,
                items: {
                  ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items.properties,
                    similarSlugs: { type: 'array', items: { type: 'number' } },
                  },
                },
              },
            },
          },
        },
      ]),
      'add_relations outputSchema row similarSlugs drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relations'),
        {
          ...tools.find((tool) => tool.name === 'add_relations'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_relations').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties,
              relations: {
                ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations,
                items: {
                  ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'add_relations').outputSchema.properties.relations.items.properties,
                    receivedValue: {},
                  },
                },
              },
            },
          },
        },
      ]),
      'add_relations outputSchema row receivedValue drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_concept'),
        {
          ...tools.find((tool) => tool.name === 'add_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_concept').outputSchema.properties,
              warnings: { type: 'array', items: { type: 'number' } },
            },
          },
        },
      ]),
      'add_concept outputSchema warnings drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relation'),
        {
          ...tools.find((tool) => tool.name === 'add_relation'),
          description: `Invalid relation \`type\` has a closest-value hint and structured \`valueName\` / \`receivedValue\` / \`suggestion\` / \`allowedValues\` repair fields, with no \`changed\`, \`alreadyExists\`, or \`postWriteMaintenance\` write metadata. Changed writes return ${postWriteDescription}.`,
        },
      ]),
      'add_relation description missing type-preflight guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relation'),
        {
          ...tools.find((tool) => tool.name === 'add_relation'),
          description: `Invalid relation \`type\` is rejected before endpoint slug resolution with structured \`valueName\` / \`receivedValue\` / \`suggestion\` / \`allowedValues\` repair fields, with no \`changed\`, \`alreadyExists\`, or \`postWriteMaintenance\` write metadata. Changed writes return ${postWriteDescription}.`,
        },
      ]),
      'add_relation description missing closest-value type guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relation'),
        {
          ...tools.find((tool) => tool.name === 'add_relation'),
          description: `Invalid relation \`type\` is rejected before endpoint slug resolution with a closest-value hint, with no \`changed\`, \`alreadyExists\`, or \`postWriteMaintenance\` write metadata. Changed writes return ${postWriteDescription}.`,
        },
      ]),
      'add_relation description missing structured value repair guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relation'),
        {
          ...tools.find((tool) => tool.name === 'add_relation'),
          description: `Invalid relation \`type\` is rejected before endpoint slug resolution with a closest-value hint and structured \`valueName\` / \`receivedValue\` / \`suggestion\` / \`allowedValues\` repair fields. Changed writes return ${postWriteDescription}.`,
        },
      ]),
      'add_relation description missing non-write preflight metadata guidance',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relation'),
        {
          ...tools.find((tool) => tool.name === 'add_relation'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'add_relation').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_relation').outputSchema.properties,
              alreadyExists: { type: 'string' },
            },
          },
        },
      ]),
      'add_relation outputSchema alreadyExists drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'patch_concept'),
        {
          ...tools.find((tool) => tool.name === 'patch_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'patch_concept').outputSchema,
            required: ['ok', 'slug', 'filePath', 'changed'],
          },
        },
      ]),
      'patch_concept outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'rename_concept'),
        {
          ...tools.find((tool) => tool.name === 'rename_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'rename_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties,
              backlinkUpdates: { type: 'array' },
            },
          },
        },
      ]),
      'rename_concept outputSchema backlinkUpdates drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'rename_concept'),
        {
          ...tools.find((tool) => tool.name === 'rename_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'rename_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties,
              backlinkUpdates: {
                ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates,
                properties: {
                  ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties,
                  updates: {
                    ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates,
                    items: {
                      ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates.items,
                      properties: {
                        ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates.items.properties,
                        slug: { type: 'string', minLength: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ]),
      'rename_concept outputSchema backlinkUpdates updates drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'rename_concept'),
        {
          ...tools.find((tool) => tool.name === 'rename_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'rename_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties,
              backlinkUpdates: {
                ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates,
                properties: {
                  ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties,
                  updates: {
                    ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates,
                    items: {
                      ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates.items,
                      properties: {
                        ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates.items.properties,
                        beforeKeys: {
                          ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates.items.properties.beforeKeys,
                          items: {
                            ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates.items.properties.beforeKeys.items,
                            properties: {
                              ...tools.find((tool) => tool.name === 'rename_concept').outputSchema.properties.backlinkUpdates.properties.updates.items.properties.beforeKeys.items.properties,
                              before: {
                                type: ['array', 'string'],
                                items: { type: 'string', minLength: 1, pattern: '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ]),
      'rename_concept outputSchema backlinkUpdates beforeKeys drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'merge_concepts'),
        {
          ...tools.find((tool) => tool.name === 'merge_concepts'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'merge_concepts').outputSchema,
            required: ['ok', 'fromSlug', 'intoSlug', 'fromPath', 'deleted', 'backlinkUpdates'],
          },
        },
      ]),
      'merge_concepts outputSchema required drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'delete_concept'),
        {
          ...tools.find((tool) => tool.name === 'delete_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'delete_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'delete_concept').outputSchema.properties,
              backlinksAtDelete: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      ]),
      'delete_concept outputSchema backlinksAtDelete drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'delete_concept'),
        {
          ...tools.find((tool) => tool.name === 'delete_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'delete_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'delete_concept').outputSchema.properties,
              slug: { type: 'string', minLength: 1 },
            },
          },
        },
      ]),
      'delete_concept outputSchema slug drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'delete_concept'),
        {
          ...tools.find((tool) => tool.name === 'delete_concept'),
          outputSchema: {
            ...tools.find((tool) => tool.name === 'delete_concept').outputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'delete_concept').outputSchema.properties,
              backlinksAtDelete: {
                ...tools.find((tool) => tool.name === 'delete_concept').outputSchema.properties.backlinksAtDelete,
                items: {
                  ...tools.find((tool) => tool.name === 'delete_concept').outputSchema.properties.backlinksAtDelete.items,
                  properties: {
                    ...tools.find((tool) => tool.name === 'delete_concept').outputSchema.properties.backlinksAtDelete.items.properties,
                    matchedKeys: { type: 'array', items: { type: 'string', minLength: 1 } },
                  },
                },
              },
            },
          },
        },
      ]),
      'delete_concept outputSchema backlinksAtDelete drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'add_relation'),
        {
          ...tools.find((tool) => tool.name === 'add_relation'),
          inputSchema: {
            ...tools.find((tool) => tool.name === 'add_relation').inputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'add_relation').inputSchema.properties,
              expected_mtime: { type: 'number' },
            },
          },
        },
      ]),
      'add_relation.expected_mtime conflict guard schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'rename_concept'),
        {
          ...tools.find((tool) => tool.name === 'rename_concept'),
          inputSchema: {
            ...tools.find((tool) => tool.name === 'rename_concept').inputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'rename_concept').inputSchema.properties,
              overwrite: { type: 'string' },
            },
          },
        },
      ]),
      'rename_concept.overwrite destructive safety schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'delete_concept'),
        {
          ...tools.find((tool) => tool.name === 'delete_concept'),
          inputSchema: {
            ...tools.find((tool) => tool.name === 'delete_concept').inputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'delete_concept').inputSchema.properties,
              confirm: { type: 'string' },
            },
          },
        },
      ]),
      'delete_concept.confirm dry-run safety schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.filter((tool) => tool.name !== 'delete_concept'),
        {
          ...tools.find((tool) => tool.name === 'delete_concept'),
          inputSchema: {
            ...tools.find((tool) => tool.name === 'delete_concept').inputSchema,
            properties: {
              ...tools.find((tool) => tool.name === 'delete_concept').inputSchema.properties,
              force: { type: 'string' },
            },
          },
        },
      ]),
      'delete_concept.force destructive safety schema drift',
    );
  });

  it('parses verify timeout env as a strict positive integer', () => {
    assert.equal(parseVerifyTimeoutMs(undefined), 8000);
    assert.equal(parseVerifyTimeoutMs(''), 8000);
    assert.equal(parseVerifyTimeoutMs('15000'), 15000);
  });

  it('parses verify timeout kill grace env as a strict positive integer', () => {
    assert.equal(parseVerifyKillGraceMs({}), 1_000);
    assert.equal(parseVerifyKillGraceMs({ OMOT_VERIFY_KILL_GRACE_MS: '' }), 1_000);
    assert.equal(parseVerifyKillGraceMs({ OMOT_VERIFY_KILL_GRACE_MS: '25' }), 25);
    assert.equal(parseVerifyKillGraceMs({ OMOT_VERIFY_KILL_GRACE_MS: '25ms' }), false);
    assert.equal(parseVerifyKillGraceMs({ OMOT_VERIFY_KILL_GRACE_MS: '0' }), false);
    assert.match(
      verifyKillGraceValueErrorMessage({ OMOT_VERIFY_KILL_GRACE_MS: '25ms' }),
      /Received: "25ms"/,
    );
    assert.match(
      verifyKillGraceValueErrorMessage({ OMOT_VERIFY_KILL_GRACE_MS: '25ms' }),
      /OMOT_VERIFY_KILL_GRACE_MS=N/,
    );
  });

  it('resolves verify vault from explicit arg, env, or cwd', () => {
    assert.equal(
      resolveVerifyVault({ env: { OMOT_VAULT: '/tmp/env-vault' }, argv: ['node', 'verify.mjs', '/tmp/arg-vault'], cwd: '/tmp/cwd', isMain: true }),
      '/tmp/arg-vault',
    );
    assert.equal(
      resolveVerifyVault({ env: {}, argv: ['node', 'verify.mjs', '/tmp/arg-vault'], cwd: '/tmp/cwd', isMain: true }),
      '/tmp/arg-vault',
    );
    assert.equal(
      resolveVerifyVault({ env: { OMOT_VAULT: '/tmp/env-vault' }, argv: ['node', 'verify.mjs'], cwd: '/tmp/cwd', isMain: true }),
      '/tmp/env-vault',
    );
    assert.equal(
      resolveVerifyVault({ env: {}, argv: ['node', 'verify.mjs', '/tmp/arg-vault'], cwd: '/tmp/cwd', isMain: false }),
      '/tmp/cwd',
    );
    assert.equal(resolveVerifyVault({ env: {}, argv: ['node', 'verify.mjs'], cwd: '/tmp/cwd', isMain: true }), '/tmp/cwd');
  });

  it('fails missing verify vault paths before server startup', () => {
    const error = verifyVaultPathError('docs/ontology', join(__dirname, '..'));
    assert.match(error, /vault path does not exist: docs\/ontology/);
    assert.match(error, /pnpm --filter \.\/mcp verify -- \.\.\.`/);
    assert.match(error, /use `\.\.\/docs\/ontology` for the dogfood vault/);
    assert.equal(verifyVaultPathError(join(__dirname, '..')), null);
  });

  it('fails empty verify vaults with a populated-vault recovery hint', () => {
    const error = emptyVerifyVaultFailure({
      total: 0,
      vaultRoot: '/repo/mcp',
    });
    assert.match(error, /verify vault has 0 ontology nodes/);
    assert.match(error, /vaultRoot \/repo\/mcp/);
    assert.match(error, /Point verify at a populated ontology vault/);
    assert.match(error, /pnpm --filter \.\/mcp verify -- \.\.\.`/);
    assert.match(error, /use `\.\.\/docs\/ontology` for the dogfood vault/);
    assert.equal(emptyVerifyVaultFailure({ total: 1, vaultRoot: '/repo/docs/ontology' }), null);
  });

  it('direct empty verify vault exits before downstream read smokes', () => {
    const root = mkdtempSync(join(tmpdir(), 'omot-empty-verify-'));
    try {
      const result = spawnSync(
        process.execPath,
        [VERIFY_SCRIPT, root, '--timeout-ms', '3000'],
        { cwd: join(__dirname, '..'), encoding: 'utf8' },
      );

      assert.equal(result.status, 1);
      assert.equal(result.stderr, '');
      assert.match(result.stdout, /list_concepts — vault total 0 nodes/);
      assert.match(result.stdout, /verify vault has 0 ontology nodes/);
      assert.match(result.stdout, /Point verify at a populated ontology vault/);
      assert.doesNotMatch(result.stdout, /find_evidence response missing match kind/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses direct verify CLI args for vault, timeout, and help', () => {
    assert.deepEqual(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '/tmp/vault', '--timeout-ms', '15000'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: '15000', vault: '/tmp/vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: '/tmp/env-vault', OMOT_VERIFY_TIMEOUT_MS: '9000' }, argv: ['node', 'verify.mjs', '/tmp/arg-vault', '--timeout-ms=15000'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: '15000', vault: '/tmp/arg-vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: '   ' }, argv: ['node', 'verify.mjs', '/tmp/arg-vault'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: undefined, vault: '/tmp/arg-vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: '/tmp/env-vault', OMOT_VERIFY_TIMEOUT_MS: '9000' }, argv: ['node', 'verify.mjs'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: '9000', vault: '/tmp/env-vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: ' /tmp/env-vault ' }, argv: ['node', 'verify.mjs'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: undefined, vault: '/tmp/env-vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: '   ' }, argv: ['node', 'verify.mjs'], cwd: '/tmp/cwd', isMain: true }),
      { error: 'OMOT_VAULT requires a path value', help: false, timeoutMsRaw: undefined, vault: '/tmp/cwd' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault', '/tmp/vault', '--timeout-ms=15000'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: '15000', vault: '/tmp/vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: '   ' }, argv: ['node', 'verify.mjs', '--vault', '/tmp/vault'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: undefined, vault: '/tmp/vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault=/tmp/vault'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: undefined, vault: '/tmp/vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault', ' /tmp/vault '], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: false, timeoutMsRaw: undefined, vault: '/tmp/vault' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--help'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: true, timeoutMsRaw: undefined, vault: '/tmp/cwd' },
    );
    assert.deepEqual(normalizeVerifyArgs(['--', '--help']), ['--help']);
    assert.deepEqual(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--', '--help'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: true, timeoutMsRaw: undefined, vault: '/tmp/cwd' },
    );
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: '   ' }, argv: ['node', 'verify.mjs', '--help'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: true, timeoutMsRaw: undefined, vault: '/tmp/cwd' },
    );
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--timeout-ms'], cwd: '/tmp/cwd', isMain: true }).error, /Received: undefined/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--timeout-ms', '--vault'], cwd: '/tmp/cwd', isMain: true }).error, /Received: "--vault"/);
    assert.match(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '/tmp/vault', '--timeout-ms'], cwd: '/tmp/cwd', isMain: true }).error,
      /npm run verify -- --vault \/tmp\/vault --timeout-ms 15000/,
    );
    assert.match(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--timeout-ms', '--vault', '/tmp/vault'], cwd: '/tmp/cwd', isMain: true }).error,
      /--vault \/tmp\/vault --timeout-ms 15000/,
    );
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault'], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '   '], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault', '   '], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault= --bad'], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '/one', '--vault', '/two'], cwd: '/tmp/cwd', isMain: true }).error, /Unexpected extra vault argument/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '/one', '/two'], cwd: '/tmp/cwd', isMain: true }).error, /Unexpected extra vault argument/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--unknown'], cwd: '/tmp/cwd', isMain: true }).error, /Unknown option/);
    assert.match(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--timout-ms=1000'], cwd: '/tmp/cwd', isMain: true }).error,
      /Unknown option: --timout-ms=1000\. Did you mean --timeout-ms\?/,
    );
    assert.match(
      parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vualt'], cwd: '/tmp/cwd', isMain: true }).error,
      /Unknown option: --vualt\. Did you mean --vault\?/,
    );
  });

  it('prints direct verify argument errors to stderr only', () => {
    const result = spawnSync(
      process.execPath,
      [VERIFY_SCRIPT, '--timout-ms=1000'],
      { cwd: join(__dirname, '..'), encoding: 'utf8' },
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /\[oh-my-ontology-mcp verify\]/);
    assert.match(result.stderr, /Unknown option: --timout-ms=1000\. Did you mean --timeout-ms\?/);
    assert.match(result.stderr, /Usage:/);
  });

  it('prints direct verify timeout value errors to stderr only', () => {
    for (const env of [{}, { OMOT_VERIFY_TIMEOUT_MS: 'abc' }]) {
      const args = Object.keys(env).length === 0 ? [VERIFY_SCRIPT, '--timeout-ms', 'abc'] : [VERIFY_SCRIPT];
      const result = spawnSync(
        process.execPath,
        args,
        {
          cwd: join(__dirname, '..'),
          encoding: 'utf8',
          env: { ...process.env, ...env },
        },
      );

      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /\[oh-my-ontology-mcp verify\]/);
      assert.match(result.stderr, /verify timeout must be a positive integer/);
      assert.match(result.stderr, /Received: "abc"/);
      assert.match(result.stderr, /--timeout-ms N/);
      assert.match(result.stderr, /OMOT_VERIFY_TIMEOUT_MS=N/);
      assert.match(result.stderr, /npm run verify -- --timeout-ms 15000/);
    }

    const missing = spawnSync(
      process.execPath,
      [VERIFY_SCRIPT, '--timeout-ms'],
      { cwd: join(__dirname, '..'), encoding: 'utf8' },
    );

    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /\[oh-my-ontology-mcp verify\]/);
    assert.match(missing.stderr, /verify timeout must be a positive integer/);
    assert.match(missing.stderr, /Received: undefined/);
    assert.match(missing.stderr, /npm run verify -- --timeout-ms 15000/);

    const missingBeforeVault = spawnSync(
      process.execPath,
      [VERIFY_SCRIPT, '--timeout-ms', '--vault', '../docs/ontology'],
      { cwd: join(__dirname, '..'), encoding: 'utf8' },
    );

    assert.equal(missingBeforeVault.status, 1);
    assert.equal(missingBeforeVault.stdout, '');
    assert.match(missingBeforeVault.stderr, /Received: "--vault"/);
    assert.match(missingBeforeVault.stderr, /npm run verify -- --vault \.\.\/docs\/ontology --timeout-ms 15000/);

    const explicitVault = spawnSync(
      process.execPath,
      [VERIFY_SCRIPT, '--vault', '../docs/ontology', '--timeout-ms=abc'],
      { cwd: join(__dirname, '..'), encoding: 'utf8' },
    );

    assert.equal(explicitVault.status, 1);
    assert.equal(explicitVault.stdout, '');
    assert.match(explicitVault.stderr, /Received: "abc"/);
    assert.match(explicitVault.stderr, /npm run verify -- --vault \.\.\/docs\/ontology --timeout-ms 15000/);

    const explicitVaultAfterTimeout = spawnSync(
      process.execPath,
      [VERIFY_SCRIPT, '--timeout-ms=abc', '--vault', '../docs/ontology'],
      { cwd: join(__dirname, '..'), encoding: 'utf8' },
    );

    assert.equal(explicitVaultAfterTimeout.status, 1);
    assert.equal(explicitVaultAfterTimeout.stdout, '');
    assert.match(explicitVaultAfterTimeout.stderr, /Received: "abc"/);
    assert.match(explicitVaultAfterTimeout.stderr, /npm run verify -- --vault \.\.\/docs\/ontology --timeout-ms 15000/);

    const invalidKillGrace = spawnSync(
      process.execPath,
      [VERIFY_SCRIPT, '--timeout-ms', '1000'],
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf8',
        env: { ...process.env, OMOT_VERIFY_KILL_GRACE_MS: '1000ms' },
      },
    );

    assert.equal(invalidKillGrace.status, 1);
    assert.equal(invalidKillGrace.stdout, '');
    assert.match(invalidKillGrace.stderr, /\[oh-my-ontology-mcp verify\]/);
    assert.match(invalidKillGrace.stderr, /verify kill grace must be a positive integer/);
    assert.match(invalidKillGrace.stderr, /Received: "1000ms"/);
    assert.match(invalidKillGrace.stderr, /OMOT_VERIFY_KILL_GRACE_MS=N/);
    assert.match(invalidKillGrace.stderr, /Usage:/);
  });

  it('describes direct verify usage', () => {
    assert.match(verifyUsage(), /node mcp\/scripts\/verify\.mjs \[vault\] \[--timeout-ms N\]/);
    assert.match(verifyUsage(), /node mcp\/scripts\/verify\.mjs --vault path --timeout-ms 15000/);
    assert.match(verifyUsage(), /npm run verify -- \[vault\] \[--timeout-ms N\]/);
    assert.match(verifyUsage(), /npm run verify -- --vault path --timeout-ms 15000/);
    assert.match(verifyUsage(), /pnpm --filter \.\/mcp verify -- \[vault\] \[--timeout-ms N\]/);
    assert.match(verifyUsage(), /pnpm --filter \.\/mcp verify -- --help/);
    assert.match(verifyUsage(), /Run npm run verify from the mcp\/ package directory/);
    assert.match(verifyUsage(), /from the repo root, use node mcp\/scripts\/verify\.mjs or pnpm --filter \.\/mcp verify -- \.\.\./);
    assert.match(verifyUsage(), /Explicit \[vault\] or --vault arguments take precedence over OMOT_VAULT/);
    assert.match(verifyUsage(), /Timeout cleanup sends SIGTERM and then SIGKILL/);
    assert.match(verifyUsage(), /OMOT_VERIFY_KILL_GRACE_MS=N/);
    assert.match(verifyUsage(), /tool inventory \(missing\/extra\/duplicate\/invalid names\)/);
    assert.match(verifyUsage(), /project probe/);
    assert.match(verifyUsage(), /list\/project probe\/get_concept\/get_concepts\/find_evidence\/find_backlinks\/query_concepts\/limited query_concepts\/analyze_repo_structure\/infer_imports\/find_neighbors\/find_path\/find_orphans/);
    assert.match(verifyUsage(), /compile_ontology summary \+ paginated full-artifact \+ indexed full-artifact smoke/);
    assert.match(verifyUsage(), /Successful output prints read census consistency after cross-checking list_kinds\/list_concepts\/compile_ontology\/overview/);
    assert.match(verifyUsage(), /strict unknown-tool \/ unknown-argument \/ invalid-enum rejection/);
    assert.match(verifyUsage(), /query_concepts\.kind\/has-key, find_neighbors\.types, find_orphans\.kind\/excludeKinds, match_nodes\.kind\/sort, recommend_relations\.kind, and match_edges\.type\/fromKind\/toKind typo and unsupported-kind rejection/);
    assert.match(verifyUsage(), /tools\/list inventory names, initialize-instruction tool inventory, schema strictness, and annotation coverage \(title\/read\/write\/destructive\/idempotent\/local-only\)/);
    assert.match(verifyUsage(), /batch reader\/writer row isolation for non-object rows and unknown row fields with concepts\[n\]\/relations\[n\] error labels, invalid add_relations type closest-value hints, and 50-row batch cap rejection/);
    assert.match(verifyUsage(), /structuredContent coverage summary splits direct reads, batch row-isolation writes with no write metadata, destructive dry-runs, maintenance cursor checks, and graph queries/);
    assert.match(verifyUsage(), /maintenance_plan filter enums/);
    assert.match(verifyUsage(), /maintenance_plan cursor handling/);
    assert.match(verifyUsage(), /cursor\.found=true, cursor\.reason=null/);
    assert.match(verifyUsage(), /missing afterActionId/);
    assert.match(verifyUsage(), /cursor\.found=false, reason, empty page/);
    assert.match(verifyUsage(), /ready cursor has actions, verify resumes from the first returned action id/);
    assert.match(verifyUsage(), /nextExecutableAction \/ nextReviewAction point only at the first executable\/review action in the current returned page/);
    assert.match(verifyUsage(), /Successful cursor lines print bucket summaries plus current-page executable\/review next-action summaries/);
    assert.match(verifyUsage(), /Focused checks:/);
    assert.match(verifyUsage(), /pnpm test:mcp:verify\s+MCP verify helper contract without the full integration suite/);
    assert.match(verifyUsage(), /pnpm test:mcp:verify:first-contact/);
    assert.match(verifyUsage(), /Narrow first-contact initialize-tool-inventory\/initialize-safety-recovery\/unknown-tool\/write-safety\/health-summary\/advisory\/read\/sample-shape helper gates/);
    assert.match(verifyUsage(), /pnpm test:mcp:maintenance\s+Narrow maintenance_plan filter\/cursor\/resume\/work-queue formatter gates/);
    assert.match(verifyUsage(), /pnpm test:mcp:verify:timeout/);
    assert.match(verifyUsage(), /Narrow MCP verify timeout\/startup\/help\/empty-vault diagnostics/);
    assert.match(verifyUsage(), /pnpm test:dogfood:args\s+Narrow dogfood shortcut argument helper contract/);
    assert.match(verifyUsage(), /pnpm test:dogfood:script-refs\s+Narrow help\/package-script reference \+ focused wrapper summary contract/);
    assert.match(verifyUsage(), /pnpm dogfood:compile\s+Cheap root checkout compile_ontology summary snapshot/);
    assert.match(verifyUsage(), /pnpm dogfood:compile-fix\s+Cheap root checkout compile --fix idempotence gate; changed vaults need pnpm docs-vault:build; success ends with \[dogfood:compile-fix\] docs\/ontology unchanged/);
    assert.match(verifyUsage(), /pnpm test:dogfood:compile-fix\s+Narrow dogfood compile --fix idempotence runner contract/);
    assert.match(verifyUsage(), /pnpm dogfood:health\s+Cheap root checkout health gate/);
    assert.match(verifyUsage(), /pnpm dogfood:brief\s+Cheap root checkout workspace_brief snapshot/);
    assert.match(verifyUsage(), /pnpm dogfood:growth\s+Cheap root checkout growth_plan snapshot/);
    assert.match(verifyUsage(), /pnpm dogfood:maintenance\s+Cheap root checkout maintenance_plan snapshot/);
    assert.match(verifyUsage(), /pnpm dogfood:status\s+Cheap root checkout health \+ workspace-brief \+ maintenance preflight with focused hints before full verify/);
    assert.match(verifyUsage(), /pnpm test:dogfood:status\s+Narrow dogfood status shortcut runner contract/);
    assert.match(verifyUsage(), /pnpm dogfood:verify\s+Root checkout dogfood vault installed-style verify gate/);
    assertPnpmScriptsExist(verifyUsage(), ROOT_PKG.scripts, { filteredScripts: { './mcp': MCP_PKG.scripts } });
  });

  it('direct verify usage keeps entrypoint on natural exit so verbose output can flush', () => {
    const source = readFileSync(VERIFY_SCRIPT, 'utf-8');

    assert.doesNotMatch(source, /\bprocess\.exit\s*\(/);
    assert.doesNotMatch(source, /spawn\('node', \[(PARSER_TEST|SERVER_ENTRY)\]/);
    assert.match(source, /spawn\(process\.execPath, \[PARSER_TEST\]/);
    assert.match(source, /spawn\(process\.execPath, \[SERVER_ENTRY\]/);
    assert.match(source, /proc\.kill\('SIGTERM'\)/);
    assert.match(source, /proc\.kill\('SIGKILL'\)/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/);
    assert.match(source, /return 1/);
    assert.match(source, /return 0/);
  });

  it('keeps the verify success message MCP-client neutral', () => {
    assert.equal(
      verifySuccessMessage(23),
      'All passed — register .mcp.json with your MCP client and restart to use the 23 tools.',
    );
    assert.doesNotMatch(verifySuccessMessage(23), /Claude Code/);
  });

  it('fails malformed strict argument smoke responses', () => {
    const error = 'Unknown argument "lmit" for list_concepts. Did you mean "limit"? Allowed arguments: domain, kind, limit, since, summary. Received arguments: lmit.';
    assert.equal(
      strictArgsFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: {
            ok: false,
            errorCode: 'unknown_argument',
            error,
            toolName: 'list_concepts',
            receivedArgument: 'lmit',
            suggestion: 'limit',
            unknownArguments: [{ name: 'lmit', suggestion: 'limit' }],
            allowedArguments: ['domain', 'kind', 'limit', 'since', 'summary'],
            receivedArguments: ['lmit'],
          },
        },
      }),
      null,
    );
    assert.equal(
      strictArgsFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict arguments response was not rejected',
    );
    assert.equal(
      strictArgsFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict arguments structured error missing',
    );
    assert.equal(
      strictArgsFailure({ result: { isError: true, content: [{ text: `Error: ${error}` }], structuredContent: { ok: false, error: 'different error' } } }),
      'strict arguments structured error mismatch',
    );
    assert.equal(
      strictArgsFailure({ result: { isError: true, content: [{ text: `Error: ${error}` }], structuredContent: { ok: false, error } } }),
      'strict arguments structured error code missing',
    );
    assert.equal(
      strictArgsFailure({ result: { isError: true, content: [{ text: `Error: ${error}` }], structuredContent: { ok: false, errorCode: 'invalid_arguments', error } } }),
      'strict arguments structured error code mismatch — expected unknown_argument, got invalid_arguments',
    );
    assert.equal(
      strictArgsFailure({ result: { isError: true, content: [{ text: 'different error' }], structuredContent: { ok: false, errorCode: 'unknown_argument', error: 'different error' } } }),
      'strict arguments response did not report the unknown list_concepts argument',
    );
    assert.equal(
      strictArgsFailure(strictErrorResponse('Unknown argument "lmit" for list_concepts.', { structuredContent: { ok: false, errorCode: 'unknown_argument', error: 'Unknown argument "lmit" for list_concepts.' } })),
      'strict arguments response did not suggest the closest list_concepts argument',
    );
    assert.equal(
      strictArgsFailure(strictErrorResponse('Unknown argument "lmit" for list_concepts. Did you mean "limit"?', { structuredContent: { ok: false, errorCode: 'unknown_argument', error: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"?' } })),
      'strict arguments response did not report the received list_concepts arguments',
    );
    assert.equal(
      strictArgsFailure(strictErrorResponse(error, { structuredContent: { ok: false, errorCode: 'unknown_argument', error } })),
      'strict arguments structured error missing repair hint',
    );
    assert.equal(
      strictArgsFailure(strictErrorResponse(error, {
        structuredContent: {
          ok: false,
          errorCode: 'unknown_argument',
          error,
          receivedArgument: 'lmit',
          suggestion: 'limit',
          allowedArguments: ['domain', 'kind', 'limit', 'since', 'summary'],
        },
      })),
      'strict arguments structured error missing unknown argument hint',
    );
    assert.equal(
      strictArgsFailure(strictErrorResponse(error, {
        structuredContent: {
          ok: false,
          errorCode: 'unknown_argument',
          error,
          receivedArgument: 'lmit',
          suggestion: 'limit',
          unknownArguments: [{ name: 'limit' }],
          allowedArguments: ['domain', 'kind', 'limit', 'since', 'summary'],
        },
      })),
      'strict arguments structured error missing canonical unknown argument hint',
    );
  });

  it('fails malformed strict multi-argument smoke responses', () => {
    const error = 'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?). Allowed arguments: domain, kind, limit, since, summary. Received arguments: lmit, summry.';
    assert.equal(
      strictMultiArgsFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: {
            ok: false,
            errorCode: 'unknown_argument',
            error,
            toolName: 'list_concepts',
            receivedArguments: ['lmit', 'summry'],
            unknownArguments: [
              { name: 'lmit', suggestion: 'limit' },
              { name: 'summry', suggestion: 'summary' },
            ],
            allowedArguments: ['domain', 'kind', 'limit', 'since', 'summary'],
          },
        },
      }),
      null,
    );
    assert.equal(
      strictMultiArgsFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict multi-argument response was not rejected',
    );
    assert.equal(
      strictMultiArgsFailure({ result: { isError: true, content: [{ text: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"?' }] } }),
      'strict multi-argument structured error missing',
    );
    assert.equal(
      strictMultiArgsFailure(strictErrorResponse('Unknown argument "lmit" for list_concepts. Did you mean "limit"?', { structuredContent: { ok: false, errorCode: 'unknown_argument', error: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"?' } })),
      'strict multi-argument response did not report all unknown list_concepts arguments',
    );
    assert.equal(
      strictMultiArgsFailure(strictErrorResponse('Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry".', { structuredContent: { ok: false, errorCode: 'unknown_argument', error: 'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry".' } })),
      'strict multi-argument response did not suggest the closest summary argument',
    );
    assert.equal(
      strictMultiArgsFailure(strictErrorResponse('Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?)', { structuredContent: { ok: false, errorCode: 'unknown_argument', error: 'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?)' } })),
      'strict multi-argument response did not report all received list_concepts arguments',
    );
    assert.equal(
      strictMultiArgsFailure(strictErrorResponse(error, { structuredContent: { ok: false, errorCode: 'unknown_argument', error } })),
      'strict multi-argument structured error missing received arguments',
    );
    assert.equal(
      strictMultiArgsFailure(strictErrorResponse(error, {
        structuredContent: {
          ok: false,
          errorCode: 'unknown_argument',
          error,
          receivedArguments: ['lmit', 'summry'],
          unknownArguments: [
            { name: 'lmit', suggestion: 'limit' },
            { name: 'summry', suggestion: 'summary' },
          ],
          allowedArguments: ['limit', 'summary'],
        },
      })),
      'strict multi-argument structured error missing allowed arguments',
    );
  });

  it('fails malformed strict unknown-tool smoke responses', () => {
    const allowedTools = [...EXPECTED_TOOLS].sort();
    const error = `Unknown tool: list_concept. Did you mean "list_concepts"? Allowed tools: ${allowedTools.join(', ')}.`;
    assert.equal(
      strictUnknownToolFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: {
            ok: false,
            errorCode: 'unknown_tool',
            error,
            receivedTool: 'list_concept',
            suggestion: 'list_concepts',
            allowedTools,
          },
        },
      }),
      null,
    );
    assert.equal(
      strictUnknownToolFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict unknown-tool response was not rejected',
    );
    assert.equal(
      strictUnknownToolFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict unknown-tool structured error missing',
    );
    assert.equal(
      strictUnknownToolFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: { ok: false, errorCode: 'unknown_argument', error },
        },
      }),
      'strict unknown-tool structured error code mismatch — expected unknown_tool, got unknown_argument',
    );
    assert.equal(
      strictUnknownToolFailure({
        result: {
          isError: true,
          content: [{ text: 'Error: Unknown tool: missing_tool. Allowed tools: add_concept, list_concepts.' }],
          structuredContent: { ok: false, errorCode: 'unknown_tool', error: 'Unknown tool: missing_tool. Allowed tools: add_concept, list_concepts.' },
        },
      }),
      'strict unknown-tool response did not report the unknown tool name',
    );
    assert.equal(
      strictUnknownToolFailure({
        result: {
          isError: true,
          content: [{ text: 'Error: Unknown tool: list_concept. Allowed tools: add_concept, list_concepts.' }],
          structuredContent: { ok: false, errorCode: 'unknown_tool', error: 'Unknown tool: list_concept. Allowed tools: add_concept, list_concepts.' },
        },
      }),
      'strict unknown-tool response did not suggest the closest tool name',
    );
    assert.equal(
      strictUnknownToolFailure({
        result: {
          isError: true,
          content: [{ text: 'Error: Unknown tool: list_concept. Did you mean "list_concepts"?' }],
          structuredContent: { ok: false, errorCode: 'unknown_tool', error: 'Unknown tool: list_concept. Did you mean "list_concepts"?' },
        },
      }),
      'strict unknown-tool response did not report the allowed tool list',
    );
    assert.equal(
      strictUnknownToolFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: { ok: false, errorCode: 'unknown_tool', error },
        },
      }),
      'strict unknown-tool structured error missing repair hint',
    );
    assert.equal(
      strictUnknownToolFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: { ok: false, errorCode: 'unknown_tool', error, receivedTool: 'list_concept', suggestion: 'list_concepts', allowedTools: ['add_concept', 'list_concepts'] },
        },
      }),
      'strict unknown-tool structured error missing allowed tools',
    );
  });

  it('fails malformed batch row-isolation smoke responses', () => {
    const conceptUnknownError = 'Unknown fields in concepts[1]: "titel" (did you mean "title"?), "domian" (did you mean "domain"?). Allowed fields: slug, kind, title, domain. Received fields: domian, kind, slug, titel, title.';
    const conceptDuplicateSeedError = 'concepts[2] kind must be one of: project, domain, capability, element, document. Received: "capabilty". Did you mean "capability"?';
    const conceptDuplicateError = 'concepts[3] duplicate slug in input batch; first seen at concepts[2]';
    const conceptSingleUnknownError = 'Unknown field "titel" in concepts[4]. Did you mean "title"? Allowed fields: slug, kind, title, domain, capabilities, elements, body. Received fields: kind, slug, titel, title.';
    const relationUnknownError = 'Unknown fields in relations[1]: "relation" (did you mean "type"?), "frm" (did you mean "from"?). Allowed fields: from, to, type, expected_mtime. Received fields: frm, from, relation, to, type.';
    const relationTypeError = `relations[2] type must be one of: ${WRITE_RELATION_TYPE_VALUES.join(', ')}. Received: "depend_on". Did you mean "depends_on"?`;
    const relationSingleUnknownError = 'Unknown field "relation" in relations[3]. Did you mean "type"? Allowed fields: from, to, type, expected_mtime. Received fields: from, relation, to, type.';
    const conceptRows = [
      { slug: '', ok: false, error: 'concepts[0] must be an object.', errorCode: 'invalid_arguments' },
      {
        slug: 'verify-row-isolation',
        ok: false,
        error: conceptUnknownError,
        errorCode: 'invalid_arguments',
        rowName: 'concepts[1]',
        unknownFields: [
          { name: 'titel', suggestion: 'title' },
          { name: 'domian', suggestion: 'domain' },
        ],
        allowedFields: ['slug', 'kind', 'title', 'domain', 'capabilities', 'elements', 'body'],
        receivedFields: ['domian', 'kind', 'slug', 'titel', 'title'],
      },
      {
        slug: 'verify-duplicate-slug',
        ok: false,
        error: conceptDuplicateSeedError,
        errorCode: 'invalid_arguments',
        valueName: 'kind',
        receivedValue: 'capabilty',
        suggestion: 'capability',
        allowedValues: ['project', 'domain', 'capability', 'element', 'document'],
      },
      {
        slug: 'verify-duplicate-slug',
        ok: false,
        error: conceptDuplicateError,
        errorCode: 'conflict',
        rowName: 'concepts[3]',
        conflictSubject: 'Duplicate slug in input batch',
        conflictSlug: 'verify-duplicate-slug',
        firstSeenAt: 'concepts[2]',
      },
      {
        slug: 'verify-single-field',
        ok: false,
        error: conceptSingleUnknownError,
        errorCode: 'invalid_arguments',
        rowName: 'concepts[4]',
        receivedField: 'titel',
        unknownFields: [{ name: 'titel', suggestion: 'title' }],
        allowedFields: ['slug', 'kind', 'title', 'domain', 'capabilities', 'elements', 'body'],
        receivedFields: ['kind', 'slug', 'titel', 'title'],
      },
    ];
    const relationRows = [
      { ok: false, error: 'relations[0] must be an object.', errorCode: 'invalid_arguments' },
      {
        ok: false,
        error: relationUnknownError,
        errorCode: 'invalid_arguments',
        rowName: 'relations[1]',
        unknownFields: [
          { name: 'relation', suggestion: 'type' },
          { name: 'frm', suggestion: 'from' },
        ],
        allowedFields: ['from', 'to', 'type', 'expected_mtime'],
        receivedFields: ['frm', 'from', 'relation', 'to', 'type'],
      },
      {
        ok: false,
        error: relationTypeError,
        errorCode: 'invalid_arguments',
        valueName: 'type',
        receivedValue: 'depend_on',
        suggestion: 'depends_on',
        allowedValues: WRITE_RELATION_TYPE_VALUES,
      },
      {
        ok: false,
        error: relationSingleUnknownError,
        errorCode: 'invalid_arguments',
        rowName: 'relations[3]',
        receivedField: 'relation',
        unknownFields: [{ name: 'relation', suggestion: 'type' }],
        allowedFields: ['from', 'to', 'type', 'expected_mtime'],
        receivedFields: ['from', 'relation', 'to', 'type'],
      },
    ];
    const okResponse = {
      result: {
        content: [{
          text: JSON.stringify({
            concepts: conceptRows,
          }),
        }],
        structuredContent: {
          concepts: conceptRows,
        },
      },
    };
    assert.equal(batchRowIsolationFailure(okResponse, 'concepts', 'add_concepts'), null);
    assert.equal(
      batchRowIsolationFailure({ result: { isError: true, content: [{ text: 'bad' }] } }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation smoke returned top-level tool error',
    );
    assert.equal(
      batchRowIsolationFailure({ result: { content: [{ text: JSON.stringify({ concepts: [{ ok: false }] }) }] } }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing 5 result rows',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{ text: JSON.stringify({ relations: [{ ok: true }, { ok: false, error: 'Unknown field "relation". Did you mean "type"?' }] }) }],
        },
      }, 'relations', 'add_relations'),
      'add_relations row-isolation response missing 4 result rows',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              relations: relationRows,
            }),
          }],
          structuredContent: {
            relations: relationRows,
          },
        },
      }, 'relations', 'add_relations'),
      null,
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                { ...conceptRows[0], error: 'must be an object.' },
                conceptRows[1],
                conceptRows[2],
                conceptRows[3],
                conceptRows[4],
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing non-object row index',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                conceptRows[0],
                { ...conceptRows[1], error: 'Unknown field "titel". Did you mean "title"? Allowed fields: slug, kind, title.' },
                conceptRows[2],
                conceptRows[3],
                conceptRows[4],
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing unknown-field row index',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                conceptRows[0],
                { ...conceptRows[1], error: 'Unknown fields in concepts[1]: "titel" (did you mean "title"?), "domian" (did you mean "domain"?). Allowed fields: slug, kind, title, domain.' },
                conceptRows[2],
                conceptRows[3],
                conceptRows[4],
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing concept received fields',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              relations: [
                relationRows[0],
                { ...relationRows[1], error: 'Unknown fields in relations[1]: "relation" (did you mean "type"?), "frm" (did you mean "from"?). Allowed fields: from, to, type.' },
                relationRows[2],
                relationRows[3],
              ],
            }),
          }],
        },
      }, 'relations', 'add_relations'),
      'add_relations row-isolation response missing relation received fields',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                conceptRows[0],
                conceptRows[1],
                conceptRows[2],
                conceptRows[3],
                { ...conceptRows[4], unknownFields: undefined },
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing concept single-field structured repair',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              relations: [
                relationRows[0],
                relationRows[1],
                relationRows[2],
                { ...relationRows[3], receivedField: undefined },
              ],
            }),
          }],
        },
      }, 'relations', 'add_relations'),
      'add_relations row-isolation response missing relation single-field structured repair',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                conceptRows[0],
                conceptRows[1],
                { slug: 'verify-duplicate-slug', ok: true },
                conceptRows[3],
                conceptRows[4],
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing duplicate seed row error',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                conceptRows[0],
                conceptRows[1],
                { ...conceptRows[2], allowedValues: ['project', 'domain'] },
                conceptRows[3],
                conceptRows[4],
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing duplicate seed structured repair',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                conceptRows[0],
                conceptRows[1],
                conceptRows[2],
                { ...conceptRows[3], error: 'concepts[3] duplicate slug in input batch' },
                conceptRows[4],
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response missing duplicate slug row guidance',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: conceptRows,
              postWriteMaintenance: {},
            }),
          }],
          structuredContent: {
            concepts: conceptRows,
            postWriteMaintenance: {},
          },
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation response unexpectedly included postWriteMaintenance',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              concepts: [
                conceptRows[0],
                { ...conceptRows[1], changed: false },
                conceptRows[2],
                conceptRows[3],
                conceptRows[4],
              ],
            }),
          }],
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row-isolation failed row 1 unexpectedly included write metadata: changed',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: [{
            text: JSON.stringify({
              relations: [
                relationRows[0],
                relationRows[1],
                { ...relationRows[2], alreadyExists: false },
                relationRows[3],
              ],
            }),
          }],
        },
      }, 'relations', 'add_relations'),
      'add_relations row-isolation failed row 2 unexpectedly included write metadata: alreadyExists',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: okResponse.result.content,
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row isolation structuredContent missing',
    );
    assert.equal(
      batchRowIsolationFailure({
        result: {
          content: okResponse.result.content,
          structuredContent: {
            concepts: [
              conceptRows[0],
              conceptRows[1],
              conceptRows[2],
              { ...conceptRows[3], error: 'concepts[3] duplicate slug in input batch; first seen at concepts[1]' },
              conceptRows[4],
            ],
          },
        },
      }, 'concepts', 'add_concepts'),
      'add_concepts row isolation structuredContent mismatch — $.concepts[3].error: parsed "concepts[3] duplicate slug in input batch; first seen at concepts[2]", structuredContent "concepts[3] duplicate slug in input batch; first seen at concepts[1]"',
    );
  });

  it('fails malformed batch cap smoke responses', () => {
    assert.equal(
      batchCapFailure(
        strictErrorResponse('Too many concepts: 51. Max 50 per call — split into multiple add_concepts batches.', {
          structuredContent: {
            ok: false,
            errorCode: 'invalid_arguments',
            error: 'Too many concepts: 51. Max 50 per call — split into multiple add_concepts batches.',
          },
        }),
        'add_concepts',
        'concepts',
      ),
      null,
    );
    assert.equal(
      batchCapFailure(null, 'add_concepts', 'concepts'),
      'no add_concepts batch-cap response',
    );
    assert.equal(
      batchCapFailure({ result: { isError: false, content: [{ text: '{}' }] } }, 'add_concepts', 'concepts'),
      'add_concepts batch-cap smoke did not reject over-cap batch',
    );
    assert.equal(
      batchCapFailure(
        strictErrorResponse('Too many concepts: 51.', {
          structuredContent: { ok: false, errorCode: 'invalid_arguments', error: 'Too many concepts: 51.' },
        }),
        'add_concepts',
        'concepts',
      ),
      'add_concepts batch-cap response missing max-50 guidance',
    );
    assert.equal(
      batchCapFailure(
        strictErrorResponse('Too many relations: 51. Max 50 per call — split into multiple add_relations batches.', {
          structuredContent: {
            ok: false,
            errorCode: 'tool_error',
            error: 'Too many relations: 51. Max 50 per call — split into multiple add_relations batches.',
          },
        }),
        'add_relations',
        'relations',
      ),
      'add_relations batch cap structured error code mismatch — expected invalid_arguments, got tool_error',
    );
  });

  it('fails malformed destructive dry-run smoke responses', () => {
    const renamePayload = {
      ok: false,
      dryRun: true,
      oldSlug: 'old',
      newSlug: 'new',
      moved: false,
      backlinkUpdates: { totalUpdated: 0, updates: [] },
      message: 'dry-run — confirm:true to apply',
    };
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify(renamePayload) }],
          structuredContent: renamePayload,
        },
      }, 'rename_concept'),
      null,
    );
    const renamePayloadWithUpdate = {
      ...renamePayload,
      backlinkUpdates: {
        totalUpdated: 1,
        updates: [
          {
            slug: 'ref',
            title: 'Ref',
            beforeKeys: [{ key: 'dependencies', before: ['old'] }],
            afterKeys: [{ key: 'dependencies', after: ['new'] }],
            bodyChanged: false,
          },
        ],
      },
    };
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify(renamePayloadWithUpdate) }],
          structuredContent: renamePayloadWithUpdate,
        },
      }, 'rename_concept'),
      null,
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify({ ...renamePayload, postWriteMaintenance: {} }) }],
          structuredContent: { ...renamePayload, postWriteMaintenance: {} },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response unexpectedly included postWriteMaintenance',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify({ ...renamePayload, changed: true }) }],
          structuredContent: { ...renamePayload, changed: true },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response unexpectedly included changed',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify({ ...renamePayload, dryRun: false }) }],
          structuredContent: { ...renamePayload, dryRun: false },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response must be ok:false with dryRun:true',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify({ ...renamePayload, backlinkUpdates: { totalUpdated: 0 } }) }],
          structuredContent: { ...renamePayload, backlinkUpdates: { totalUpdated: 0 } },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response missing backlinkUpdates plan',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify({ ...renamePayload, backlinkUpdates: { totalUpdated: 1, updates: [] } }) }],
          structuredContent: { ...renamePayload, backlinkUpdates: { totalUpdated: 1, updates: [] } },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response backlinkUpdates total mismatch',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [
            {
              text: JSON.stringify({
                ...renamePayload,
                backlinkUpdates: {
                  totalUpdated: 1,
                  updates: [{ slug: 'ref', beforeKeys: [], afterKeys: [], bodyChanged: false }],
                },
              }),
            },
          ],
          structuredContent: {
            ...renamePayload,
            backlinkUpdates: {
              totalUpdated: 1,
              updates: [{ slug: 'ref', beforeKeys: [], afterKeys: [], bodyChanged: false }],
            },
          },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response backlinkUpdates.updates[0] shape drift',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [
            {
              text: JSON.stringify({
                ...renamePayload,
                backlinkUpdates: {
                  totalUpdated: 1,
                  updates: [{ slug: ' ref', title: 'Ref', beforeKeys: [], afterKeys: [], bodyChanged: false }],
                },
              }),
            },
          ],
          structuredContent: {
            ...renamePayload,
            backlinkUpdates: {
              totalUpdated: 1,
              updates: [{ slug: ' ref', title: 'Ref', beforeKeys: [], afterKeys: [], bodyChanged: false }],
            },
          },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response backlinkUpdates.updates[0] shape drift',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [
            {
              text: JSON.stringify({
                ...renamePayload,
                backlinkUpdates: {
                  totalUpdated: 1,
                  updates: [
                    {
                      slug: 'ref',
                      title: 'Ref',
                      beforeKeys: [{ before: ['old'] }],
                      afterKeys: [],
                      bodyChanged: false,
                    },
                  ],
                },
              }),
            },
          ],
          structuredContent: {
            ...renamePayload,
            backlinkUpdates: {
              totalUpdated: 1,
              updates: [
                {
                  slug: 'ref',
                  title: 'Ref',
                  beforeKeys: [{ before: ['old'] }],
                  afterKeys: [],
                  bodyChanged: false,
                },
              ],
            },
          },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response backlinkUpdates.updates[0].beforeKeys[0] shape drift',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [
            {
              text: JSON.stringify({
                ...renamePayload,
                backlinkUpdates: {
                  totalUpdated: 1,
                  updates: [
                    {
                      slug: 'ref',
                      title: 'Ref',
                      beforeKeys: [],
                      afterKeys: [{ key: 'dependencies', after: [42] }],
                      bodyChanged: false,
                    },
                  ],
                },
              }),
            },
          ],
          structuredContent: {
            ...renamePayload,
            backlinkUpdates: {
              totalUpdated: 1,
              updates: [
                {
                  slug: 'ref',
                  title: 'Ref',
                  beforeKeys: [],
                  afterKeys: [{ key: 'dependencies', after: [42] }],
                  bodyChanged: false,
                },
              ],
            },
          },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response backlinkUpdates.updates[0].afterKeys[0] after drift',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [
            {
              text: JSON.stringify({
                ...renamePayload,
                backlinkUpdates: {
                  totalUpdated: 1,
                  updates: [
                    {
                      slug: 'ref',
                      title: 'Ref',
                      beforeKeys: [],
                      afterKeys: [{ key: 'dependencies', after: [' new'] }],
                      bodyChanged: false,
                    },
                  ],
                },
              }),
            },
          ],
          structuredContent: {
            ...renamePayload,
            backlinkUpdates: {
              totalUpdated: 1,
              updates: [
                {
                  slug: 'ref',
                  title: 'Ref',
                  beforeKeys: [],
                  afterKeys: [{ key: 'dependencies', after: [' new'] }],
                  bodyChanged: false,
                },
              ],
            },
          },
        },
      }, 'rename_concept'),
      'rename_concept dry-run response backlinkUpdates.updates[0].afterKeys[0] after drift',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          isError: true,
          content: [{ text: 'bad' }],
        },
      }, 'delete_concept'),
      'delete_concept dry-run returned top-level tool error',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [{ text: JSON.stringify({ ok: false, dryRun: true, slug: 'gone', backlinks: [], message: 'dry-run — force:true to apply' }) }],
          structuredContent: { ok: false, dryRun: true, slug: 'gone', backlinks: [], message: 'dry-run — force:true to apply' },
        },
      }, 'delete_concept'),
      null,
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [
            {
              text: JSON.stringify({
                ok: false,
                dryRun: true,
                slug: 'gone',
                backlinks: [{ slug: ' ref', kind: 'capability', title: 'Ref', mtime: 1 }],
                message: 'dry-run — force:true to apply',
              }),
            },
          ],
          structuredContent: {
            ok: false,
            dryRun: true,
            slug: 'gone',
            backlinks: [{ slug: ' ref', kind: 'capability', title: 'Ref', mtime: 1 }],
            message: 'dry-run — force:true to apply',
          },
        },
      }, 'delete_concept'),
      'delete_concept dry-run response backlinks[0] shape drift',
    );
    assert.equal(
      destructiveDryRunFailure({
        result: {
          content: [
            {
              text: JSON.stringify({
                ok: false,
                dryRun: true,
                slug: 'gone',
                backlinks: [{ slug: 'ref', kind: 'capability', title: 'Ref', mtime: 1, matchedKeys: [' relates'] }],
                message: 'dry-run — force:true to apply',
              }),
            },
          ],
          structuredContent: {
            ok: false,
            dryRun: true,
            slug: 'gone',
            backlinks: [{ slug: 'ref', kind: 'capability', title: 'Ref', mtime: 1, matchedKeys: [' relates'] }],
            message: 'dry-run — force:true to apply',
          },
        },
      }, 'delete_concept'),
      'delete_concept dry-run response backlinks[0] matchedKeys drift',
    );
  });

  it('fails missing destructive dry-run smoke responses', () => {
    const deletePayload = {
      ok: false,
      dryRun: true,
      slug: 'gone',
      backlinks: [],
      message: 'dry-run — force:true to apply',
    };
    assert.equal(
      destructiveDryRunSmokeFailure([
        [
          'delete_concept',
          {
            result: {
              content: [{ text: JSON.stringify(deletePayload) }],
              structuredContent: deletePayload,
            },
          },
        ],
      ]),
      null,
    );
    assert.equal(
      destructiveDryRunSmokeFailure([
        ['rename_concept', null],
        [
          'delete_concept',
          {
            result: {
              content: [{ text: JSON.stringify(deletePayload) }],
              structuredContent: deletePayload,
            },
          },
        ],
      ]),
      'no rename_concept dry-run response',
    );
  });

  it('fails malformed patch_concept conflict guard smoke responses', () => {
    const error = 'VaultConflictError: expected_mtime conflict — file was modified externally';
    assert.equal(
      patchConflictGuardFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: { ok: false, errorCode: 'vault_conflict', error },
        },
      }),
      null,
    );
    assert.equal(
      patchConflictGuardFailure({
        result: {
          isError: false,
          content: [{ text: 'ok' }],
        },
      }),
      'patch_concept conflict guard structured error missing',
    );
    assert.equal(
      patchConflictGuardFailure({
        result: {
          isError: true,
          content: [{ text: `Error: ${error}` }],
          structuredContent: { ok: false, errorCode: 'conflict', error },
        },
      }),
      'patch_concept conflict guard structured error code mismatch — expected vault_conflict, got conflict',
    );
    assert.equal(
      patchConflictGuardFailure({
        result: {
          isError: true,
          content: [{ text: 'Error: stale read' }],
          structuredContent: { ok: false, errorCode: 'vault_conflict', error: 'stale read' },
        },
      }),
      'patch_concept conflict guard response did not explain the stale expected_mtime conflict',
    );
  });

  it('fails malformed strict enum smoke responses', () => {
    const error = `operation must be one of: ${QUERY_ONTOLOGY_OPERATIONS.join(', ')}. Received: "overveiw". Did you mean "overview"?`;
    assert.equal(
      strictEnumFailure(strictErrorResponse(error, {
        structuredContent: {
          ok: false,
          errorCode: 'invalid_arguments',
          error,
          valueName: 'operation',
          receivedValue: 'overveiw',
          suggestion: 'overview',
          allowedValues: QUERY_ONTOLOGY_OPERATIONS,
        },
      })),
      null,
    );
    assert.equal(
      strictEnumFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict enum response was not rejected',
    );
    assert.equal(
      strictEnumFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict enum response did not report the invalid query_ontology operation',
    );
    assert.equal(
      strictEnumFailure({ result: { isError: true, content: [{ text: 'operation must be one of: overview. invalid value overveiw' }] } }),
      'strict enum response did not suggest the closest query_ontology operation',
    );
    assert.equal(
      strictEnumFailure(strictErrorResponse(error, {
        structuredContent: { ok: false, errorCode: 'invalid_arguments', error },
      })),
      'strict enum structured error missing repair hint',
    );
    assert.equal(
      strictEnumFailure(strictErrorResponse(error, {
        structuredContent: { ok: false, errorCode: 'invalid_arguments', error, valueName: 'operation', receivedValue: 'overveiw', suggestion: 'overview' },
      })),
      'strict enum structured error missing allowed values',
    );
    assert.equal(
      strictEnumFailure(strictErrorResponse(error, {
        structuredContent: { ok: false, errorCode: 'invalid_arguments', error, valueName: 'operation', receivedValue: 'overveiw', suggestion: 'overview', allowedValues: ['overview', 'health'] },
      })),
      'strict enum structured error missing allowed values',
    );
  });

  it('fails malformed strict maintenance filter smoke responses', () => {
    assert.equal(
      strictMaintenanceFilterFailure(strictErrorResponse('phases items must be one of: validate, repair, link, materialize, review. Received: "repiar". Did you mean "repair"?'), 'phases'),
      null,
    );
    assert.equal(
      strictMaintenanceFilterFailure(strictErrorResponse('severities items must be one of: fail, warn, info. Received: "fatal". Did you mean "fail"?'), 'severities'),
      null,
    );
    assert.equal(
      strictMaintenanceFilterFailure(strictErrorResponse(`kinds items must be one of: ${MAINTENANCE_KIND_VALUES.join(', ')}. Received: "add_mising_relation". Did you mean "add_missing_relation"?`), 'kinds'),
      null,
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict maintenance filter response was not rejected',
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict maintenance filter response did not report the invalid maintenance_plan phases filter',
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'phases items must be one of: validate, repair. Received: "repiar".' }] } }),
      'strict maintenance filter response did not list allowed maintenance_plan phases',
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'phases items must be one of: validate, repair, link, materialize, review. Did you mean "repair"?' }] } }),
      'strict maintenance filter response did not report the invalid maintenance_plan phases value',
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'phases items must be one of: validate, repair, link, materialize, review. Received: "repiar".' }] } }),
      'strict maintenance filter response did not suggest the closest maintenance_plan phases value',
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'severities items must be one of: fail, warn.' }] } }, 'severities'),
      'strict maintenance filter response did not list allowed maintenance_plan severities',
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'kinds items must be one of: add_missing_relation.' }] } }, 'kinds'),
      'strict maintenance filter response did not list allowed maintenance_plan kinds',
    );
  });

  it('fails malformed strict relation filter smoke responses', () => {
    assert.equal(
      strictRelationFilterFailure(strictErrorResponse('dependencyTypes items must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?')),
      null,
    );
    assert.equal(
      strictRelationFilterFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict relation filter response was not rejected',
    );
    assert.equal(
      strictRelationFilterFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict relation filter response did not report the invalid dependencyTypes filter',
    );
    assert.equal(
      strictRelationFilterFailure({ result: { isError: true, content: [{ text: 'dependencyTypes items must be one of: dependencies, depends_on. Did you mean "depends_on"?' }] } }),
      'strict relation filter response did not report the invalid dependencyTypes value',
    );
    assert.equal(
      strictRelationFilterFailure({ result: { isError: true, content: [{ text: 'dependencyTypes items must be one of: dependencies, depends_on. Received: "depend_on".' }] } }),
      'strict relation filter response did not suggest the closest dependencyTypes value',
    );
  });

  it('fails malformed strict find_neighbors types smoke responses', () => {
    assert.equal(
      strictFindNeighborsTypeFailure(strictErrorResponse('types items must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?')),
      null,
    );
    assert.equal(
      strictFindNeighborsTypeFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict find_neighbors types response was not rejected',
    );
    assert.equal(
      strictFindNeighborsTypeFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict find_neighbors types response did not report the invalid types filter',
    );
    assert.equal(
      strictFindNeighborsTypeFailure({ result: { isError: true, content: [{ text: 'types items must be one of: dependencies, depends_on. Did you mean "depends_on"?' }] } }),
      'strict find_neighbors types response did not report the invalid types value',
    );
    assert.equal(
      strictFindNeighborsTypeFailure({ result: { isError: true, content: [{ text: 'types items must be one of: dependencies, depends_on. Received: "depend_on".' }] } }),
      'strict find_neighbors types response did not suggest the closest types value',
    );
  });

  it('fails malformed strict find_orphans kind smoke responses', () => {
    assert.equal(
      strictFindOrphansKindFailure(strictErrorResponse('kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?')),
      null,
    );
    assert.equal(
      strictFindOrphansKindFailure(strictErrorResponse('excludeKinds items must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?'), { field: 'excludeKinds items' }),
      null,
    );
    assert.equal(
      strictFindOrphansKindFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict find_orphans kind response was not rejected',
    );
    assert.equal(
      strictFindOrphansKindFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict find_orphans kind response did not report the invalid kind filter',
    );
    assert.equal(
      strictFindOrphansKindFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Did you mean "capability"?' }] } }),
      'strict find_orphans kind response did not report the invalid kind value',
    );
    assert.equal(
      strictFindOrphansKindFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }] } }),
      'strict find_orphans kind response did not suggest the closest kind value',
    );
  });

  it('fails malformed strict query_concepts filter smoke responses', () => {
    assert.equal(
      strictQueryConceptsFilterFailure(strictErrorResponse('kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?')),
      null,
    );
    assert.equal(
      strictQueryConceptsFilterFailure(strictErrorResponse('has key must be one of: domains, capabilities, elements, dependencies, relates, contains, describes, depends_on. Received: "capabilties". Did you mean "capabilities"?'), { field: 'has key', received: 'capabilties', suggestion: 'capabilities' }),
      null,
    );
    assert.equal(
      strictQueryConceptsFilterFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict query_concepts filter response was not rejected',
    );
    assert.equal(
      strictQueryConceptsFilterFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict query_concepts filter response did not report the invalid kind',
    );
    assert.equal(
      strictQueryConceptsFilterFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Did you mean "capability"?' }] } }),
      'strict query_concepts filter response did not report the invalid kind value',
    );
    assert.equal(
      strictQueryConceptsFilterFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }] } }),
      'strict query_concepts filter response did not suggest the closest kind value',
    );
  });

  it('fails malformed strict list_concepts kind smoke responses', () => {
    assert.equal(
      strictListConceptsKindFailure(strictErrorResponse('kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?')),
      null,
    );
    assert.equal(
      strictListConceptsKindFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict list_concepts kind response was not rejected',
    );
    assert.equal(
      strictListConceptsKindFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict list_concepts kind response did not report the invalid kind filter',
    );
    assert.equal(
      strictListConceptsKindFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Did you mean "capability"?' }] } }),
      'strict list_concepts kind response did not report the invalid kind value',
    );
    assert.equal(
      strictListConceptsKindFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }] } }),
      'strict list_concepts kind response did not suggest the closest kind value',
    );
  });

  it('fails malformed strict graph kind filter smoke responses', () => {
    assert.equal(
      strictGraphKindFilterFailure(strictErrorResponse('kind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?')),
      null,
    );
    assert.equal(
      strictGraphKindFilterFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict graph kind filter response was not rejected',
    );
    assert.equal(
      strictGraphKindFilterFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict graph kind filter response did not report the invalid kind filter',
    );
    assert.equal(
      strictGraphKindFilterFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Did you mean "capability"?' }] } }),
      'strict graph kind filter response did not report the invalid kind value',
    );
    assert.equal(
      strictGraphKindFilterFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty".' }] } }),
      'strict graph kind filter response did not suggest the closest kind value',
    );
    assert.equal(
      strictGraphKindFilterFailure(
        strictErrorResponse('fromKind must be one of: project, domain, capability, element, document, vault-readme. Received: "capabilty". Did you mean "capability"?'),
        { field: 'fromKind' },
      ),
      null,
    );
    assert.equal(
      strictGraphKindFilterFailure(
        strictErrorResponse('toKind must be one of: project, domain, capability, element, document, vault-readme, external, unresolved. Received: "externl". Did you mean "external"?'),
        { field: 'toKind', received: 'externl', suggestion: 'external' },
      ),
      null,
    );
    assert.equal(
      strictGraphKindFilterFailure(
        { result: { isError: true, content: [{ text: 'fromKind must be one of: project, domain, capability. Did you mean "capability"?' }] } },
        { field: 'fromKind' },
      ),
      'strict graph kind filter response did not report the invalid fromKind value',
    );
    assert.equal(
      strictGraphKindFilterFailure(
        { result: { isError: true, content: [{ text: 'toKind must be one of: project, domain, capability, external. Received: "externl".' }] } },
        { field: 'toKind', received: 'externl', suggestion: 'external' },
      ),
      'strict graph kind filter response did not suggest the closest toKind value',
    );
  });

  it('fails malformed strict recommend_relations kind filter smoke responses', () => {
    assert.equal(
      strictRecommendRelationsKindFilterFailure(strictErrorResponse('kind must be one of: capability, element. Received: "capabilty". Did you mean "capability"?')),
      null,
    );
    assert.equal(
      strictRecommendRelationsKindFilterFailure(
        strictErrorResponse('kind must be one of: capability, element. Received: "domain".'),
        { received: 'domain', requireSuggestion: false },
      ),
      null,
    );
    assert.equal(
      strictRecommendRelationsKindFilterFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict recommend_relations kind filter response was not rejected',
    );
    assert.equal(
      strictRecommendRelationsKindFilterFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict recommend_relations kind filter response did not report the invalid kind filter',
    );
    assert.equal(
      strictRecommendRelationsKindFilterFailure({ result: { isError: true, content: [{ text: 'kind must be one of: project, domain, capability. Received: "capabilty". Did you mean "capability"?' }] } }),
      'strict recommend_relations kind filter response did not list the narrowed kind set',
    );
    assert.equal(
      strictRecommendRelationsKindFilterFailure({ result: { isError: true, content: [{ text: 'kind must be one of: capability, element. Did you mean "capability"?' }] } }),
      'strict recommend_relations kind filter response did not report the invalid kind value',
    );
    assert.equal(
      strictRecommendRelationsKindFilterFailure({ result: { isError: true, content: [{ text: 'kind must be one of: capability, element. Received: "capabilty".' }] } }),
      'strict recommend_relations kind filter response did not suggest the closest kind value',
    );
  });

  it('fails malformed strict match_nodes sort smoke responses', () => {
    assert.equal(
      strictMatchNodesSortFailure(strictErrorResponse('sort must be one of: degree, inDegree, outDegree, slug. Received: "outDegre". Did you mean "outDegree"?')),
      null,
    );
    assert.equal(
      strictMatchNodesSortFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict match_nodes sort response was not rejected',
    );
    assert.equal(
      strictMatchNodesSortFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict match_nodes sort response did not report the invalid sort filter',
    );
    assert.equal(
      strictMatchNodesSortFailure({ result: { isError: true, content: [{ text: 'sort must be one of: degree, slug. Received: "outDegre". Did you mean "outDegree"?' }] } }),
      'strict match_nodes sort response did not list allowed sort values',
    );
    assert.equal(
      strictMatchNodesSortFailure({ result: { isError: true, content: [{ text: 'sort must be one of: degree, inDegree, outDegree, slug. Did you mean "outDegree"?' }] } }),
      'strict match_nodes sort response did not report the invalid sort value',
    );
    assert.equal(
      strictMatchNodesSortFailure({ result: { isError: true, content: [{ text: 'sort must be one of: degree, inDegree, outDegree, slug. Received: "outDegre".' }] } }),
      'strict match_nodes sort response did not suggest the closest sort value',
    );
  });

  it('fails malformed strict relation_check smoke responses', () => {
    assert.equal(
      strictRelationCheckFailure(strictErrorResponse('type must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?')),
      null,
    );
    assert.equal(
      strictRelationCheckFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict relation_check response was not rejected',
    );
    assert.equal(
      strictRelationCheckFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict relation_check response did not report the invalid type filter',
    );
    assert.equal(
      strictRelationCheckFailure({ result: { isError: true, content: [{ text: 'type must be one of: dependencies, depends_on. Did you mean "depends_on"?' }] } }),
      'strict relation_check response did not report the invalid type value',
    );
    assert.equal(
      strictRelationCheckFailure({ result: { isError: true, content: [{ text: 'type must be one of: dependencies, depends_on. Received: "depend_on".' }] } }),
      'strict relation_check response did not suggest the closest type value',
    );
  });

  it('fails malformed strict match_edges type smoke responses', () => {
    assert.equal(
      strictMatchEdgesTypeFailure(strictErrorResponse('type must be one of: domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes. Received: "depend_on". Did you mean "depends_on"?')),
      null,
    );
    assert.equal(
      strictMatchEdgesTypeFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict match_edges type response was not rejected',
    );
    assert.equal(
      strictMatchEdgesTypeFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict match_edges type response did not report the invalid type filter',
    );
    assert.equal(
      strictMatchEdgesTypeFailure({ result: { isError: true, content: [{ text: 'type must be one of: dependencies, depends_on. Did you mean "depends_on"?' }] } }),
      'strict match_edges type response did not report the invalid type value',
    );
    assert.equal(
      strictMatchEdgesTypeFailure({ result: { isError: true, content: [{ text: 'type must be one of: dependencies, depends_on. Received: "depend_on".' }] } }),
      'strict match_edges type response did not suggest the closest type value',
    );
  });

  it('fails malformed strict add_relation smoke responses', () => {
    assert.equal(
      strictAddRelationFailure(strictErrorResponse(`type must be one of: ${WRITE_RELATION_TYPE_VALUES.join(', ')}. Received: "depend_on". Did you mean "depends_on"?`)),
      null,
    );
    assert.equal(
      strictAddRelationFailure({ result: { isError: false, content: [{ text: 'ok' }] } }),
      'strict add_relation response was not rejected',
    );
    assert.equal(
      strictAddRelationFailure({ result: { isError: true, content: [{ text: 'different error' }] } }),
      'strict add_relation response did not report the invalid type filter',
    );
    assert.equal(
      strictAddRelationFailure({ result: { isError: true, content: [{ text: 'type must be one of: depends_on, relates. Did you mean "depends_on"?' }] } }),
      'strict add_relation response did not report the invalid type value',
    );
    assert.equal(
      strictAddRelationFailure({ result: { isError: true, content: [{ text: 'type must be one of: depends_on, relates. Received: "depend_on".' }] } }),
      'strict add_relation response did not suggest the closest type value',
    );
    assert.equal(
      strictAddRelationFailure({
        result: {
          isError: true,
          changed: false,
          content: [{ text: 'type must be one of: depends_on, relates. Received: "depend_on". Did you mean "depends_on"?' }],
        },
      }),
      'strict add_relation response included write metadata',
    );
    assert.equal(
      strictAddRelationFailure({
        result: {
          isError: true,
          alreadyExists: false,
          content: [{ text: 'type must be one of: depends_on, relates. Received: "depend_on". Did you mean "depends_on"?' }],
        },
      }),
      'strict add_relation response included write metadata',
    );
    assert.equal(
      strictAddRelationFailure({
        result: {
          isError: true,
          structuredContent: { postWriteMaintenance: { summary: { totalActions: 0 } } },
          content: [{ text: 'type must be one of: depends_on, relates. Received: "depend_on". Did you mean "depends_on"?' }],
        },
      }),
      'strict add_relation structuredContent included write metadata',
    );
    assert.equal(
      strictAddRelationFailure({
        result: {
          isError: true,
          structuredContent: { alreadyExists: false },
          content: [{ text: 'type must be one of: depends_on, relates. Received: "depend_on". Did you mean "depends_on"?' }],
        },
      }),
      'strict add_relation structuredContent included write metadata',
    );
  });

  it('summarizes strict maintenance filter enum values in verify output', () => {
    assert.equal(
      maintenanceFilterEnumSummary(),
      `phases=${MAINTENANCE_PHASE_VALUES.join('/')}; severities=${MAINTENANCE_SEVERITY_VALUES.join('/')}; kinds=${MAINTENANCE_KIND_VALUES.join('/')}`,
    );
  });

  it('summarizes maintenance cursor buckets and next actions in verify output', () => {
    assert.equal(
      maintenanceBucketOutputSummary({
        byPhase: { review: 1, link: 2 },
        bySeverity: {},
        byKind: null,
      }),
      'phase link:2,review:1; severity none; kind n/a',
    );
    assert.equal(
      maintenanceNextActionOutputSummary({
        nextExecutableAction: {
          id: 'maint_link',
          phase: 'link',
          kind: 'add_missing_relation',
          severity: 'warn',
          proposedAction: { tool: 'add_relation', args: {} },
        },
        nextReviewAction: {
          id: 'maint_review',
          phase: 'review',
          kind: 'unassigned_node',
          severity: 'info',
        },
      }),
      'executable maint_link:link/add_missing_relation:warn->add_relation; review maint_review:review/unassigned_node:info',
    );
    assert.equal(
      maintenanceNextActionOutputSummary({ nextExecutableAction: null, nextReviewAction: null }),
      'executable none; review none',
    );
  });

  it('fails malformed maintenance missing-cursor smoke responses', () => {
    const summary = {
      totalActions: 3,
      filteredActions: 3,
      remainingActions: 0,
      executableActions: 2,
      reviewActions: 1,
      compileIssues: 0,
      dependencyCycles: 0,
      canonicalizationActions: 0,
      danglingReferences: 0,
      relationRecommendations: 1,
      externalElementRefs: 1,
      externalElementRefsIgnored: 0,
      unassignedNodes: 1,
      emptyDomains: 0,
    };
    const clean = {
      operation: 'maintenance_plan',
      sideEffect: false,
      summary,
      cursor: {
        afterActionId: 'maint_missing',
        found: false,
        reason: 'afterActionId not found in filtered maintenance actions',
        startIndex: null,
        nextAfterActionId: null,
        hasMore: false,
      },
      actions: [],
      byPhase: {},
      bySeverity: {},
      byKind: {},
      nextExecutableAction: null,
      nextReviewAction: null,
    };

    assert.equal(maintenanceMissingCursorFailure(clean), null);
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, operation: 'growth_plan' }),
      'maintenance missing-cursor smoke returned unexpected operation: growth_plan',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, sideEffect: true }),
      'maintenance missing-cursor smoke must be side-effect-free',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, cursor: { ...clean.cursor, found: true } }),
      'maintenance missing-cursor smoke did not report cursor.found=false',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, cursor: { ...clean.cursor, reason: null } }),
      'maintenance missing-cursor smoke did not report the cursor miss reason',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, cursor: { ...clean.cursor, nextAfterActionId: 'maint_link' } }),
      'maintenance missing-cursor smoke should expose cursor.nextAfterActionId=null',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, cursor: { ...clean.cursor, hasMore: true } }),
      'maintenance missing-cursor smoke should expose cursor.hasMore=false',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, actions: [{ id: 'maint_link' }] }),
      'maintenance missing-cursor smoke returned actions',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, summary: { ...summary, remainingActions: 1 } }),
      'maintenance missing-cursor smoke byPhase total does not match remainingActions',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, byPhase: null }),
      'maintenance missing-cursor smoke missing byPhase',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, bySeverity: { warn: -1 } }),
      'maintenance missing-cursor smoke bySeverity missing non-negative integer count: warn',
    );
    assert.equal(
      maintenanceMissingCursorFailure({
        ...clean,
        summary: { ...summary, remainingActions: 1 },
        byPhase: { link: 1 },
        bySeverity: { warn: 1 },
        byKind: { add_missing_relation: 1 },
      }),
      'maintenance missing-cursor smoke should have zero remaining actions',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, summary: { ...summary, totalActions: 2 } }),
      'maintenance missing-cursor smoke summary executable/review counts do not add up',
    );
  });

  it('fails malformed maintenance ready-cursor smoke responses', () => {
    const summary = {
      totalActions: 3,
      filteredActions: 3,
      remainingActions: 0,
      executableActions: 2,
      reviewActions: 1,
      compileIssues: 0,
      dependencyCycles: 0,
      canonicalizationActions: 0,
      danglingReferences: 0,
      relationRecommendations: 1,
      externalElementRefs: 1,
      externalElementRefsIgnored: 0,
      unassignedNodes: 1,
      emptyDomains: 0,
    };
    const clean = {
      operation: 'maintenance_plan',
      sideEffect: false,
      summary,
      cursor: {
        afterActionId: null,
        found: true,
        reason: null,
        startIndex: 0,
        nextAfterActionId: null,
        hasMore: false,
      },
      actions: [],
      byPhase: {},
      bySeverity: {},
      byKind: {},
      nextExecutableAction: null,
      nextReviewAction: null,
    };

    assert.equal(maintenanceReadyCursorFailure(clean), null);
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, operation: 'growth_plan' }),
      'maintenance ready-cursor smoke returned unexpected operation: growth_plan',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, sideEffect: true }),
      'maintenance ready-cursor smoke must be side-effect-free',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, cursor: { ...clean.cursor, found: false } }),
      'maintenance ready-cursor smoke did not report cursor.found=true',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, cursor: { ...clean.cursor, reason: undefined } }),
      'maintenance ready-cursor smoke did not expose cursor.reason=null',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, cursor: { ...clean.cursor, afterActionId: 'maint_prev' } }),
      'maintenance ready-cursor smoke should start without afterActionId',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, cursor: { ...clean.cursor, startIndex: null } }),
      'maintenance ready-cursor smoke should start at index 0',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, cursor: { ...clean.cursor, hasMore: undefined } }),
      'maintenance ready-cursor smoke should expose cursor.hasMore',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, actions: null }),
      'maintenance ready-cursor smoke response missing actions array',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, summary: {} }),
      'maintenance ready-cursor smoke summary missing non-negative integer totalActions',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, summary: { ...summary, remainingActions: 4 } }),
      'maintenance ready-cursor smoke summary remainingActions exceeds filteredActions',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, byPhase: null }),
      'maintenance ready-cursor smoke missing byPhase',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, bySeverity: { warn: 1.5 } }),
      'maintenance ready-cursor smoke bySeverity missing non-negative integer count: warn',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, summary: { ...summary, remainingActions: 1 }, byPhase: {} }),
      'maintenance ready-cursor smoke byPhase total does not match remainingActions',
    );
    const withoutNextExecutable = { ...clean };
    delete withoutNextExecutable.nextExecutableAction;
    assert.equal(
      maintenanceReadyCursorFailure(withoutNextExecutable),
      'maintenance ready-cursor smoke missing next action pointers',
    );
    const withActions = {
      ...clean,
      summary: { ...summary, remainingActions: 2 },
      actions: [
        { id: 'maint_link', executable: true, phase: 'link', kind: 'add_missing_relation', severity: 'warn' },
        { id: 'maint_review', executable: false, phase: 'review', kind: 'unassigned_node', severity: 'info' },
      ],
      byPhase: { link: 1, review: 1 },
      bySeverity: { warn: 1, info: 1 },
      byKind: { add_missing_relation: 1, unassigned_node: 1 },
      cursor: { ...clean.cursor, nextAfterActionId: 'maint_review' },
      nextExecutableAction: { id: 'maint_link', executable: true, phase: 'link', kind: 'add_missing_relation', severity: 'warn' },
      nextReviewAction: { id: 'maint_review', executable: false, phase: 'review', kind: 'unassigned_node', severity: 'info' },
    };
    assert.equal(maintenanceReadyCursorFailure(withActions), null);
    assert.equal(
      maintenanceReadyCursorFailure({
        ...withActions,
        actions: [...withActions.actions, { id: 'maint_extra', executable: true }],
      }),
      'maintenance ready-cursor smoke actions exceed remainingActions',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...withActions, cursor: { ...withActions.cursor, nextAfterActionId: 'maint_link' } }),
      'maintenance ready-cursor smoke cursor.nextAfterActionId did not match last page action',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...withActions, cursor: { ...withActions.cursor, hasMore: true } }),
      'maintenance ready-cursor smoke cursor.hasMore did not match remaining page state',
    );
    assert.equal(
      maintenanceReadyCursorFailure({
        ...withActions,
        summary: { ...summary, remainingActions: 3 },
        byPhase: { link: 1, review: 1, repair: 1 },
        bySeverity: { warn: 1, info: 2 },
        byKind: { add_missing_relation: 1, unassigned_node: 1, canonicalize_graph_arrays: 1 },
        cursor: { ...withActions.cursor, hasMore: true },
      }),
      null,
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...withActions, nextExecutableAction: { id: 'maint_later', executable: true } }),
      'maintenance ready-cursor smoke nextExecutableAction did not match first page action',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...withActions, nextReviewAction: null }),
      'maintenance ready-cursor smoke missing nextReviewAction',
    );
    assert.equal(
      maintenanceReadyCursorFailure({
        ...withActions,
        actions: [],
        summary: { ...summary, remainingActions: 0 },
        byPhase: {},
        bySeverity: {},
        byKind: {},
        cursor: { ...withActions.cursor, nextAfterActionId: null },
        nextExecutableAction: { id: 'maint_link', executable: true },
      }),
      'maintenance ready-cursor smoke unexpected nextExecutableAction',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...withActions, nextReviewAction: { id: 'maint_review', executable: true } }),
      'maintenance ready-cursor smoke nextReviewAction executable flag mismatch',
    );
    assert.equal(
      maintenanceReadyCursorFailure({
        ...withActions,
        nextExecutableAction: { ...withActions.nextExecutableAction, phase: 'repair' },
      }),
      'maintenance ready-cursor smoke nextExecutableAction phase mismatch',
    );
    assert.equal(
      maintenanceReadyCursorFailure({
        ...withActions,
        nextExecutableAction: { ...withActions.nextExecutableAction, kind: 'canonicalize_graph_arrays' },
      }),
      'maintenance ready-cursor smoke nextExecutableAction kind mismatch',
    );
    assert.equal(
      maintenanceReadyCursorFailure({
        ...withActions,
        nextExecutableAction: { ...withActions.nextExecutableAction, severity: 'info' },
      }),
      'maintenance ready-cursor smoke nextExecutableAction severity mismatch',
    );
  });

  it('fails malformed maintenance resume-cursor smoke responses', () => {
    const previousSummary = {
      totalActions: 3,
      filteredActions: 3,
      remainingActions: 3,
      executableActions: 2,
      reviewActions: 1,
      compileIssues: 0,
      dependencyCycles: 0,
      canonicalizationActions: 0,
      danglingReferences: 0,
      relationRecommendations: 1,
      externalElementRefs: 1,
      externalElementRefsIgnored: 0,
      unassignedNodes: 1,
      emptyDomains: 0,
    };
    const summary = { ...previousSummary, remainingActions: 2 };
    const previousPage = {
      summary: previousSummary,
      actions: [
        { id: 'maint_seen', executable: true, phase: 'link', kind: 'add_missing_relation', severity: 'warn' },
        { id: 'maint_review', executable: false, phase: 'review', kind: 'unassigned_node', severity: 'info' },
      ],
    };
    const clean = {
      operation: 'maintenance_plan',
      sideEffect: false,
      summary,
      cursor: {
        afterActionId: 'maint_seen',
        found: true,
        reason: null,
        startIndex: 1,
        nextAfterActionId: 'maint_repair',
        hasMore: false,
      },
      actions: [
        { id: 'maint_review', executable: false, phase: 'review', kind: 'unassigned_node', severity: 'info' },
        { id: 'maint_repair', executable: true, phase: 'repair', kind: 'canonicalize_graph_arrays', severity: 'warn' },
      ],
      byPhase: { review: 1, repair: 1 },
      bySeverity: { info: 1, warn: 1 },
      byKind: { unassigned_node: 1, canonicalize_graph_arrays: 1 },
      nextExecutableAction: { id: 'maint_repair', executable: true, phase: 'repair', kind: 'canonicalize_graph_arrays', severity: 'warn' },
      nextReviewAction: { id: 'maint_review', executable: false, phase: 'review', kind: 'unassigned_node', severity: 'info' },
    };

    assert.equal(maintenanceResumeCursorFailure(previousPage, clean, 'maint_seen'), null);
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, operation: 'growth_plan' }, 'maint_seen'),
      'maintenance resume-cursor smoke returned unexpected operation: growth_plan',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, cursor: { ...clean.cursor, afterActionId: 'maint_other' } }, 'maint_seen'),
      'maintenance resume-cursor smoke did not preserve afterActionId',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, cursor: { ...clean.cursor, found: false } }, 'maint_seen'),
      'maintenance resume-cursor smoke did not report cursor.found=true',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, cursor: { ...clean.cursor, reason: 'miss' } }, 'maint_seen'),
      'maintenance resume-cursor smoke did not expose cursor.reason=null',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, cursor: { ...clean.cursor, startIndex: 0 } }, 'maint_seen'),
      'maintenance resume-cursor smoke should start after the resumed action',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, summary: { ...summary, remainingActions: 3 } }, 'maint_seen'),
      'maintenance resume-cursor smoke remainingActions did not advance past afterActionId',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, actions: [{ id: 'maint_seen' }] }, 'maint_seen'),
      'maintenance resume-cursor smoke repeated the afterActionId action',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, cursor: { ...clean.cursor, nextAfterActionId: 'maint_review' } }, 'maint_seen'),
      'maintenance resume-cursor smoke cursor.nextAfterActionId did not match last page action',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, cursor: { ...clean.cursor, hasMore: true } }, 'maint_seen'),
      'maintenance resume-cursor smoke cursor.hasMore did not match remaining page state',
    );
    assert.equal(
      maintenanceResumeCursorFailure(previousPage, { ...clean, nextExecutableAction: null }, 'maint_seen'),
      'maintenance resume-cursor smoke missing nextExecutableAction',
    );
  });

  it('fails initialize instructions missing first-contact safety and recovery guidance', () => {
    const safeInstructions = [
      'Use read-only first-contact diagnosis before write tools.',
      `Tool inventory includes ${EXPECTED_TOOLS.join(', ')}.`,
      'rename_concept refuses an existing `newSlug` unless overwrite: true is explicit.',
      'delete_concept force: true means accepting dangling referrers.',
      'Use expected_mtime when patching a previously-read concept.',
      'Tool schemas reject unknown arguments with nearest hints.',
      'unknown arguments are rejected instead of being ignored.',
      'unknown tool names are rejected with closest tool-name hints.',
      'Tool-level errors include structuredContent errorCode values such as unknown_tool for unknown tool names, unknown_argument for unknown argument names and invalid_arguments for invalid enum/filter/type values.',
      'Tool-level errors include structuredContent repair fields such as receivedTool, receivedArgument, unknownArguments, rowName, receivedField, unknownFields, allowedFields, receivedFields, firstSeenAt, receivedValue, suggestion, allowedTools, allowedArguments, and allowedValues.',
      'Missing node errors include structuredContent repair fields such as missingSlug, similarSlugs, recoveryTools, and createTool.',
      'Slug conflict errors include structuredContent repair fields such as conflictSlug, recoveryTools, and overwriteOption.',
      'Unknown tool: list_concept. Did you mean "list_concepts"?',
      'Unknown argument "lmit" for list_concepts. Did you mean "limit"?',
      'Unknown arguments for list_concepts: "lmit" (did you mean "limit"?), "summry" (did you mean "summary"?)',
      'Batch add_concepts and add_relations isolate each non-object row and unknown row fields as ok:false.',
      'Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`; if every row failed, treat the call as dry validation evidence and retry corrected rows.',
      'Invalid-only batches return no row-level `changed` / `alreadyExists` write metadata and no top-level `postWriteMaintenance`; if every row failed, treat the call as dry validation evidence and retry corrected rows.',
      'Batch add_relations unknown type row errors include a closest-value hint such as Did you mean "depends_on"?',
      'Duplicate add_concepts input slugs report concepts[n] duplicate slug in input batch; first seen at concepts[m].',
      'operation must be one of: ... Invalid value: overveiw. Did you mean "overview"?',
      'maintenance_plan phases, severities, and kinds filters are enum-validated.',
      'health and workspace_brief tune probes with componentLimit, cycleLimit, recommendationLimit, orderLimit, nodeLimit, dependencyTypes, and componentTypes.',
      'dependencyTypes / componentTypes accept relation types domains, domain, capabilities, elements, dependencies, depends_on, relates, contains, describes; typoed values fail with nearest-value hints.',
      'maintenance_plan ready pages return cursor.found=true with cursor.reason=null.',
      'maintenance_plan ready pages set cursor.nextAfterActionId to the last returned action id and cursor.hasMore for remaining pages.',
      'maintenance_plan nextExecutableAction and nextReviewAction point only at the first executable/review action in the current returned page.',
      'maintenance_plan afterActionId cursor misses return cursor.found=false and cursor.reason.',
      'maintenance_plan missing cursors return cursor.nextAfterActionId=null and cursor.hasMore=false.',
      'This filler keeps the instructions representative of a real initialize response.',
    ].join('\n');

    assert.equal(initializeInstructionsFailure({ result: { instructions: safeInstructions } }), null);
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: '' } }),
      'initialize instructions missing or too short',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('infer_imports', 'infer imports') } }),
      'initialize instructions missing tool inventory entry: infer_imports',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('overwrite: true', '') } }),
      'initialize instructions missing overwrite safety',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('dangling referrers', '') } }),
      'initialize instructions missing dangling referrers safety',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('expected_mtime', '') } }),
      'initialize instructions missing expected_mtime conflict guard',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('unknown arguments are rejected', '') } }),
      'initialize instructions missing strict arguments guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('Unknown tool: list_concept. Did you mean "list_concepts"?', '') } }),
      'initialize instructions missing unknown tool guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('unknown_argument', 'argument_error') } }),
      'initialize instructions missing structured errorCode guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('rowName, receivedField, unknownFields, allowedFields, receivedFields, firstSeenAt, ', '') } }),
      'initialize instructions missing structured row field repair guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('missingSlug, similarSlugs, recoveryTools, and createTool', 'missing node fields') } }),
      'initialize instructions missing structured missing slug guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('conflictSlug, recoveryTools, and overwriteOption', 'conflict fields') } }),
      'initialize instructions missing structured conflict guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('"summry" (did you mean "summary"?)', '"summry"') } }),
      'initialize instructions missing multiple unknown arguments guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('non-object row and unknown row fields', 'bad rows') } }),
      'initialize instructions missing batch row isolation guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('no row-level write metadata and no top-level `postWriteMaintenance`', 'write result metadata maybe present') } }),
      'initialize instructions missing batch no-write metadata guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('no row-level `changed` / `alreadyExists` write metadata and no top-level `postWriteMaintenance`', 'relation metadata maybe present') } }),
      'initialize instructions missing batch relation no-write metadata guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('unknown type row errors include a closest-value hint such as Did you mean "depends_on"?', 'unknown type row errors fail') } }),
      'initialize instructions missing batch relation type hint guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('concepts[n] duplicate slug in input batch; first seen at concepts[m]', 'duplicate slug') } }),
      'initialize instructions missing batch duplicate slug guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('Did you mean "overview"?', '') } }),
      'initialize instructions missing nearest enum hint guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('phases, severities, and kinds', 'filters') } }),
      'initialize instructions missing maintenance filter enum guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('componentLimit, cycleLimit, recommendationLimit, orderLimit, nodeLimit, dependencyTypes, and componentTypes', 'tuning options') } }),
      'initialize instructions missing health tuning guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('depends_on, relates, contains, describes', 'relation values') } }),
      'initialize instructions missing health relation filter enum guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('cursor.found=true with cursor.reason=null', 'ready cursor') } }),
      'initialize instructions missing maintenance ready cursor guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('cursor.nextAfterActionId to the last returned action id', 'cursor marker') } }),
      'initialize instructions missing maintenance ready cursor pagination guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('current returned page', 'remaining queue') } }),
      'initialize instructions missing maintenance current-page pointer guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('cursor.found=false and cursor.reason', 'empty page') } }),
      'initialize instructions missing maintenance cursor miss guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('cursor.nextAfterActionId=null and cursor.hasMore=false', 'no pagination metadata') } }),
      'initialize instructions missing maintenance cursor miss pagination guidance',
    );
  });

  it('rejects partial or non-positive verify timeout env values', () => {
    assert.equal(parseVerifyTimeoutMs('1000ms'), false);
    assert.equal(parseVerifyTimeoutMs('0'), false);
    assert.equal(parseVerifyTimeoutMs('-1'), false);
    assert.equal(parseVerifyTimeoutMs('nope'), false);
    assert.match(verifyTimeoutValueErrorMessage('1000ms'), /Received: "1000ms"/);
    assert.match(verifyTimeoutValueErrorMessage('1000ms'), /npm run verify -- --timeout-ms 15000/);
    assert.match(
      verifyTimeoutValueErrorMessage('1000ms', verifyRetryEnvForVault('../docs/ontology', {}, '/tmp/cwd')),
      /npm run verify -- --vault \.\.\/docs\/ontology --timeout-ms 15000/,
    );
  });

  it('formats actionable timeout failures', () => {
    assert.equal(
      verifyTimeoutFailure(1, {}),
      'server verify timed out after 1ms. Increase --timeout-ms or OMOT_VERIFY_TIMEOUT_MS for large or slow vaults. After timeout verify sends SIGTERM and then SIGKILL; set OMOT_VERIFY_KILL_GRACE_MS=N only to tune that cleanup window. Example: npm run verify -- --timeout-ms 15000',
    );
    assert.equal(
      verifyTimeoutFailure(1, { OMOT_VERIFY_RETRY_EXAMPLE: 'oh-my-ontology mcp-verify --timeout-ms 15000' }),
      'server verify timed out after 1ms. Increase --timeout-ms or OMOT_VERIFY_TIMEOUT_MS for large or slow vaults. After timeout verify sends SIGTERM and then SIGKILL; set OMOT_VERIFY_KILL_GRACE_MS=N only to tune that cleanup window. Example: oh-my-ontology mcp-verify --timeout-ms 15000',
    );
    assert.equal(
      verifyRetryExample({ OMOT_VERIFY_RETRY_EXAMPLE: ' oh-my-ontology mcp-verify --timeout-ms 15000 ' }),
      'oh-my-ontology mcp-verify --timeout-ms 15000',
    );
    assert.equal(
      verifyRetryExample(verifyRetryEnvForVault('../vault with space', {}, '/tmp/cwd')),
      "npm run verify -- --vault '../vault with space' --timeout-ms 15000",
    );
    assert.equal(verifyRetryEnvForVault('.', {}, '/tmp/cwd').OMOT_VERIFY_RETRY_EXAMPLE, undefined);
    assert.equal(verifyRetryExample({ OMOT_VERIFY_RETRY_EXAMPLE: '   ' }), 'npm run verify -- --timeout-ms 15000');
  });

  it('formats startup failures before initialize separately from timeouts', () => {
    assert.equal(
      serverStartupFailure('Vault root not found'),
      'server failed before initialize. stderr: Vault root not found Example: npm run verify -- --timeout-ms 15000',
    );
    assert.equal(
      serverStartupFailure('', verifyRetryEnvForVault('../docs/ontology', {}, '/tmp/cwd')),
      'no initialize response. Example: npm run verify -- --vault ../docs/ontology --timeout-ms 15000',
    );
  });

  it('formats startup failures for server signal exits before first-contact separately from timeouts', () => {
    assert.equal(
      serverSignalFailure('SIGTERM', 'server received signal', verifyRetryEnvForVault('../docs/ontology', {}, '/tmp/cwd')),
      'server terminated by SIGTERM before first-contact completed. stderr: server received signal Example: npm run verify -- --vault ../docs/ontology --timeout-ms 15000',
    );
    assert.equal(
      serverSignalFailure('', '', {}),
      'server terminated by unknown signal before first-contact completed. Example: npm run verify -- --timeout-ms 15000',
    );
  });

  it('formats startup failures for parser smoke signal exits separately from numeric exits', () => {
    assert.equal(parserSmokeFailure(1, null), 'parser test failed (exit 1)');
    assert.equal(parserSmokeFailure(null, 'SIGTERM'), 'parser test terminated by SIGTERM');
  });

  it('detects when all first-contact JSON-RPC responses arrived', () => {
    const allFirstContactIds = [...FIRST_CONTACT_RESPONSE_LABELS.keys()];
    assert.equal(
      hasAllFirstContactResponses(
        allFirstContactIds
          .map((id) => JSON.stringify({ jsonrpc: '2.0', id, result: {} }))
          .join('\n'),
      ),
      true,
    );
    assert.equal(
      hasAllFirstContactResponses(
        [1, 2, 3, 4, 5].map((id) => JSON.stringify({ jsonrpc: '2.0', id, result: {} })).join('\n'),
      ),
      false,
    );
    assert.equal(
      hasAllFirstContactResponses(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
          .map((id) => JSON.stringify({ jsonrpc: '2.0', id, result: {} }))
          .join('\n'),
        new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
      ),
      true,
    );
  });

  it('keeps node-dependent first-contact smokes optional until their live target exists', () => {
    const ids = initialExpectedFirstContactIds();
    assert.deepEqual(OPTIONAL_FIRST_CONTACT_RESPONSE_IDS, [30, 31, 33, 35, 36, 37, 43, 44, 45, 61]);
    assert.deepEqual(DYNAMIC_FIRST_CONTACT_RESPONSE_IDS, [11, 13, 14, 15, ...OPTIONAL_FIRST_CONTACT_RESPONSE_IDS]);
    for (const optionalId of OPTIONAL_FIRST_CONTACT_RESPONSE_IDS) {
      assert.equal(ids.has(optionalId), false, `${FIRST_CONTACT_RESPONSE_LABELS.get(optionalId)} starts optional`);
    }
    for (const requestId of expectedResponseIds(buildFirstContactRequests())) {
      assert.equal(ids.has(requestId), true, `${FIRST_CONTACT_RESPONSE_LABELS.get(requestId)} starts required`);
    }
  });

  it('keeps first-contact response labels aligned with the read-tool smoke', () => {
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(11), 'get_concepts');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(12), 'project_map_query_plan');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(13), 'neighbors');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(14), 'path');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(15), 'project_scope');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(16), 'strict_args');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(18), 'project_probe');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(19), 'find_orphans');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(20), 'health_tuned');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(21), 'workspace_brief_tuned');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(22), 'strict_maintenance_phase_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(23), 'strict_maintenance_severity_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(24), 'strict_maintenance_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(25), 'maintenance_missing_cursor');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(26), 'maintenance_ready_cursor');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(27), 'strict_multi_args');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(30), 'maintenance_resume_cursor');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(31), 'get_concept');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(32), 'find_evidence');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(33), 'find_backlinks');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(34), 'query_concepts');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(35), 'find_neighbors');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(36), 'find_path');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(37), 'query_concepts_limited');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(38), 'analyze_repo_structure');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(39), 'infer_imports');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(40), 'strict_relation_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(41), 'compile_ontology_page');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(42), 'compile_ontology_indexes');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(43), 'rename_concept_dry_run');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(44), 'merge_concepts_dry_run');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(45), 'delete_concept_dry_run');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(46), 'strict_relation_check');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(47), 'strict_graph_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(48), 'strict_graph_from_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(49), 'strict_graph_to_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(50), 'strict_add_relation');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(51), 'strict_recommend_relations_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(52), 'strict_recommend_relations_unsupported_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(53), 'strict_match_nodes_sort_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(54), 'strict_match_edges_type_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(55), 'strict_find_neighbors_type_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(56), 'strict_find_orphans_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(57), 'strict_find_orphans_exclude_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(58), 'strict_query_concepts_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(59), 'strict_query_concepts_has_key_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(60), 'strict_list_concepts_kind_filter');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(61), 'patch_concept_conflict_guard');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(62), 'add_concepts_batch_cap');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(63), 'add_relations_batch_cap');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(64), 'get_concepts_batch_cap');
    assert.equal(FIRST_CONTACT_RESPONSE_LABELS.get(65), 'strict_unknown_tool');
    assert.deepEqual(
      [...expectedResponseIds(buildFirstContactRequests()), ...DYNAMIC_FIRST_CONTACT_RESPONSE_IDS].sort((a, b) => a - b),
      [...FIRST_CONTACT_RESPONSE_LABELS.keys()].sort((a, b) => a - b),
    );
    const responsesWithoutGetConcepts = [...FIRST_CONTACT_RESPONSE_LABELS.keys()]
      .filter((id) => id !== 11)
      .map((id) => ({ id, result: {} }));
    assert.deepEqual(
      missingResponseLabels(responsesWithoutGetConcepts, FIRST_CONTACT_RESPONSE_LABELS),
      ['get_concepts'],
    );
  });

  it('builds bootstrap and import-analysis read smokes into first-contact verify', () => {
    const analyze = buildFirstContactRequests().find((request) => request.id === 38);
    const infer = buildFirstContactRequests().find((request) => request.id === 39);
    const conceptBatchCap = buildFirstContactRequests().find((request) => request.id === 62);
    const relationBatchCap = buildFirstContactRequests().find((request) => request.id === 63);
    const getConceptsBatchCap = buildFirstContactRequests().find((request) => request.id === 64);
    const compilePage = buildFirstContactRequests().find((request) => request.id === 41);
    const compileIndexes = buildFirstContactRequests().find((request) => request.id === 42);
    const strictRelationCheck = buildFirstContactRequests().find((request) => request.id === 46);
    const strictAddRelation = buildFirstContactRequests().find((request) => request.id === 50);
    const strictUnknownTool = buildFirstContactRequests().find((request) => request.id === 65);
    assert.equal(analyze?.params?.name, 'analyze_repo_structure');
    assert.equal(analyze?.params?.arguments?.maxDepth, 2);
    assert.match(analyze?.params?.arguments?.rootPath ?? '', /oh-my-ontology$/);
    assert.equal(infer?.params?.name, 'infer_imports');
    assert.equal(infer?.params?.arguments?.maxFiles, 5000);
    assert.match(infer?.params?.arguments?.rootPath ?? '', /oh-my-ontology$/);
    assert.equal(conceptBatchCap?.params?.name, 'add_concepts');
    assert.equal(conceptBatchCap?.params?.arguments?.concepts?.length, 51);
    assert.equal(relationBatchCap?.params?.name, 'add_relations');
    assert.equal(relationBatchCap?.params?.arguments?.relations?.length, 51);
    assert.equal(getConceptsBatchCap?.params?.name, 'get_concepts');
    assert.equal(getConceptsBatchCap?.params?.arguments?.slugs?.length, 51);
    assert.equal(compilePage?.params?.name, 'compile_ontology');
    assert.deepEqual(compilePage?.params?.arguments, { nodesLimit: 1, edgesLimit: 1 });
    assert.equal(compileIndexes?.params?.name, 'compile_ontology');
    assert.deepEqual(compileIndexes?.params?.arguments, { nodesLimit: 1, edgesLimit: 1, includeIndexes: true });
    assert.deepEqual(strictRelationCheck?.params, {
      name: 'query_ontology',
      arguments: {
        operation: 'relation_check',
        from: 'missing-relation-check-source',
        to: 'missing-relation-check-target',
        type: 'depend_on',
      },
    });
    assert.deepEqual(strictAddRelation?.params, {
      name: 'add_relation',
      arguments: {
        from: 'missing-add-relation-source',
        to: 'missing-add-relation-target',
        type: 'depend_on',
      },
    });
    assert.deepEqual(strictUnknownTool?.params, {
      name: 'list_concept',
      arguments: {},
    });
  });

  it('builds direct graph-read smoke requests only when a node exists', () => {
    assert.deepEqual(buildDirectGraphReadSmokeRequests({ hasNode: false }), {
      requests: [],
      expectedResponseIds: [],
    });
    assert.deepEqual(
      buildDirectGraphReadSmokeRequests({
        slug: 'capabilities/mcp-server',
        pathTarget: 'project',
        hasNode: true,
      }),
      {
        requests: [
          {
            jsonrpc: '2.0',
            id: 35,
            method: 'tools/call',
            params: { name: 'find_neighbors', arguments: { slug: 'capabilities/mcp-server', limit: 5 } },
          },
          {
            jsonrpc: '2.0',
            id: 36,
            method: 'tools/call',
            params: { name: 'find_path', arguments: { from: 'capabilities/mcp-server', to: 'project' } },
          },
        ],
        expectedResponseIds: [35, 36],
      },
    );
  });

  it('builds limited query_concepts smoke request for non-trivial vaults', () => {
    assert.equal(buildLimitedQueryConceptsSmokeRequest({ total: 2, nodes: [{ slug: 'project' }] }), null);
    assert.deepEqual(
      buildLimitedQueryConceptsSmokeRequest({
        total: 3,
        nodes: [{ slug: 'project' }, { slug: 'domains/core' }, { slug: 'capabilities/search' }],
      }),
      {
        request: {
          jsonrpc: '2.0',
          id: 37,
          method: 'tools/call',
          params: { name: 'query_concepts', arguments: { filter: 'slug!=project', limit: 1 } },
        },
        excludedSlug: 'project',
        expectedTotal: 2,
      },
    );
  });

  it('builds destructive writer dry-run smoke requests from listed nodes', () => {
    assert.deepEqual(buildDestructiveDryRunSmokeRequests({ nodes: [] }), {
      requests: [],
      expectedResponseIds: [],
    });

    const single = buildDestructiveDryRunSmokeRequests({
      nodes: [{ slug: 'project', kind: 'project' }],
    });
    assert.deepEqual(single.expectedResponseIds, [43, 45]);
    assert.equal(single.requests[0].params.name, 'rename_concept');
    assert.equal(single.requests[0].params.arguments.oldSlug, 'project');
    assert.match(single.requests[0].params.arguments.newSlug, /^__omot_verify_dry_run_target_/);
    assert.equal(single.requests[1].params.name, 'delete_concept');
    assert.deepEqual(single.requests[1].params.arguments, { slug: 'project' });

    const multi = buildDestructiveDryRunSmokeRequests({
      nodes: [{ slug: 'project' }, { slug: 'capabilities/mcp-server' }],
    });
    assert.deepEqual(multi.expectedResponseIds, [43, 44, 45]);
    assert.equal(multi.requests[1].params.name, 'merge_concepts');
    assert.deepEqual(multi.requests[1].params.arguments, {
      fromSlug: 'project',
      intoSlug: 'capabilities/mcp-server',
    });
  });

  it('builds patch_concept conflict guard smoke request from a listed node', () => {
    assert.equal(buildPatchConflictGuardSmokeRequest({ nodes: [] }), null);
    assert.equal(buildPatchConflictGuardSmokeRequest({ nodes: [{ slug: 'README', kind: 'vault-readme' }] }), null);

    const request = buildPatchConflictGuardSmokeRequest({
      nodes: [
        { slug: 'README', kind: 'vault-readme' },
        { slug: 'capabilities/mcp-server', kind: 'capability' },
      ],
    });
    assert.equal(request.id, 61);
    assert.equal(request.params.name, 'patch_concept');
    assert.deepEqual(request.params.arguments, {
      slug: 'capabilities/mcp-server',
      frontmatter: { title: '__omot_verify_conflict_probe__' },
      expected_mtime: 1,
    });
  });

  it('accepts clean find_evidence, find_backlinks, and query_concepts payloads', () => {
    const match = {
      slug: 'project',
      kind: 'project',
      title: 'Project',
      mtime: 1,
    };
    assert.equal(
      findEvidenceFailure({
        query: 'project',
        matches: [{ ...match, matchedIn: 'frontmatter', excerpt: 'Project overview.' }],
      }),
      null,
    );
    assert.equal(
      findBacklinksFailure({
        target: 'project',
        total: 1,
        matches: [{ ...match, slug: 'domains/core', kind: 'domain', matchedKeys: ['domains'] }],
      }, 'project'),
      null,
    );
    assert.equal(
      queryConceptsFailure({
        filter: 'kind=project',
        parsedAs: 'kind = project',
        total: 1,
        matches: [match],
        limited: false,
      }),
      null,
    );
    assert.equal(
      limitedQueryConceptsFailure({
        filter: 'slug!=project',
        parsedAs: 'slug != project',
        total: 2,
        matches: [{ ...match, slug: 'domains/core', kind: 'domain' }],
        limited: true,
      }, 'project', 2),
      null,
    );
  });

  it('accepts clean find_neighbors and find_path payloads', () => {
    const node = {
      slug: 'project',
      kind: 'project',
      title: 'Project',
      mtime: 1,
    };
    assert.equal(
      findNeighborsFailure({
        requested: 'project',
        center: 'project',
        direction: 'both',
        types: [],
        totalEdges: 1,
        limited: false,
        edges: [{ direction: 'outgoing', from: 'project', to: 'domains/core', via: 'domains', ref: 'domains/core', resolved: true }],
        nodes: [{ ...node, slug: 'domains/core', kind: 'domain' }],
      }, 'project'),
      null,
    );
    assert.equal(
      findPathFailure({
        from: 'project',
        to: 'domains/core',
        found: true,
        hopCount: 1,
        hops: ['project', 'domains/core'],
        edges: [{ from: 'project', to: 'domains/core', via: 'domains' }],
      }, 'project', 'domains/core'),
      null,
    );
  });

  it('accepts clean bootstrap and import-analysis read smoke payloads', () => {
    assert.equal(
      analyzeRepoStructureFailure({
        rootPath: '/repo',
        framework: 'fsd',
        domains: [{ slug: 'domains/app', title: 'App', evidence: { source: 'src/app' } }],
        capabilities: [{ slug: 'capabilities/search', title: 'Search', evidence: { source: 'src/features/search' } }],
        elements: [{ slug: 'elements/src/app/page.tsx', title: 'page.tsx', evidence: { source: 'app/page.tsx' } }],
        suggestedRelations: [{ from: 'project', to: 'domains/app', type: 'domains' }],
        skipped: [{ path: 'node_modules', reason: 'ignored' }],
      }),
      null,
    );
    assert.equal(
      inferImportsFailure({
        rootPath: '/repo',
        filesScanned: 1,
        edges: [{ from: 'src/a.ts', to: 'src/b.ts', kind: 'static' }],
        externalImports: [{ from: 'src/a.ts', spec: 'react' }],
        unresolved: [{ from: 'src/a.ts', spec: '@/missing', reason: 'alias-not-found' }],
        moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 1, kindCounts: { static: 1 } }],
      }),
      null,
    );
  });

  it('accepts clean get_concept single-node payloads', () => {
    assert.equal(
      getConceptFailure(
        {
          slug: 'capabilities/mcp-server',
          frontmatter: { kind: 'capability', title: 'MCP Server' },
          excerpt: 'Agent-facing MCP server.',
          neighbors: {
            domains: [],
            domain: 'domains/ai-agent-partner',
            capabilities: [],
            elements: ['elements/mcp-sdk'],
            dependencies: [],
            relates: [],
            contains: [],
            describes: [],
          },
          outgoingEdges: [{ to: 'elements/mcp-sdk', via: 'elements' }],
          mtime: 1,
        },
        'capabilities/mcp-server',
      ),
      null,
    );
  });

  it('derives missing first-contact labels from the shared label map', () => {
    const responsesWithoutGetConcepts = [...FIRST_CONTACT_RESPONSE_LABELS.keys()]
      .filter((id) => id !== 11)
      .map((id) => ({ id, result: {} }));
    assert.deepEqual(firstContactMissingResponseLabels(responsesWithoutGetConcepts), ['get_concepts']);
  });

  it('detects first-contact JSON-RPC error responses before timeout', () => {
    const stdout = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32603, message: 'vault failed' } }),
    ].join('\n');
    assert.equal(hasFirstContactErrorResponse(stdout), true);
    assert.equal(
      firstContactErrorFailure({ id: 3, error: { message: 'vault failed' } }),
      'list_concepts returned JSON-RPC error: vault failed',
    );
  });

  it('accepts clean get_concepts batch payloads with partial rows', () => {
    const row = (slug, frontmatter) => ({
      ok: true,
      slug,
      frontmatter,
      excerpt: `${frontmatter.title} body`,
      neighbors: {
        domains: [],
        domain: null,
        capabilities: [],
        elements: [],
        dependencies: [],
        relates: [],
        contains: [],
        describes: [],
      },
      outgoingEdges: [],
      mtime: 1,
    });
    assert.equal(
      getConceptsFailure({
        concepts: [
          row('project', { kind: 'project', title: 'Project' }),
          row('capabilities/mcp-server', { kind: 'capability', title: 'MCP Server' }),
          {
            ok: false,
            slug: 'missing-verify-slug',
            error: 'Doc not found: missing-verify-slug',
          },
        ],
      }),
      null,
    );
    assert.equal(
      getConceptsFailure({
        concepts: [
          {
            ok: false,
            slug: 'missing-verify-slug',
            error: 'Doc not found: missing-verify-slug',
          },
        ],
      }),
      null,
    );
  });

  it('fails malformed find_orphans payloads and root default-exclusion drift', () => {
    assert.equal(
      findOrphansFailure({
        total: 1,
        orphans: [
          {
            slug: 'capabilities/orphan',
            kind: 'capability',
            title: 'Orphan',
            mtime: 1,
          },
        ],
      }),
      null,
    );
    assert.equal(findOrphansFailure({ orphans: [] }), 'find_orphans response missing total count');
    assert.equal(findOrphansFailure({ total: 0 }), 'find_orphans response missing orphans array');
    assert.equal(
      findOrphansFailure({ total: 0, orphans: [{ slug: 'capabilities/orphan' }] }),
      'find_orphans response orphan count exceeds total — orphans 1, total 0',
    );
    assert.equal(
      findOrphansFailure({
        total: 1,
        orphans: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1 }],
      }),
      'find_orphans default exclusions returned root/sentinel kind: project',
    );
    assert.equal(
      findOrphansFailure({
        total: 1,
        orphans: [{ slug: 'README', kind: 'vault-readme', title: 'README', mtime: 1 }],
      }),
      'find_orphans default exclusions returned root/sentinel kind: README',
    );
  });

  it('builds get_concepts smoke slugs from the current list response', () => {
    assert.equal(
      buildGetConceptSmokeSlug({
        nodes: [
          { slug: 'README', kind: 'vault-readme' },
          { slug: 'project', kind: 'project' },
          { slug: 'capabilities/mcp-server' },
        ],
      }),
      'project',
    );
    assert.equal(buildGetConceptSmokeSlug({ nodes: [{ slug: '' }, { title: 'No slug' }] }), null);
    assert.equal(buildGetConceptSmokeSlug({}), null);

    assert.deepEqual(
      buildGetConceptsSmokeSlugs({
        nodes: [
          { slug: 'project' },
          { slug: 'capabilities/mcp-server' },
          { slug: 'elements/mcp-sdk' },
        ],
      }),
      ['project', 'capabilities/mcp-server', 'missing-verify-slug'],
    );
    assert.deepEqual(
      buildGetConceptsSmokeSlugs({
        nodes: [{ slug: '' }, { slug: null }, { title: 'No slug' }],
      }),
      ['missing-verify-slug'],
    );
    assert.deepEqual(buildGetConceptsSmokeSlugs({ nodes: [] }), ['missing-verify-slug']);
    assert.deepEqual(buildGetConceptsSmokeSlugs({}), ['missing-verify-slug']);
  });

  it('builds graph-query smoke args from the current list response', () => {
    assert.deepEqual(
      buildGraphQuerySmokeArgs({
        nodes: [
          { slug: 'README', kind: 'vault-readme' },
          { slug: 'project', kind: 'project' },
          { slug: 'capabilities/mcp-server', kind: 'capability' },
        ],
      }),
      { slug: 'capabilities/mcp-server', pathTarget: 'project', project: 'project', hasNode: true, hasProject: true },
    );
    assert.deepEqual(
      buildGraphQuerySmokeArgs({ nodes: [{ slug: 'capabilities/a', kind: 'capability' }] }),
      { slug: 'capabilities/a', pathTarget: 'capabilities/a', project: null, hasNode: true, hasProject: false },
    );
    assert.deepEqual(
      buildGraphQuerySmokeArgs(
        { nodes: [{ slug: 'capabilities/a', kind: 'capability' }] },
        { nodes: [{ slug: 'project', kind: 'project' }] },
      ),
      { slug: 'capabilities/a', pathTarget: 'project', project: 'project', hasNode: true, hasProject: true },
    );
    assert.deepEqual(buildGraphQuerySmokeArgs({ nodes: [] }), { slug: null, pathTarget: null, project: null, hasNode: false, hasProject: false });
  });

  it('builds graph-query smoke requests for project, projectless, and empty vaults', () => {
    const projectSmoke = buildGraphQuerySmokeRequests({
      slug: 'capabilities/login',
      pathTarget: 'project',
      project: 'project',
      hasNode: true,
      hasProject: true,
    });
    assert.deepEqual(projectSmoke.expectedResponseIds, [13, 14, 15]);
    assert.deepEqual(
      projectSmoke.requests.map((request) => request.method),
      ['tools/call', 'tools/call', 'tools/call'],
    );
    assert.deepEqual(
      projectSmoke.requests.map((request) => request.params.name),
      ['query_ontology', 'query_ontology', 'query_ontology'],
    );
    assert.deepEqual(
      projectSmoke.requests.map((request) => request.params.arguments.operation),
      ['neighbors', 'path', 'project_scope'],
    );
    assert.deepEqual(projectSmoke.requests[1].params.arguments, {
      operation: 'path',
      from: 'capabilities/login',
      to: 'project',
    });
    assert.equal(projectSmoke.requests[2].params.arguments.project, 'project');

    const projectlessSmoke = buildGraphQuerySmokeRequests({
      slug: 'domains/core',
      project: null,
      hasNode: true,
      hasProject: false,
    });
    assert.deepEqual(projectlessSmoke.expectedResponseIds, [13, 14]);
    assert.deepEqual(
      projectlessSmoke.requests.map((request) => request.params.arguments.operation),
      ['neighbors', 'path'],
    );

    assert.deepEqual(
      buildGraphQuerySmokeRequests({
        slug: null,
        project: null,
        hasNode: false,
        hasProject: false,
      }),
      { requests: [], expectedResponseIds: [] },
    );
  });

  it('fails malformed get_concepts batch payloads', () => {
    const row = (slug, frontmatter) => ({
      ok: true,
      slug,
      frontmatter,
      excerpt: `${frontmatter.title} body`,
      neighbors: {
        domains: [],
        domain: null,
        capabilities: [],
        elements: [],
        dependencies: [],
        relates: [],
        contains: [],
        describes: [],
      },
      outgoingEdges: [],
      mtime: 1,
    });
    const okConcepts = [
      row('project', { kind: 'project', title: 'Project' }),
      row('capabilities/mcp-server', { kind: 'capability', title: 'MCP Server' }),
      { ok: false, slug: 'missing-verify-slug', error: 'Doc not found: missing-verify-slug' },
    ];
    assert.equal(getConceptsFailure({}), 'get_concepts response missing concepts array');
    assert.equal(
      getConceptsFailure({ concepts: [] }),
      'get_concepts response missing partial smoke row',
    );
    assert.equal(
      getConceptsFailure({ concepts: [{ ...okConcepts[0], ok: false }, okConcepts[1], okConcepts[2]] }),
      'get_concepts response expected success row at index 0',
    );
    assert.equal(
      getConceptsFailure({ concepts: [{ ...okConcepts[0], slug: '  ' }, okConcepts[1], okConcepts[2]] }),
      'get_concepts response missing success slug at index 0',
    );
    assert.equal(
      getConceptsFailure({ concepts: [okConcepts[0], { ...okConcepts[1], frontmatter: null }, okConcepts[2]] }),
      'get_concepts response missing frontmatter: capabilities/mcp-server',
    );
    assert.equal(
      getConceptsFailure({ concepts: [okConcepts[0], { ...okConcepts[1], excerpt: null }, okConcepts[2]] }),
      'get_concepts response missing excerpt: capabilities/mcp-server',
    );
    assert.equal(
      getConceptsFailure({ concepts: [okConcepts[0], { ...okConcepts[1], neighbors: null }, okConcepts[2]] }),
      'get_concepts response missing neighbors: capabilities/mcp-server',
    );
    assert.equal(
      getConceptsFailure({ concepts: [okConcepts[0], okConcepts[1], { slug: 'missing-verify-slug', ok: true }] }),
      'get_concepts response expected partial row to be ok:false',
    );
    assert.equal(
      getConceptsFailure({ concepts: [okConcepts[0], okConcepts[1], null] }),
      'get_concepts response malformed partial row at index 2',
    );
  });

  it('fails malformed get_concept single-node payloads', () => {
    const okConcept = {
      slug: 'capabilities/mcp-server',
      frontmatter: { kind: 'capability', title: 'MCP Server' },
      excerpt: 'Agent-facing MCP server.',
      neighbors: {
        domains: [],
        domain: 'domains/ai-agent-partner',
        capabilities: [],
        elements: ['elements/mcp-sdk'],
        dependencies: [],
        relates: [],
        contains: [],
        describes: [],
      },
      outgoingEdges: [{ to: 'elements/mcp-sdk', via: 'elements' }],
      mtime: 1,
    };
    assert.equal(getConceptFailure(null, 'capabilities/mcp-server'), 'get_concept response malformed');
    assert.equal(
      getConceptFailure({ ...okConcept, slug: 'capabilities/other' }, 'capabilities/mcp-server'),
      'get_concept response slug mismatch — expected capabilities/mcp-server, got capabilities/other',
    );
    assert.equal(
      getConceptFailure({ ...okConcept, excerpt: null }, 'capabilities/mcp-server'),
      'get_concept response missing excerpt: capabilities/mcp-server',
    );
    assert.equal(
      getConceptFailure({ ...okConcept, neighbors: { ...okConcept.neighbors, elements: null } }, 'capabilities/mcp-server'),
      'get_concept response missing neighbors.elements: capabilities/mcp-server',
    );
    assert.equal(
      getConceptFailure({ ...okConcept, outgoingEdges: [{ to: '', via: 'elements' }] }, 'capabilities/mcp-server'),
      'get_concept response missing outgoing edge target at index 0',
    );
    assert.equal(
      getConceptFailure({ ...okConcept, mtime: -1 }, 'capabilities/mcp-server'),
      'get_concept response missing mtime: capabilities/mcp-server',
    );
  });

  it('fails malformed find_evidence, find_backlinks, and query_concepts payloads', () => {
    const match = {
      slug: 'project',
      kind: 'project',
      title: 'Project',
      mtime: 1,
    };
    assert.equal(findEvidenceFailure({ matches: [] }), 'find_evidence response missing query');
    assert.equal(
      findEvidenceFailure({ query: 'project', matches: [{ ...match, matchedIn: 'unknown', excerpt: '' }] }),
      'find_evidence response missing matchedIn: project',
    );
    assert.equal(
      findBacklinksFailure({ target: 'other', total: 0, matches: [] }, 'project'),
      'find_backlinks response target mismatch — expected project, got other',
    );
    assert.equal(
      findBacklinksFailure({ target: 'project', total: 1, matches: [match] }, 'project'),
      'find_backlinks response match has no backlink evidence: project',
    );
    assert.equal(queryConceptsFailure({ matches: [] }), 'query_concepts response missing filter');
    assert.equal(
      queryConceptsFailure({ filter: 'kind=project', parsedAs: 'kind = project', total: 0, matches: [match], limited: false }),
      'query_concepts response match count exceeds total — matches 1, total 0',
    );
    assert.equal(
      limitedQueryConceptsFailure({ filter: 'slug!=project', parsedAs: 'slug != project', total: 2, matches: [match], limited: true }, 'project', 2),
      'query_concepts limited response included excluded slug: project',
    );
    assert.equal(
      limitedQueryConceptsFailure({ filter: 'slug!=project', parsedAs: 'slug != project', total: 1, matches: [{ ...match, slug: 'domains/core', kind: 'domain' }], limited: false }, 'project', 1),
      'query_concepts limited response did not set limited=true',
    );
  });

  it('fails malformed find_neighbors and find_path payloads', () => {
    assert.equal(
      findNeighborsFailure({
        requested: 'project',
        center: 'other',
        direction: 'both',
        types: [],
        totalEdges: 0,
        limited: false,
        edges: [],
        nodes: [],
      }, 'project'),
      'find_neighbors center mismatch — expected project, got other',
    );
    assert.equal(
      findNeighborsFailure({
        requested: 'project',
        center: 'project',
        direction: 'both',
        types: [],
        totalEdges: 1,
        limited: false,
        edges: [{ direction: 'sideways', from: 'project', to: 'domains/core', via: 'domains' }],
        nodes: [],
      }, 'project'),
      'find_neighbors edge missing direction at index 0',
    );
    assert.equal(
      findPathFailure({
        from: 'project',
        to: 'domains/core',
        found: true,
        hopCount: 1,
        hops: ['project', 'domains/core'],
        edges: [],
      }, 'project', 'domains/core'),
      'find_path response edge count mismatch',
    );
    assert.equal(
      findPathFailure({
        from: 'project',
        to: 'domains/core',
        found: true,
        hopCount: 1,
        hops: ['project', 'domains/core'],
        edges: [{ from: 'project', to: 'domains/core', via: 'domains' }],
        nodes: [{ slug: 'project', kind: 'project', title: 'Project' }],
      }, 'project', 'domains/core'),
      'find_path response node count mismatch',
    );
    assert.equal(
      findPathFailure({
        from: 'project',
        to: 'domains/core',
        found: true,
        hopCount: 1,
        hops: ['project', 'domains/core'],
        edges: [{ from: 'project', to: 'domains/core', via: 'domains' }],
        nodes: [
          { slug: 'project', kind: 'project', title: 'Project' },
          { slug: 'domains/wrong', kind: 'domain', title: 'Core' },
        ],
      }, 'project', 'domains/core'),
      'find_path node/hop mismatch at index 1',
    );
  });

  it('fails malformed bootstrap and import-analysis read smoke payloads', () => {
    assert.equal(
      analyzeRepoStructureFailure({ rootPath: '/repo', framework: 'unknown' }),
      'analyze_repo_structure response unknown framework: unknown',
    );
    assert.equal(
      analyzeRepoStructureFailure({
        rootPath: '/repo',
        framework: 'generic',
        domains: [{ slug: 'domains/app', title: 'App', evidence: {} }],
        capabilities: [],
        elements: [],
        suggestedRelations: [],
        skipped: [],
      }),
      'analyze_repo_structure response missing domains evidence source: domains/app',
    );
    assert.equal(
      inferImportsFailure({ rootPath: '/repo', filesScanned: 1, edges: [{ from: 'a.ts', to: 'b.ts', kind: 'unknown' }], externalImports: [], unresolved: [], moduleEdges: [] }),
      'infer_imports response unknown edge kind: unknown',
    );
    assert.equal(
      inferImportsFailure({ rootPath: '/repo', filesScanned: 1, edges: [], externalImports: [], unresolved: [{ from: 'a.ts', spec: '@/missing', reason: 'unresolved-alias' }], moduleEdges: [] }),
      'infer_imports response unknown unresolved reason at index 0: unresolved-alias',
    );
    assert.equal(
      inferImportsFailure({ rootPath: '/repo', filesScanned: 1, edges: [], externalImports: [], unresolved: [], moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 0 }] }),
      'infer_imports response missing module edge count at index 0',
    );
    assert.equal(
      inferImportsFailure({ rootPath: '/repo', filesScanned: 1, edges: [], externalImports: [], unresolved: [], moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 1 }] }),
      'infer_imports response missing module edge kindCounts at index 0',
    );
    assert.equal(
      inferImportsFailure({ rootPath: '/repo', filesScanned: 1, edges: [], externalImports: [], unresolved: [], moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 2, kindCounts: { static: 1 } }] }),
      'infer_imports response module edge kindCounts mismatch at index 0',
    );
    assert.equal(
      inferImportsFailure({ rootPath: '/repo', filesScanned: 1, edges: [], externalImports: [], unresolved: [], moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 1, kindCounts: { unknown: 1 } }] }),
      'infer_imports response malformed module edge kindCounts at index 0',
    );
  });

  it('accepts clean list_concepts payloads', () => {
    assert.equal(
      listConceptsFailure({
        total: 1,
        vaultRoot: '/tmp/vault',
        nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1 }],
      }),
      null,
    );
    assert.equal(
      listConceptsFailure({
        total: 0,
        vaultRoot: '/tmp/vault',
        nodes: [],
        vaultWarnings: { errorCount: 0, warningCount: 0 },
      }),
      null,
    );
    assert.equal(vaultWarningsFailure({ total: 1 }), null);
  });

  it('fails when list_concepts reports vault warnings', () => {
    assert.equal(
      listConceptsFailure({
        total: 0,
        vaultRoot: '/tmp/vault',
        nodes: [],
        vaultWarnings: { errorCount: 1, warningCount: 2 },
      }),
      'list_concepts vaultWarnings present — errors 1, warnings 2. Run validate_vault for file-level diagnostics before writing.',
    );
  });

  it('fails malformed list_kinds payloads', () => {
    assert.equal(listKindsFailure({ byKind: {} }), 'list_kinds response missing total count');
    assert.equal(listKindsFailure({ total: 0 }), 'list_kinds response missing byKind aggregate');
    assert.equal(listKindsFailure({ total: 1, byKind: { project: -1 } }), 'list_kinds response missing count for kind: project');
    assert.equal(listKindsFailure({ total: 2, byKind: { project: 1 } }), 'list_kinds response total mismatch — total 2, byKind 1');
    assert.equal(listKindsFailure({ total: 1, byKind: { project: 1 } }), null);
  });

  it('fails malformed list_concepts payloads', () => {
    assert.equal(listConceptsFailure({ vaultRoot: '/tmp/vault', nodes: [] }), 'list_concepts response missing total count');
    assert.equal(listConceptsFailure({ total: 0, nodes: [] }), 'list_concepts response missing vaultRoot');
    assert.equal(listConceptsFailure({ total: 0, vaultRoot: '/tmp/vault' }), 'list_concepts response missing nodes array');
    assert.equal(
      listConceptsFailure({ total: 0, vaultRoot: '/tmp/vault', nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1 }] }),
      'list_concepts response node count exceeds total — nodes 1, total 0',
    );
    assert.equal(listConceptsFailure({ total: 1, vaultRoot: '/tmp/vault', nodes: [null] }), 'list_concepts response malformed node at index 0');
    assert.equal(listConceptsFailure({ total: 1, vaultRoot: '/tmp/vault', nodes: [{}] }), 'list_concepts response missing node slug at index 0');
    assert.equal(listConceptsFailure({ total: 1, vaultRoot: '/tmp/vault', nodes: [{ slug: 'project' }] }), 'list_concepts response missing node kind: project');
    assert.equal(listConceptsFailure({ total: 1, vaultRoot: '/tmp/vault', nodes: [{ slug: 'project', kind: 'project' }] }), 'list_concepts response missing node title: project');
    assert.equal(listConceptsFailure({ total: 1, vaultRoot: '/tmp/vault', nodes: [{ slug: 'project', kind: 'project', title: 'Project' }] }), 'list_concepts response missing node mtime: project');
  });

  it('fails malformed project probe payloads', () => {
    assert.equal(
      projectProbeFailure({ total: 0, vaultRoot: '/tmp/vault', nodes: [] }, { byKind: { project: 1 } }),
      'project probe response missing project node',
    );
    assert.equal(projectProbeFailure({ total: 0, vaultRoot: '/tmp/vault', nodes: [] }, { byKind: { project: 0 } }), null);
    assert.equal(projectProbeFailure({ total: 0, vaultRoot: '/tmp/vault', nodes: [] }, { byKind: { domain: 1 } }), null);
    assert.equal(
      projectProbeFailure({ total: 1, nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1 }] }, { byKind: { project: 1 } }),
      'project probe list_concepts response missing vaultRoot',
    );
    assert.equal(
      projectProbeFailure({
        total: 1,
        vaultRoot: '/tmp/vault',
        nodes: [{ slug: 'capabilities/not-project', kind: 'capability', title: 'Wrong', mtime: 1 }],
      }, { byKind: { project: 1 } }),
      'project probe returned non-project node: capabilities/not-project',
    );
    assert.equal(
      projectProbeFailure({
        total: 2,
        vaultRoot: '/tmp/vault',
        nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1 }],
      }, { byKind: { project: 1 } }),
      'project probe count mismatch — list_kinds project 1, probe 2',
    );
    assert.equal(
      projectProbeFailure({
        total: 1,
        vaultRoot: '/tmp/vault',
        nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1 }],
      }, { byKind: { project: 1 } }),
      null,
    );
  });

  it('fails malformed list_concepts vaultWarnings payloads', () => {
    assert.equal(vaultWarningsFailure({ vaultWarnings: [] }), 'list_concepts vaultWarnings malformed');
    assert.equal(
      vaultWarningsFailure({ vaultWarnings: { warningCount: 0 } }),
      'list_concepts vaultWarnings missing errorCount',
    );
    assert.equal(
      vaultWarningsFailure({ vaultWarnings: { errorCount: 0 } }),
      'list_concepts vaultWarnings missing warningCount',
    );
  });

  it('accepts clean validate_vault payloads', () => {
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} } }), null);
  });

  it('fails when validate_vault reports problem files', () => {
    assert.equal(
      validateVaultFailure({
        scanned: 3,
        summary: {
          problemFiles: 2,
          errorFiles: 1,
          warningFiles: 1,
          byCode: {
            'missing-kind': { severity: 'error', count: 1, files: ['a'] },
            'dangling-graph-reference': { severity: 'warning', count: 2, files: ['b'] },
          },
        },
      }),
      'validate_vault found 2 problem files — errors 1, warnings 1 — codes dangling-graph-reference:warning:2, missing-kind:error:1',
    );
  });

  it('fails when validate_vault reports problems without byCode entries', () => {
    assert.equal(
      validateVaultFailure({
        scanned: 3,
        summary: { problemFiles: 1, errorFiles: 1, warningFiles: 0, byCode: {} },
      }),
      'validate_vault response missing byCode entries for problem files',
    );
  });

  it('fails malformed validate_vault payloads', () => {
    assert.equal(validateVaultFailure({ summary: { problemFiles: 0 } }), 'validate_vault response missing scanned count');
    assert.equal(validateVaultFailure({ scanned: -1, summary: { problemFiles: 0 } }), 'validate_vault response missing scanned count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: {} }), 'validate_vault response missing problemFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: -1 } }), 'validate_vault response missing problemFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, warningFiles: 0 } }), 'validate_vault response missing errorFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: -1, warningFiles: 0 } }), 'validate_vault response missing errorFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0 } }), 'validate_vault response missing warningFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: -1 } }), 'validate_vault response missing warningFiles count');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0 } }), 'validate_vault response missing byCode aggregate');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: [] } }), 'validate_vault response missing byCode aggregate');
    assert.equal(
      validateVaultFailure({
        scanned: 1,
        problems: [{ slug: 'broken', issues: [{ code: 'new-code', severity: 'warning', message: 'x' }] }],
        summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} },
      }),
      'validate_vault response unknown issue code at problems[0].issues[0]: new-code',
    );
    assert.equal(
      validateVaultFailure({
        scanned: 1,
        problems: [],
        summary: {
          problemFiles: 0,
          errorFiles: 0,
          warningFiles: 0,
          byCode: { 'new-code': { severity: 'warning', count: 1, files: ['broken'] } },
        },
      }),
      'validate_vault response unknown byCode key: new-code',
    );
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { 'missing-kind': null } } }), 'validate_vault response malformed byCode entry: missing-kind');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { 'missing-kind': { count: 1, files: [] } } } }), 'validate_vault response missing byCode severity: missing-kind');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { 'missing-kind': { severity: 'error', files: [] } } } }), 'validate_vault response missing byCode count: missing-kind');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { 'missing-kind': { severity: 'error', count: 1 } } } }), 'validate_vault response missing byCode files: missing-kind');
    assert.equal(validateVaultFailure({}), 'validate_vault response missing summary');
  });

  it('formats validate_vault byCode summaries by count', () => {
    assert.equal(validationCodeSummary({}), null);
    assert.equal(
      validationCodeSummary({
        b: { severity: 'warning', count: 1, files: [] },
        a: { severity: 'error', count: 3, files: [] },
        c: { severity: 'warning', count: 2, files: [] },
        d: { severity: 'warning', count: 1, files: [] },
      }, 2),
      'a:error:3, c:warning:2, +2 more',
    );
  });

  it('accepts clean compile_ontology summary payloads', () => {
    assert.equal(
      compileSummaryFailure({
        version: 1,
        graphHash: 'abc123',
        maxMtime: 1,
        nodeCount: 1,
        edgeCount: 2,
        resolvedEdgeCount: 1,
        externalEdgeCount: 1,
        unresolvedEdgeCount: 0,
        aliasCount: 1,
        ambiguousAliasCount: 0,
        issueCount: 0,
        canonicalizationActionCount: 0,
        byKind: { project: 1 },
        byDomain: {},
      }),
      null,
    );
  });

  it('fails malformed compile_ontology summary payloads', () => {
    const clean = {
      version: 1,
      graphHash: 'abc123',
      maxMtime: 1,
      nodeCount: 1,
      edgeCount: 2,
      resolvedEdgeCount: 1,
      externalEdgeCount: 1,
      unresolvedEdgeCount: 0,
      aliasCount: 1,
      ambiguousAliasCount: 0,
      issueCount: 0,
      canonicalizationActionCount: 0,
      byKind: { project: 1 },
      byDomain: {},
    };
    assert.equal(compileSummaryFailure({ ...clean, version: 0 }), 'compile_ontology response missing version');
    assert.equal(compileSummaryFailure({ ...clean, graphHash: '' }), 'compile_ontology response missing graphHash');
    assert.equal(compileSummaryFailure({ ...clean, maxMtime: -1 }), 'compile_ontology response missing maxMtime');
    assert.equal(compileSummaryFailure({ ...clean, nodeCount: undefined }), 'compile_ontology response missing nodeCount');
    assert.equal(compileSummaryFailure({ ...clean, byKind: null }), 'compile_ontology response missing byKind aggregate');
    assert.equal(compileSummaryFailure({ ...clean, byDomain: { '': 1 } }), 'compile_ontology response has empty byDomain key');
    assert.equal(compileSummaryFailure({ ...clean, byKind: { project: 2 } }), 'compile_ontology response byKind mismatch — nodeCount 1, byKind 2');
    assert.equal(
      compileSummaryFailure({ ...clean, edgeCount: 2, resolvedEdgeCount: 1, externalEdgeCount: 0, unresolvedEdgeCount: 1 }),
      null,
    );
    assert.equal(
      compileSummaryFailure({ ...clean, edgeCount: 3, resolvedEdgeCount: 1, externalEdgeCount: 1 }),
      'compile_ontology response edge count mismatch — edgeCount 3, resolved+external+unresolved 2',
    );
    assert.equal(
      compileSummaryFailure({ ...clean, edgeCount: 1, resolvedEdgeCount: 1, externalEdgeCount: 1 }),
      'compile_ontology response edge count mismatch — edgeCount 1, resolved+external+unresolved 2',
    );
  });

  it('accepts clean compile_ontology paginated full-artifact payloads', () => {
    assert.equal(
      compileFullArtifactFailure({
        version: 1,
        graphHash: 'abc123',
        maxMtime: 1,
        nodeCount: 1,
        edgeCount: 1,
        resolvedEdgeCount: 1,
        externalEdgeCount: 0,
        unresolvedEdgeCount: 0,
        aliasCount: 1,
        ambiguousAliasCount: 0,
        issueCount: 0,
        canonicalizationActionCount: 0,
        byKind: { project: 1 },
        byDomain: {},
        nodes: [{
          slug: 'project',
          kind: 'project',
          title: 'Project',
          mtime: 1,
          outDegree: 1,
          inDegree: 0,
        }],
        edges: [{
          id: 'project->domains/core:domains:domains/core',
          from: 'project',
          to: 'domains/core',
          via: 'domains',
          ref: 'domains/core',
          resolved: true,
          external: false,
        }],
        nodesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
        edgesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
        aliases: [{ alias: 'project', slug: 'project' }],
        ambiguousAliases: [],
        issues: [],
        canonicalizationActions: [],
        summary: {
          nodes: 1,
          edges: 1,
          graphHash: 'abc123',
          maxMtime: 1,
          resolvedEdges: 1,
          externalEdges: 0,
          unresolvedEdges: 0,
          aliases: 1,
          ambiguousAliases: 0,
          issues: 0,
        },
      }),
      null,
    );
  });

  it('fails malformed compile_ontology paginated full-artifact payloads', () => {
    const clean = {
      version: 1,
      graphHash: 'abc123',
      maxMtime: 1,
      nodeCount: 1,
      edgeCount: 1,
      resolvedEdgeCount: 1,
      externalEdgeCount: 0,
      unresolvedEdgeCount: 0,
      aliasCount: 1,
      ambiguousAliasCount: 1,
      issueCount: 1,
      canonicalizationActionCount: 1,
      byKind: { project: 1 },
      byDomain: {},
      nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1, outDegree: 1, inDegree: 0 }],
      edges: [{ id: 'e', from: 'project', to: 'domains/core', via: 'domains', ref: 'domains/core', resolved: true, external: false }],
      nodesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
      edgesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
      aliases: [{ alias: 'Project', slug: 'project' }],
      ambiguousAliases: [{ alias: 'core', slugs: ['domains/core', 'capabilities/core'] }],
      issues: [{
        code: 'ambiguous-alias',
        severity: 'warning',
        alias: 'core',
        slugs: ['domains/core', 'capabilities/core'],
        message: 'Alias "core" resolves to multiple nodes: domains/core, capabilities/core',
      }],
      canonicalizationActions: [{ slug: 'project', keys: ['domains'], frontmatter: { domains: ['domains/core'] }, expected_mtime: 1 }],
      summary: { nodes: 1, edges: 1, graphHash: 'abc123', maxMtime: 1, resolvedEdges: 1, externalEdges: 0, unresolvedEdges: 0, aliases: 1, ambiguousAliases: 1, issues: 1 },
    };

    assert.equal(compileFullArtifactFailure({ ...clean, nodes: undefined }), 'compile_ontology full response missing nodes array');
    assert.equal(compileFullArtifactFailure({ ...clean, nodesPagination: { ...clean.nodesPagination, returned: 2 } }), 'compile_ontology.nodesPagination returned mismatch — meta 2, array 1');
    assert.equal(compileFullArtifactFailure({ ...clean, nodes: [{ ...clean.nodes[0], outDegree: -1 }] }), 'compile_ontology full response malformed node row');
    assert.equal(compileFullArtifactFailure({ ...clean, edges: [{ ...clean.edges[0], resolved: 'true' }] }), 'compile_ontology full response malformed edge row');
    assert.equal(compileFullArtifactFailure({ ...clean, canonicalizationActions: null }), 'compile_ontology full response missing canonicalizationActions array');
    assert.equal(compileFullArtifactFailure({ ...clean, aliases: [] }), 'compile_ontology full response aliases count mismatch — aliases 0, aliasCount 1');
    assert.equal(compileFullArtifactFailure({ ...clean, summary: { ...clean.summary, aliases: 0 } }), 'compile_ontology full response summary count mismatch — summary aliases/ambiguous/issues 0/1/1, counts 1/1/1');
    assert.equal(compileFullArtifactFailure({ ...clean, summary: { ...clean.summary, nodes: 2 } }), 'compile_ontology full response summary mismatch — summary 2/1, counts 1/1');
  });

  it('accepts clean compile_ontology includeIndexes payloads', () => {
    const edgeId = 'project->domains/core:domains:domains/core';
    assert.equal(
      compileIndexesFailure({
        version: 1,
        graphHash: 'abc123',
        maxMtime: 1,
        nodeCount: 1,
        edgeCount: 1,
        resolvedEdgeCount: 1,
        externalEdgeCount: 0,
        unresolvedEdgeCount: 0,
        aliasCount: 1,
        ambiguousAliasCount: 0,
        issueCount: 0,
        canonicalizationActionCount: 0,
        byKind: { project: 1 },
        byDomain: {},
        nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1, outDegree: 1, inDegree: 0 }],
        edges: [{ id: edgeId, from: 'project', to: 'domains/core', via: 'domains', ref: 'domains/core', resolved: true, external: false }],
        nodesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
        edgesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
        aliases: [{ alias: 'project', slug: 'project' }],
        ambiguousAliases: [],
        issues: [],
        canonicalizationActions: [],
        summary: { nodes: 1, edges: 1, graphHash: 'abc123', maxMtime: 1, resolvedEdges: 1, externalEdges: 0, unresolvedEdges: 0, aliases: 1, ambiguousAliases: 0, issues: 0 },
        indexes: {
          out: { project: [edgeId] },
          in: { 'domains/core': [edgeId] },
          byKind: { project: ['project'] },
          byDomain: {},
          edgeById: {
            [edgeId]: { id: edgeId, from: 'project', to: 'domains/core', via: 'domains', ref: 'domains/core', resolved: true, external: false },
          },
          aliasToSlug: { project: 'project' },
        },
      }),
      null,
    );
  });

  it('fails malformed compile_ontology includeIndexes payloads', () => {
    const edgeId = 'project->domains/core:domains:domains/core';
    const clean = {
      version: 1,
      graphHash: 'abc123',
      maxMtime: 1,
      nodeCount: 1,
      edgeCount: 1,
      resolvedEdgeCount: 1,
      externalEdgeCount: 0,
      unresolvedEdgeCount: 0,
      aliasCount: 1,
      ambiguousAliasCount: 0,
      issueCount: 0,
      canonicalizationActionCount: 0,
      byKind: { project: 1 },
      byDomain: {},
      nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1, outDegree: 1, inDegree: 0 }],
      edges: [{ id: edgeId, from: 'project', to: 'domains/core', via: 'domains', ref: 'domains/core', resolved: true, external: false }],
      nodesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
      edgesPagination: { offset: 0, limit: 1, total: 1, returned: 1, hasMore: false, nextOffset: null },
      aliases: [{ alias: 'project', slug: 'project' }],
      ambiguousAliases: [],
      issues: [],
      canonicalizationActions: [],
      summary: { nodes: 1, edges: 1, graphHash: 'abc123', maxMtime: 1, resolvedEdges: 1, externalEdges: 0, unresolvedEdges: 0, aliases: 1, ambiguousAliases: 0, issues: 0 },
      indexes: {
        out: { project: [edgeId] },
        in: { 'domains/core': [edgeId] },
        byKind: { project: ['project'] },
        byDomain: {},
        edgeById: {
          [edgeId]: { id: edgeId, from: 'project', to: 'domains/core', via: 'domains', ref: 'domains/core', resolved: true, external: false },
        },
        aliasToSlug: { project: 'project' },
      },
    };

    assert.equal(compileIndexesSummary(clean), 'out 1, in 1, edgeById 1, aliases 1, edges 1/0/0');
    assert.equal(compileIndexesFailure({ ...clean, indexes: undefined }), 'compile_ontology indexes response missing indexes');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, out: { project: edgeId } } }), 'compile_ontology.indexes.out malformed row');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, edgeById: {} } }), 'compile_ontology.indexes.edgeById count mismatch — index 0, edgeCount 1');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, aliasToSlug: {} } }), 'compile_ontology.indexes.aliasToSlug count mismatch — index 0, aliasCount 1');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, out: { project: ['missing-edge'] } } }), 'compile_ontology.indexes.out references unknown edge id');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, out: { project: [edgeId, edgeId] } } }), 'compile_ontology.indexes.out count mismatch — index 2, edgeCount 1');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, in: { 'domains/core': [edgeId, edgeId] } } }), 'compile_ontology.indexes.in count mismatch — index 2, resolvedEdgeCount 1');
    assert.equal(compileIndexesFailure({ ...clean, resolvedEdgeCount: 0, unresolvedEdgeCount: 1, indexes: { ...clean.indexes, in: {} } }), 'compile_ontology.indexes.edgeById edge breakdown mismatch — index 1/0/0, counts 0/0/1');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, out: { other: [edgeId] } } }), 'compile_ontology.indexes.out missing edgeById edge');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, in: { other: [edgeId] } } }), 'compile_ontology.indexes.in missing resolved edge');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, byKind: { project: ['missing-node'] } } }), 'compile_ontology.indexes.byKind references unknown node slug');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, aliasToSlug: { project: 'missing-node' } } }), 'compile_ontology.indexes.aliasToSlug references unknown slug: project');
    assert.equal(compileIndexesFailure({ ...clean, indexes: { ...clean.indexes, byKind: { project: ['project', 'project'] } } }), 'compile_ontology.indexes.byKind count mismatch: project');
    assert.equal(compileIndexesFailure({ ...clean, byDomain: { core: 1 } }), 'compile_ontology.indexes.byDomain count mismatch: core');
  });

  it('accepts clean graph-query verify smoke payloads', () => {
    assert.equal(
      overviewFailure({
        operation: 'overview',
        graph: {
          nodes: 1,
          edges: 2,
          resolvedEdges: 1,
          externalEdges: 1,
          unresolvedEdges: 0,
          aliases: 1,
          ambiguousAliases: 0,
          issues: 0,
          graphHash: 'abc123',
          maxMtime: 1,
        },
        byKind: { project: 1 },
        byDomain: {},
        byRelation: {},
        hubs: [],
      }),
      null,
    );
    assert.equal(
      overviewQueryPlanFailure({
        operation: 'query_plan',
        targetOperation: 'overview',
        sideEffect: false,
        normalized: { targetOperation: 'overview', types: null, limit: 100 },
        indexesUsed: ['compiled_artifact'],
        estimate: {
          strategy: 'aggregate_scan',
          nodeScans: 1,
          edgeScans: 2,
          costClass: 'low',
        },
        warnings: [],
      }),
      null,
    );
    assert.equal(
      projectMapQueryPlanFailure({
        operation: 'query_plan',
        targetOperation: 'project_map',
        sideEffect: false,
        normalized: { targetOperation: 'project_map', limit: 100 },
        indexesUsed: ['compiled_artifact'],
        estimate: {
          strategy: 'aggregate_scan',
          nodeScans: 1,
          edgeScans: 2,
          costClass: 'low',
        },
        warnings: [],
      }),
      null,
    );
    assert.equal(
      neighborsFailure({
        operation: 'neighbors',
        center: 'project',
        node: { slug: 'project', kind: 'project', title: 'Project' },
        total: 1,
        limited: false,
        edges: [
          {
            direction: 'outgoing',
            from: 'project',
            to: 'domains/auth',
            via: 'domains',
            resolved: true,
            external: false,
          },
        ],
        nodes: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth' }],
      }, 'project'),
      null,
    );
    assert.equal(
      pathQueryFailure({
        operation: 'path',
        from: 'capabilities/login',
        to: 'project',
        found: true,
        hopCount: 1,
        hops: ['capabilities/login', 'project'],
        nodes: [
          { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
          { slug: 'project', kind: 'project', title: 'Project' },
        ],
        edges: [{ from: 'project', to: 'capabilities/login', via: 'capabilities' }],
      }, 'capabilities/login', 'project'),
      null,
    );
    assert.equal(
      projectScopeFailure({
        operation: 'project_scope',
        project: 'project',
        node: { slug: 'project', kind: 'project', title: 'Project' },
        summary: {
          nodes: 2,
          internalEdges: 1,
          boundaryEdges: 0,
          externalEdges: 0,
          unresolvedEdges: 0,
        },
        byKind: { project: 1, domain: 1 },
        byDomain: {},
        nodes: {
          total: 2,
          limited: false,
          rows: [
            { slug: 'project', kind: 'project', title: 'Project' },
            { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
          ],
        },
        edges: {
          internal: {
            total: 1,
            byRelation: { domains: 1 },
            limited: false,
            edges: [{ from: 'project', to: 'domains/auth', via: 'domains' }],
          },
          boundary: { total: 0, byRelation: {}, limited: false, edges: [] },
          external: { total: 0, byRelation: {}, limited: false, edges: [] },
          unresolved: { total: 0, byRelation: {}, limited: false, edges: [] },
        },
      }, 'project'),
      null,
    );
  });

  it('formats path hop counts for human-facing verify output', () => {
    assert.equal(formatHopCount(0), '0 hops');
    assert.equal(formatHopCount(1), '1 hop');
    assert.equal(formatHopCount(2), '2 hops');
  });

  it('fails malformed graph-query verify smoke payloads', () => {
    const cleanOverview = {
      operation: 'overview',
      graph: {
        nodes: 1,
        edges: 2,
        resolvedEdges: 1,
        externalEdges: 1,
        unresolvedEdges: 0,
        aliases: 1,
        ambiguousAliases: 0,
        issues: 0,
        graphHash: 'abc123',
        maxMtime: 1,
      },
      byKind: { project: 1 },
      hubs: [],
    };
    assert.equal(overviewFailure({ ...cleanOverview, operation: 'health' }), 'overview returned unexpected operation: health');
    assert.equal(overviewFailure({ ...cleanOverview, graph: { ...cleanOverview.graph, graphHash: '' } }), 'overview response missing graphHash');
    assert.equal(
      overviewFailure({ ...cleanOverview, graph: { ...cleanOverview.graph, edges: 3 } }),
      'overview response edge count mismatch — edges 3, resolved+external+unresolved 2',
    );
    assert.equal(
      overviewFailure({ ...cleanOverview, byKind: { project: 2 } }),
      'overview response byKind mismatch — nodes 1, byKind 2',
    );
    assert.equal(overviewFailure({ ...cleanOverview, hubs: null }), 'overview response missing hubs array');

    const cleanPlan = {
      operation: 'query_plan',
      targetOperation: 'overview',
      sideEffect: false,
      normalized: { targetOperation: 'overview', types: null, limit: 100 },
      indexesUsed: ['compiled_artifact'],
      estimate: {
        strategy: 'aggregate_scan',
        nodeScans: 1,
        edgeScans: 2,
        costClass: 'low',
      },
      warnings: [],
    };
    assert.equal(overviewQueryPlanFailure({ ...cleanPlan, targetOperation: 'health' }), 'overview query_plan returned unexpected targetOperation: health');
    assert.equal(overviewQueryPlanFailure({ ...cleanPlan, sideEffect: true }), 'overview query_plan must be side-effect-free');
    assert.equal(overviewQueryPlanFailure({ ...cleanPlan, estimate: { ...cleanPlan.estimate, strategy: 'node_scan' } }), 'overview query_plan missing aggregate_scan estimate');
    assert.equal(overviewQueryPlanFailure({ ...cleanPlan, indexesUsed: [] }), 'overview query_plan missing compiled_artifact index hint');
    assert.equal(overviewQueryPlanFailure({ ...cleanPlan, warnings: null }), 'overview query_plan missing warnings array');
    assert.equal(
      projectMapQueryPlanFailure({
        ...cleanPlan,
        targetOperation: 'overview',
        normalized: { targetOperation: 'overview' },
      }),
      'project_map query_plan returned unexpected targetOperation: overview',
    );
    assert.equal(
      neighborsFailure({ operation: 'path', center: 'project' }, 'project'),
      'neighbors returned unexpected operation: path',
    );
    assert.equal(
      neighborsFailure({
        operation: 'neighbors',
        center: 'other',
        node: { slug: 'other' },
        total: 0,
        limited: false,
        edges: [],
        nodes: [],
      }, 'project'),
      'neighbors center mismatch — expected project, got other',
    );
    assert.equal(
      neighborsFailure({
        operation: 'neighbors',
        center: 'project',
        node: { slug: 'project' },
        total: 2,
        limited: false,
        edges: [{ from: 'project', to: 'domains/auth', via: 'domains', direction: 'outgoing' }],
        nodes: [],
      }, 'project'),
      'neighbors response edge count mismatch — edges 1, total 2',
    );
    assert.equal(pathQueryFailure({ operation: 'neighbors' }, 'project'), 'path returned unexpected operation: neighbors');
    assert.equal(
      pathQueryFailure({
        operation: 'path',
        from: 'project',
        to: 'project',
        found: true,
        hopCount: 1,
        hops: ['project'],
        nodes: [{ slug: 'project', kind: 'project', title: 'Project' }],
        edges: [],
      }, 'project'),
      'path response hop count mismatch',
    );
    assert.equal(
      pathQueryFailure({
        operation: 'path',
        from: 'capabilities/login',
        to: 'project',
        found: true,
        hopCount: 1,
        hops: ['capabilities/login', 'project'],
        nodes: [
          { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
          { slug: 'project', kind: 'project', title: 'Project' },
        ],
        edges: [{ from: 'domains/auth', to: 'project', via: 'domains' }],
      }, 'capabilities/login', 'project'),
      'path response edge/hop mismatch at edge 0',
    );
    assert.equal(
      pathQueryFailure({
        operation: 'path',
        from: 'capabilities/login',
        to: 'project',
        found: true,
        hopCount: 1,
        hops: ['capabilities/login', 'project'],
        nodes: [
          { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
          { slug: 'project', kind: 'project', title: 'Project' },
        ],
        edges: [{
          from: 'project',
          to: 'capabilities/login',
          via: 'capabilities',
          traversedFrom: 'project',
          traversedTo: 'capabilities/login',
        }],
      }, 'capabilities/login', 'project'),
      'path response traversal mismatch at edge 0',
    );
    assert.equal(
      pathQueryFailure({
        operation: 'path',
        from: 'capabilities/login',
        to: 'project',
        found: true,
        hopCount: 1,
        hops: ['capabilities/login', 'project'],
        nodes: [{ slug: 'capabilities/login', kind: 'capability', title: 'Login' }],
        edges: [{ from: 'project', to: 'capabilities/login', via: 'capabilities' }],
      }, 'capabilities/login', 'project'),
      'path response node count mismatch',
    );
    assert.equal(
      pathQueryFailure({
        operation: 'path',
        from: 'capabilities/login',
        to: 'project',
        found: true,
        hopCount: 1,
        hops: ['capabilities/login', 'project'],
        nodes: [
          { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
          { slug: 'domains/wrong', kind: 'project', title: 'Project' },
        ],
        edges: [{ from: 'project', to: 'capabilities/login', via: 'capabilities' }],
      }, 'capabilities/login', 'project'),
      'path response node/hop mismatch at index 1',
    );
    assert.equal(projectScopeFailure({ operation: 'project_map' }, 'project'), 'project_scope returned unexpected operation: project_map');
    assert.equal(
      projectScopeFailure({
        operation: 'project_scope',
        project: 'project',
        node: { slug: 'project' },
        summary: {
          nodes: 2,
          internalEdges: 1,
          boundaryEdges: 0,
          externalEdges: 0,
          unresolvedEdges: 0,
        },
        byKind: { project: 1 },
        byDomain: {},
        nodes: { total: 2, limited: false, rows: [] },
        edges: {
          internal: { total: 1, limited: false, edges: [] },
          boundary: { total: 0, limited: false, edges: [] },
          external: { total: 0, limited: false, edges: [] },
          unresolved: { total: 0, limited: false, edges: [] },
        },
      }, 'project'),
      'project_scope node count mismatch — rows 0, total 2',
    );
  });

  it('fails when verify read surfaces disagree on node counts', () => {
    const list = {
      total: 1,
      vaultRoot: '/tmp/vault',
      nodes: [{ slug: 'project', kind: 'project', title: 'Project', mtime: 1 }],
    };
    const validation = {
      scanned: 1,
      summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} },
    };
    const compiled = {
      version: 1,
      graphHash: 'abc123',
      maxMtime: 1,
      nodeCount: 1,
      edgeCount: 2,
      resolvedEdgeCount: 1,
      externalEdgeCount: 1,
      unresolvedEdgeCount: 0,
      aliasCount: 1,
      ambiguousAliasCount: 0,
      issueCount: 0,
      canonicalizationActionCount: 0,
      byKind: { project: 1 },
      byDomain: {},
    };
    const kinds = { total: 1, byKind: { project: 1 } };
    const overview = {
      operation: 'overview',
      graph: {
        nodes: 1,
        edges: 2,
        resolvedEdges: 1,
        externalEdges: 1,
        unresolvedEdges: 0,
        aliases: 1,
        ambiguousAliases: 0,
        issues: 0,
        graphHash: 'abc123',
        maxMtime: 1,
      },
      byKind: { project: 1 },
      byRelation: {},
      hubs: [],
    };

    assert.equal(verifyCountConsistencyFailure({ kinds, list, validation, compiled, overview }), null);
    assert.equal(
      verifyCountConsistencyFailure({ kinds: { total: 2, byKind: { project: 2 } }, list, validation, compiled }),
      'verify count mismatch — list_kinds.total 2, list_concepts.total 1',
    );
    assert.equal(verifyCountConsistencyFailure({ kinds, list, validation: { ...validation, scanned: 2 }, compiled }), null);
    assert.equal(
      verifyCountConsistencyFailure({ kinds, list, validation, compiled: { ...compiled, nodeCount: 2, byKind: { project: 2 } } }),
      'verify count mismatch — list_kinds.total 1, compile_ontology.nodeCount 2',
    );
    assert.equal(
      verifyCountConsistencyFailure({
        kinds,
        list,
        validation,
        compiled,
        overview: { ...overview, graph: { ...overview.graph, nodes: 2 }, byKind: { project: 2 } },
      }),
      'verify count mismatch — list_kinds.total 1, overview.graph.nodes 2',
    );
    assert.equal(
      verifyCountConsistencyFailure({
        kinds: { total: 1, byKind: { capability: 1 } },
        list,
        validation,
        compiled,
      }),
      'verify byKind mismatch — capability: list_kinds 1, compile_ontology 0',
    );
    assert.equal(
      verifyCountConsistencyFailure({
        kinds: { total: 1, byKind: { capability: 1 } },
        list,
        validation,
        compiled: { ...compiled, byKind: { capability: 1 } },
        overview,
      }),
      'verify byKind mismatch — capability: list_kinds 1, overview 0',
    );
  });

  it('summarizes verify read census consistency for human-facing output', () => {
    assert.equal(
      verifyCountConsistencySummary({
        kinds: { total: 2, byKind: { project: 1, capability: 1 } },
        list: { total: 2 },
        compiled: { nodeCount: 2, byKind: { project: 1, capability: 1 } },
        overview: { graph: { nodes: 2 }, byKind: { project: 1, capability: 1 } },
      }),
      '2 nodes across list_kinds/list_concepts/compile_ontology/overview, 2 kinds',
    );
    assert.equal(
      verifyCountConsistencySummary({
        kinds: { total: 1, byKind: { project: 1 } },
      }),
      '1 node across list_kinds, 1 kind',
    );
    assert.equal(verifyCountConsistencySummary({}), null);
  });

  it('skips verify count comparison when a source payload is malformed', () => {
    const validation = {
      scanned: 1,
      summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: {} },
    };
    const compiled = {
      version: 1,
      graphHash: 'abc123',
      maxMtime: 1,
      nodeCount: 1,
      edgeCount: 2,
      resolvedEdgeCount: 1,
      externalEdgeCount: 1,
      unresolvedEdgeCount: 0,
      aliasCount: 1,
      ambiguousAliasCount: 0,
      issueCount: 0,
      canonicalizationActionCount: 0,
      byKind: { project: 1 },
      byDomain: {},
    };

    assert.equal(
      verifyCountConsistencyFailure({
        list: { total: 2, nodes: [] },
        validation,
        compiled,
      }),
      null,
    );
  });

  it('accepts healthy first-contact diagnosis responses', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        { operation: 'health', status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass' }] },
        'health',
      ),
      null,
    );
  });

  it('builds tuned workspace brief first-contact smoke arguments', () => {
    const tunedBrief = buildFirstContactRequests().find((request) => request.id === 21);
    assert.deepEqual(tunedBrief?.params?.arguments, {
      operation: 'workspace_brief',
      limit: 3,
      ...VERIFY_TUNED_HEALTH_ARGS,
      nodeLimit: VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
    });
    const tunedHealth = buildFirstContactRequests().find((request) => request.id === 20);
    assert.deepEqual(tunedHealth?.params?.arguments, {
      operation: 'health',
      ...VERIFY_TUNED_HEALTH_ARGS,
    });
  });

  it('accepts advisory needs_attention diagnosis responses', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'needs_attention',
          checks: [{ id: 'relation_recommendations', status: 'warn' }],
        },
        'health',
      ),
      null,
    );
  });

  it('reads health issue count from the current health summary shape', () => {
    assert.equal(diagnosisIssueCount({ summary: { issues: 3 } }), 3);
    assert.equal(diagnosisIssueCount({ summary: { compileIssues: 2 } }), 2);
    assert.equal(diagnosisIssueCount({ summary: {} }), 0);
  });

  it('formats health summary for verify output', () => {
    assert.equal(
      healthSummary({
        summary: { issues: 2, unresolvedEdges: 3, dependencyCycles: 1 },
        checks: [{ id: 'compile_issues' }, { id: 'components' }],
      }),
      'issues:2, unresolved:3, cycles:1, 2 checks',
    );
    assert.equal(healthSummary({ summary: { compileIssues: 4 }, checks: [] }), 'issues:4, unresolved:0, cycles:0, 0 checks');
  });

  it('formats health check coverage for verify output', () => {
    assert.equal(healthChecksSummary(null), null);
    assert.equal(healthChecksSummary([]), null);
    assert.equal(
      healthChecksSummary([
        { id: 'compile_issues', status: 'pass', count: 0 },
        { id: 'unresolved_edges', status: 'pass', count: 0 },
        { id: 'dependency_cycles', status: 'warn', count: 2 },
      ]),
      'compile_issues:pass:0, unresolved_edges:pass:0, dependency_cycles:warn:2',
    );
    assert.equal(
      healthChecksSummary([
        { id: 'a', status: 'pass', count: 0 },
        { id: 'b', status: 'pass' },
        { id: 'c', status: 'pass', count: 1 },
      ], 2),
      'a:pass:0, b:pass, +1 more',
    );
  });

  it('formats non-blocking health check advisories for verify output', () => {
    assert.equal(advisoryHealthChecksSummary(null), null);
    assert.equal(advisoryHealthChecksSummary([]), null);
    assert.equal(
      advisoryHealthChecksSummary([
        { id: 'compile_issues', status: 'pass', count: 0 },
        {
          id: 'components',
          status: 'info',
          count: 6,
          message: 'The scoped ontology graph has disconnected actionable islands.',
        },
        { id: 'relation_recommendations', status: 'warn', count: 2 },
        { id: 'dependency_cycles', status: 'fail', count: 1 },
      ]),
      'components:info:6 - The scoped ontology graph has disconnected actionable islands., relation_recommendations:warn:2',
    );
    assert.equal(
      advisoryHealthChecksSummary([
        { id: 'a', status: 'info' },
        { id: 'b', status: 'warn' },
        { id: 'c', status: 'info' },
      ], 2),
      'a:info, b:warn, +1 more',
    );
  });

  it('formats tuned health scope for verify output', () => {
    assert.deepEqual(VERIFY_TUNED_HEALTH_ARGS.componentTypes, ['domains', 'domain', 'capabilities', 'dependencies']);
    assert.equal(
      tunedHealthScopeOutputSummary(),
      'dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies',
    );
    assert.equal(
      tunedWorkspaceBriefScopeOutputSummary(),
      'dependencyTypes=dependencies; componentTypes=domains/domain/capabilities/dependencies; nodeLimit=3',
    );
    assert.equal(
      tunedHealthScopeOutputSummary({ dependencyTypes: [], componentTypes: null }),
      'dependencyTypes=all; componentTypes=all',
    );
    assert.equal(
      tunedWorkspaceBriefScopeOutputSummary({ dependencyTypes: [], componentTypes: null }, 1),
      'dependencyTypes=all; componentTypes=all; nodeLimit=1',
    );
  });

  it('fails missing or mismatched structuredContent in verify smoke responses', () => {
    const parsed = { operation: 'overview', graph: { nodes: 1 } };
    assert.equal(
      structuredContentFailure({ result: {} }, parsed, 'overview'),
      'overview structuredContent missing',
    );
    assert.equal(
      structuredContentFailure({ result: { structuredContent: null } }, parsed, 'overview'),
      'overview structuredContent missing',
    );
    assert.equal(
      structuredContentFailure({ result: { structuredContent: { operation: 'overview', graph: { nodes: 2 } } } }, parsed, 'overview'),
      'overview structuredContent mismatch — $.graph.nodes: parsed 1, structuredContent 2',
    );
    assert.equal(
      structuredContentFailure({ result: { structuredContent: { graph: { nodes: 1 }, operation: 'overview' } } }, parsed, 'overview'),
      null,
    );
    assert.equal(
      structuredContentFailure({ result: { structuredContent: parsed } }, parsed, 'overview'),
      null,
    );
    assert.equal(structuredContentParityStatus(parsed, undefined), 'missing');
    assert.equal(structuredContentParityStatus(parsed, { operation: 'overview', graph: { nodes: 2 } }), 'mismatch');
    assert.equal(structuredContentParityStatus(parsed, { graph: { nodes: 1 }, operation: 'overview' }), 'pass');
  });

  it('summarizes structuredContent coverage for verify output', () => {
    assert.equal(
      structuredContentVerifySummary(),
      'direct 11/11, write 2/2 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 0/0), maintenance 2/2, graph 7/7',
    );
    assert.equal(
      structuredContentVerifySummary({ hasNode: true }),
      'direct 11/11, write 2/2 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 0/0), maintenance 2/2, graph 9/9',
    );
    assert.equal(
      structuredContentVerifySummary({ hasCompileIndexes: true }),
      'direct 11/11, write 2/2 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 0/0), maintenance 2/2, graph 8/8',
    );
    assert.equal(
      structuredContentVerifySummary({ hasMaintenanceResumeSkipped: true }),
      'direct 11/11, write 2/2 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 0/0), maintenance 2/2 (resume skipped: no actions), graph 7/7',
    );
    assert.equal(
      structuredContentVerifySummary({
        hasNode: true,
        hasProject: true,
        hasGetConcept: true,
        hasFindBacklinks: true,
        hasDirectGraphReads: true,
        hasLimitedQueryConcepts: true,
        hasCompileIndexes: true,
        destructiveDryRunCount: 3,
      }),
      'direct 16/16, write 5/5 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 3/3), maintenance 2/2, graph 11/11',
    );
    assert.equal(
      structuredContentVerifySummary({
        hasNode: true,
        hasProject: true,
        hasGetConcept: true,
        hasFindBacklinks: true,
        hasDirectGraphReads: true,
        hasLimitedQueryConcepts: true,
        hasCompileIndexes: true,
        hasMaintenanceResume: true,
        destructiveDryRunCount: 3,
      }),
      'direct 16/16, write 5/5 (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run 3/3), maintenance 3/3, graph 11/11',
    );
  });

  it('summarizes the first structuredContent mismatch path', () => {
    assert.equal(
      structuredContentMismatchSummary(
        { rows: [{ slug: 'capabilities/mcp-server', total: 2 }] },
        { rows: [{ slug: 'capabilities/mcp-server', total: 3 }] },
      ),
      '$.rows[0].total: parsed 2, structuredContent 3',
    );
    assert.equal(
      structuredContentMismatchSummary({ total: 1 }, { total: 1, extra: true }),
      '$.extra: parsed undefined, structuredContent true',
    );
    assert.equal(
      structuredContentMismatchSummary(
        { slug: 'capabilities/mcp-server', kind: 'capability' },
        { kind: 'capability', slug: 'capabilities/other' },
      ),
      '$.slug: parsed "capabilities/mcp-server", structuredContent "capabilities/other"',
    );
  });

  it('formats non-blocking workspace brief next actions for verify output', () => {
    assert.equal(advisoryNextActionsSummary(null), null);
    assert.equal(
      advisoryNextActionsSummary([
        { id: 'compile_issues', kind: 'health_check', severity: 'warn', count: 2, message: 'Inspect compile issues.' },
        { id: 'add_missing_relations', kind: 'add_missing_relations', severity: 'warn', count: 3 },
        { id: 'materialize_external_elements', kind: 'materialize_external_elements', severity: 'info' },
        { id: 'resolve_dangling_references', kind: 'resolve_dangling_references', severity: 'fail' },
      ]),
      'compile_issues/health_check:warn:2 - Inspect compile issues., add_missing_relations:warn:3, materialize_external_elements:info',
    );
    assert.equal(
      advisoryNextActionsSummary([
        { id: 'a', kind: 'health_check', severity: 'info' },
        { id: 'b', kind: 'b', severity: 'warn' },
        { id: 'c', kind: 'c', severity: 'info' },
        { id: 'd', kind: 'd', severity: 'warn' },
      ], 2),
      'a/health_check:info, b:warn, +2 more',
    );
  });

  it('formats workspace brief counts for human-facing verify output', () => {
    assert.equal(
      workspaceBriefSummary({
        summary: { nodes: 1 },
        growth: { totalActions: 4, externalElementRefs: 2, externalElementRefsIgnored: 7 },
        nextActions: [{ id: 'cleanup', severity: 'warn' }],
        health: { checks: [{ id: 'compile_issues', status: 'warn' }, { id: 'components', status: 'pass' }] },
      }),
      '1 node, 1 next action, 2 health checks, growth actions:4 external:2 ignoredExternal:7',
    );
    assert.equal(workspaceBriefSummary({ summary: { nodes: 0 }, nextActions: [], health: { checks: [] } }), '0 nodes, 0 next actions, 0 health checks');
  });

  it('fails unexpected diagnosis operations', () => {
    assert.equal(
      diagnosisBlockingFailure('health', { operation: 'workspace_brief', status: 'healthy' }, 'health'),
      'health returned unexpected operation: workspace_brief',
    );
  });

  it('fails diagnosis responses with failing health checks', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          nextActions: [],
          health: { checks: [{ id: 'dependency_cycles', status: 'fail', count: 1 }] },
        },
        'workspace_brief',
      ),
      'workspace_brief has failing health checks: dependency_cycles:fail:1. Inspect query_ontology({operation:"health"}) before writing.',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief_tuned',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          nextActions: [],
          health: { checks: [{ id: 'components', status: 'fail', count: 6 }] },
        },
        'workspace_brief',
      ),
      'workspace_brief_tuned has failing health checks: components:fail:6. Inspect query_ontology({operation:"health"}) before writing.',
    );
  });

  it('fails malformed diagnosis responses instead of treating them as clean', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          health: { checks: [] },
          nextActions: [],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed status',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'ok',
          health: { checks: [] },
          nextActions: [],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed status',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
        },
        'workspace_brief',
      ),
      'workspace_brief response missing nextActions array',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          nextActions: [],
        },
        'workspace_brief',
      ),
      'workspace_brief response missing health checks',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ severity: 'warn' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response missing nextAction identifier at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ id: 'health_check', severity: 'warn' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response missing nextAction identifier at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ id: 'health_check', kind: 'health_check' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response missing nextAction severity at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ id: '', kind: '', severity: 'warn' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response missing nextAction identifier at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ kind: '  ', severity: 'warn' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response missing nextAction identifier at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ id: 'health_check', kind: 'health_check', severity: '' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response missing nextAction severity at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ id: 'health_check', kind: 'health_check', severity: 'fatal' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response unknown nextAction severity at index 0: fatal',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ id: 'health_check', kind: 'health_check', severity: 'warn', count: -1 }],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed nextAction count at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ id: 'health_check', kind: 'health_check', severity: 'warn', count: 1.5 }],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed nextAction count at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
        },
        'health',
      ),
      'health response missing health checks',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ id: 'compile_issues' }],
        },
        'health',
      ),
      'health response missing health check status at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ id: 'compile_issues', status: 'warning' }],
        },
        'health',
      ),
      'health response unknown health check status at index 0: warning',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ status: 'pass' }],
        },
        'health',
      ),
      'health response missing health check id at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ id: '', status: 'pass' }],
        },
        'health',
      ),
      'health response missing health check id at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ id: '  ', status: 'pass' }],
        },
        'health',
      ),
      'health response missing health check id at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ id: 'compile_issues', status: '' }],
        },
        'health',
      ),
      'health response missing health check status at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ id: 'compile_issues', status: 'pass', count: -1 }],
        },
        'health',
      ),
      'health response malformed health check count at index 0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'health',
        {
          operation: 'health',
          status: 'healthy',
          checks: [{ id: 'compile_issues', status: 'pass', count: 1.5 }],
        },
        'health',
      ),
      'health response malformed health check count at index 0',
    );
  });

  it('accepts workspace_brief responses with warn next actions', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          summary: { growthActions: 2 },
          growth: {
            relationRecommendations: 2,
            externalElementRefs: 0,
            danglingReferences: 0,
            totalActions: 2,
          },
          health: { checks: [] },
          nextActions: [
            { kind: 'health_check', severity: 'warn', id: 'compile_issues' },
            {
              id: 'add_missing_relations',
              kind: 'add_missing_relations',
              severity: 'warn',
              count: 2,
              sample: [
                { tool: 'add_relation', args: { from: 'capabilities/auth', to: 'domains/auth', type: 'domain' } },
              ],
            },
          ],
        },
        'workspace_brief',
      ),
      null,
    );
  });

  it('fails workspace_brief growth count drift', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          summary: { growthActions: 2 },
          growth: {
            relationRecommendations: 0,
            externalElementRefs: 0,
            danglingReferences: 0,
            totalActions: 1,
          },
          health: { checks: [] },
          nextActions: [],
        },
        'workspace_brief',
      ),
      'workspace_brief growthActions mismatch',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          summary: { growthActions: 2 },
          growth: {
            relationRecommendations: 2,
            externalElementRefs: 0,
            danglingReferences: 0,
            totalActions: 2,
          },
          health: { checks: [] },
          nextActions: [{ id: 'add_missing_relations', kind: 'add_missing_relations', severity: 'warn', count: 1 }],
        },
        'workspace_brief',
      ),
      'workspace_brief add_missing_relations count mismatch',
    );
  });

  it('fails workspace_brief next action sample drift', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          summary: { growthActions: 1 },
          growth: {
            relationRecommendations: 1,
            externalElementRefs: 0,
            danglingReferences: 0,
            totalActions: 1,
          },
          health: { checks: [] },
          nextActions: [
            {
              id: 'add_missing_relations',
              kind: 'add_missing_relations',
              severity: 'warn',
              count: 1,
              sample: [{ tool: 'patch_concept', args: { from: 'capabilities/auth', to: 'domains/auth', type: 'domain' } }],
            },
          ],
        },
        'workspace_brief',
      ),
      'workspace_brief response nextAction add_missing_relations sample tool mismatch at index 0.0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          summary: { growthActions: 1 },
          growth: {
            relationRecommendations: 0,
            externalElementRefs: 1,
            danglingReferences: 0,
            totalActions: 1,
          },
          health: { checks: [] },
          nextActions: [
            {
              id: 'materialize_external_elements',
              kind: 'materialize_external_elements',
              severity: 'info',
              count: 1,
              sample: [{ tool: 'add_concept', args: { slug: 'src/auth.ts', kind: 'capability' } }],
            },
          ],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed materialize_external_elements sample args at index 0.0',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          summary: { growthActions: 1 },
          growth: {
            relationRecommendations: 0,
            externalElementRefs: 0,
            danglingReferences: 1,
            totalActions: 1,
          },
          health: { checks: [] },
          nextActions: [
            {
              id: 'resolve_dangling_references',
              kind: 'resolve_dangling_references',
              severity: 'info',
              count: 1,
              sample: [{ kind: 'materialize_external_element', score: 0.7, reason: 'Resolve dangling reference.' }],
            },
          ],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed resolve_dangling_references sample kind at index 0.0',
    );
  });

  it('fails workspace_brief responses with fail next actions', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [
            { kind: 'health_check', severity: 'info', id: 'components' },
            { id: 'resolve_dangling_references', kind: 'resolve_dangling_references', severity: 'fail', count: 1 },
          ],
        },
        'workspace_brief',
      ),
      'workspace_brief has actionable nextActions: resolve_dangling_references:fail:1. Inspect workspace_brief.nextActions before writing.',
    );
  });
});
