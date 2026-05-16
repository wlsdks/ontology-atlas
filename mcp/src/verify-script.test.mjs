import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
} from './ontology-engine.mjs';
import {
  advisoryNextActionsSummary,
  buildFirstContactRequests,
  buildGetConceptsSmokeSlugs,
  buildGraphQuerySmokeArgs,
  buildGraphQuerySmokeRequests,
  compileSummaryFailure,
  diagnosisBlockingFailure,
  diagnosisIssueCount,
  EXPECTED_READ_TOOLS,
  EXPECTED_TOOLS,
  EXPECTED_WRITE_TOOLS,
  FIRST_CONTACT_RESPONSE_LABELS,
  expectedToolSplitLabel,
  firstContactMissingResponseLabels,
  firstContactErrorFailure,
  findOrphansFailure,
  formatCount,
  formatHopCount,
  getConceptsFailure,
  hasAllFirstContactResponses,
  hasFirstContactErrorResponse,
  healthChecksSummary,
  initializeInstructionsFailure,
  listConceptsFailure,
  listKindsFailure,
  maintenanceFilterEnumSummary,
  maintenanceMissingCursorFailure,
  maintenanceReadyCursorFailure,
  overviewFailure,
  overviewQueryPlanFailure,
  parseVerifyArgs,
  parseVerifyTimeoutMs,
  resolveVerifyVault,
  neighborsFailure,
  pathQueryFailure,
  projectProbeFailure,
  projectMapQueryPlanFailure,
  projectScopeFailure,
  serverStartupFailure,
  strictArgsFailure,
  strictEnumFailure,
  strictMaintenanceFilterFailure,
  toolsListSchemaFailure,
  validationCodeSummary,
  validateVaultFailure,
  verifyCountConsistencyFailure,
  verifyTimeoutFailure,
  verifyUsage,
  vaultWarningsFailure,
  workspaceBriefSummary,
} from '../scripts/verify.mjs';
import { expectedResponseIds, missingResponseLabels } from '../scripts/json-rpc-lines.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

describe('verify.mjs first-contact gates', () => {
  it('keeps package metadata tool count aligned with verify inventory', () => {
    const described = MCP_PKG.description.match(/(\d+) tools \((\d+) read \+ (\d+) write\)/);
    assert.ok(described, 'package description must include tool count and read/write split');
    assert.equal(described[1], String(EXPECTED_TOOLS.length));
    assert.equal(described[2], String(EXPECTED_READ_TOOLS.length));
    assert.equal(described[3], String(EXPECTED_WRITE_TOOLS.length));
    assert.equal(expectedToolSplitLabel(), `${described[2]} read + ${described[3]} write`);
  });

  it('formats row counts for human-facing verify output', () => {
    assert.equal(formatCount(0, 'partial row'), '0 partial rows');
    assert.equal(formatCount(1, 'partial row'), '1 partial row');
    assert.equal(formatCount(2, 'ok row'), '2 ok rows');
  });

  it('fails tools/list schema drift for strict arguments, graph-query enums, batch caps, and write safety', () => {
    const tools = [
      {
        name: 'list_concepts',
        inputSchema: { additionalProperties: false, properties: {} },
      },
      {
        name: 'get_concepts',
        inputSchema: {
          additionalProperties: false,
          required: ['slugs'],
          properties: { slugs: { type: 'array', maxItems: 50 } },
        },
      },
      {
        name: 'find_orphans',
        inputSchema: {
          additionalProperties: false,
          properties: {
            excludeKinds: {
              type: 'array',
              items: { type: 'string' },
              description: "Defaults to ['project', 'vault-readme']. Pass [] to include every kind.",
            },
          },
        },
      },
      {
        name: 'add_concepts',
        inputSchema: {
          additionalProperties: false,
          required: ['concepts'],
          properties: { concepts: { type: 'array', maxItems: 50 } },
        },
      },
      {
        name: 'add_relations',
        inputSchema: {
          additionalProperties: false,
          required: ['relations'],
          properties: {
            relations: {
              type: 'array',
              maxItems: 50,
              items: {
                properties: {
                  expected_mtime: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
      },
      {
        name: 'add_relation',
        inputSchema: {
          additionalProperties: false,
          properties: { expected_mtime: { type: 'number', minimum: 0 } },
        },
      },
      {
        name: 'patch_concept',
        inputSchema: {
          additionalProperties: false,
          properties: { expected_mtime: { type: 'number', minimum: 0 } },
        },
      },
      {
        name: 'rename_concept',
        inputSchema: {
          additionalProperties: false,
          properties: {
            confirm: { type: 'boolean' },
            overwrite: { type: 'boolean' },
            expected_mtime: { type: 'number', minimum: 0 },
          },
        },
      },
      {
        name: 'merge_concepts',
        inputSchema: {
          additionalProperties: false,
          properties: {
            confirm: { type: 'boolean' },
            expected_mtime: { type: 'number', minimum: 0 },
          },
        },
      },
      {
        name: 'delete_concept',
        inputSchema: {
          additionalProperties: false,
          properties: {
            confirm: { type: 'boolean' },
            force: { type: 'boolean' },
            expected_mtime: { type: 'number', minimum: 0 },
          },
        },
      },
      {
        name: 'query_ontology',
        inputSchema: {
          additionalProperties: false,
          required: ['operation'],
          properties: {
            operation: { enum: QUERY_ONTOLOGY_OPERATIONS },
            targetOperation: { enum: QUERY_PLAN_TARGET_OPERATIONS },
            phases: { items: { enum: MAINTENANCE_PHASE_VALUES } },
            severities: { items: { enum: MAINTENANCE_SEVERITY_VALUES } },
            kinds: {
              items: {
                enum: MAINTENANCE_KIND_VALUES,
              },
            },
          },
        },
      },
    ];
    const withQueryTool = (queryTool) => [
      ...tools.slice(0, 10),
      queryTool,
    ];

    assert.equal(toolsListSchemaFailure(tools), null);
    assert.equal(toolsListSchemaFailure(null), 'tools/list response missing tools array');
    assert.equal(
      toolsListSchemaFailure([{ name: 'list_concepts', inputSchema: { properties: {} } }]),
      'tools/list schema missing additionalProperties:false: list_concepts',
    );
    assert.equal(
      toolsListSchemaFailure(tools.filter((tool) => tool.name !== 'query_ontology')),
      'tools/list response missing query_ontology tool',
    );
    assert.equal(
      toolsListSchemaFailure(tools.filter((tool) => tool.name !== 'find_orphans')),
      'tools/list response missing find_orphans tool',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.slice(0, 2),
        {
          ...tools[2],
          inputSchema: {
            ...tools[2].inputSchema,
            properties: {
              excludeKinds: {
                type: 'array',
                items: { type: 'number' },
                description: "Defaults to ['project', 'vault-readme'].",
              },
            },
          },
        },
        ...tools.slice(3),
      ]),
      'find_orphans.excludeKinds schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.slice(0, 2),
        {
          ...tools[2],
          inputSchema: {
            ...tools[2].inputSchema,
            properties: {
              excludeKinds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Pass [] to include every kind.',
              },
            },
          },
        },
        ...tools.slice(3),
      ]),
      'find_orphans.excludeKinds default description drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...tools[10],
          inputSchema: {
            ...tools[10].inputSchema,
            required: [],
          },
        },
      )),
      'query_ontology required schema drift',
    );
    assert.equal(
      toolsListSchemaFailure(withQueryTool(
        {
          ...tools[10],
          inputSchema: {
            ...tools[10].inputSchema,
            properties: {
              ...tools[10].inputSchema.properties,
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
          ...tools[10],
          inputSchema: {
            ...tools[10].inputSchema,
            properties: {
              ...tools[10].inputSchema.properties,
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
          ...tools[10],
          inputSchema: {
            ...tools[10].inputSchema,
            properties: {
              ...tools[10].inputSchema.properties,
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
          ...tools[10],
          inputSchema: {
            ...tools[10].inputSchema,
            properties: {
              ...tools[10].inputSchema.properties,
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
          ...tools[10],
          inputSchema: {
            ...tools[10].inputSchema,
            properties: {
              ...tools[10].inputSchema.properties,
              kinds: { items: { enum: ['add_missing_relation'] } },
            },
          },
        },
      )),
      'query_ontology maintenance kinds enum schema drift',
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
        ...tools.slice(0, 3),
        {
          ...tools[3],
          inputSchema: {
            ...tools[3].inputSchema,
            properties: { concepts: { type: 'array', maxItems: 51 } },
          },
        },
        ...tools.slice(4),
      ]),
      'add_concepts.concepts batch cap schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.slice(0, 5),
        {
          ...tools[5],
          inputSchema: {
            ...tools[5].inputSchema,
            properties: { expected_mtime: { type: 'number' } },
          },
        },
        ...tools.slice(6),
      ]),
      'add_relation.expected_mtime conflict guard schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.slice(0, 7),
        {
          ...tools[7],
          inputSchema: {
            ...tools[7].inputSchema,
            properties: {
              ...tools[7].inputSchema.properties,
              overwrite: { type: 'string' },
            },
          },
        },
        ...tools.slice(8),
      ]),
      'rename_concept.overwrite destructive safety schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.slice(0, 9),
        {
          ...tools[9],
          inputSchema: {
            ...tools[9].inputSchema,
            properties: {
              ...tools[9].inputSchema.properties,
              confirm: { type: 'string' },
            },
          },
        },
        tools[10],
      ]),
      'delete_concept.confirm dry-run safety schema drift',
    );
    assert.equal(
      toolsListSchemaFailure([
        ...tools.slice(0, 9),
        {
          ...tools[9],
          inputSchema: {
            ...tools[9].inputSchema,
            properties: {
              ...tools[9].inputSchema.properties,
              force: { type: 'string' },
            },
          },
        },
        tools[10],
      ]),
      'delete_concept.force destructive safety schema drift',
    );
  });

  it('parses verify timeout env as a strict positive integer', () => {
    assert.equal(parseVerifyTimeoutMs(undefined), 8000);
    assert.equal(parseVerifyTimeoutMs(''), 8000);
    assert.equal(parseVerifyTimeoutMs('15000'), 15000);
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
    assert.deepEqual(
      parseVerifyArgs({ env: { OMOT_VAULT: '   ' }, argv: ['node', 'verify.mjs', '--help'], cwd: '/tmp/cwd', isMain: true }),
      { error: null, help: true, timeoutMsRaw: undefined, vault: '/tmp/cwd' },
    );
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--timeout-ms'], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault'], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '   '], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault', '   '], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--vault= --bad'], cwd: '/tmp/cwd', isMain: true }).error, /requires/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '/one', '--vault', '/two'], cwd: '/tmp/cwd', isMain: true }).error, /Unexpected extra vault argument/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '/one', '/two'], cwd: '/tmp/cwd', isMain: true }).error, /Unexpected extra vault argument/);
    assert.match(parseVerifyArgs({ env: {}, argv: ['node', 'verify.mjs', '--unknown'], cwd: '/tmp/cwd', isMain: true }).error, /Unknown option/);
  });

  it('describes direct verify usage', () => {
    assert.match(verifyUsage(), /node mcp\/scripts\/verify\.mjs \[vault\] \[--timeout-ms N\]/);
    assert.match(verifyUsage(), /node mcp\/scripts\/verify\.mjs --vault path --timeout-ms 15000/);
    assert.match(verifyUsage(), /npm run verify -- \[vault\] \[--timeout-ms N\]/);
    assert.match(verifyUsage(), /npm run verify -- --vault path --timeout-ms 15000/);
    assert.match(verifyUsage(), /Explicit \[vault\] or --vault arguments take precedence over OMOT_VAULT/);
    assert.match(verifyUsage(), /project probe/);
    assert.match(verifyUsage(), /strict unknown-argument \/ invalid-enum rejection/);
    assert.match(verifyUsage(), /maintenance_plan filter enums/);
    assert.match(verifyUsage(), /maintenance_plan cursor handling/);
    assert.match(verifyUsage(), /cursor\.found=true, cursor\.reason=null/);
    assert.match(verifyUsage(), /missing afterActionId/);
    assert.match(verifyUsage(), /cursor\.found=false, reason, empty page/);
  });

  it('fails malformed strict argument smoke responses', () => {
    assert.equal(
      strictArgsFailure({
        result: {
          isError: true,
          content: [{ text: 'Unknown argument "lmit" for list_concepts. Did you mean "limit"?' }],
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
      'strict arguments response did not report the unknown list_concepts argument',
    );
    assert.equal(
      strictArgsFailure({ result: { isError: true, content: [{ text: 'Unknown argument "lmit" for list_concepts.' }] } }),
      'strict arguments response did not suggest the closest list_concepts argument',
    );
  });

  it('fails malformed strict enum smoke responses', () => {
    assert.equal(
      strictEnumFailure({
        result: {
          isError: true,
          content: [{ text: 'operation must be one of: overview, health. Invalid value: overveiw. Did you mean "overview"?' }],
        },
      }),
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
  });

  it('fails malformed strict maintenance filter smoke responses', () => {
    assert.equal(
      strictMaintenanceFilterFailure({
        result: {
          isError: true,
          content: [{ text: 'phases items must be one of: validate, repair, link, materialize, review.' }],
        },
      }, 'phases'),
      null,
    );
    assert.equal(
      strictMaintenanceFilterFailure({
        result: {
          isError: true,
          content: [{ text: 'severities items must be one of: fail, warn, info.' }],
        },
      }, 'severities'),
      null,
    );
    assert.equal(
      strictMaintenanceFilterFailure({
        result: {
          isError: true,
          content: [{ text: `kinds items must be one of: ${MAINTENANCE_KIND_VALUES.join(', ')}.` }],
        },
      }, 'kinds'),
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
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'severities items must be one of: fail, warn.' }] } }, 'severities'),
      'strict maintenance filter response did not list allowed maintenance_plan severities',
    );
    assert.equal(
      strictMaintenanceFilterFailure({ result: { isError: true, content: [{ text: 'kinds items must be one of: add_missing_relation.' }] } }, 'kinds'),
      'strict maintenance filter response did not list allowed maintenance_plan kinds',
    );
  });

  it('summarizes strict maintenance filter enum values in verify output', () => {
    assert.equal(
      maintenanceFilterEnumSummary(),
      `phases=${MAINTENANCE_PHASE_VALUES.join('/')}; severities=${MAINTENANCE_SEVERITY_VALUES.join('/')}; kinds=${MAINTENANCE_KIND_VALUES.join('/')}`,
    );
  });

  it('fails malformed maintenance missing-cursor smoke responses', () => {
    const clean = {
      operation: 'maintenance_plan',
      sideEffect: false,
      summary: { remainingActions: 0 },
      cursor: {
        afterActionId: 'maint_missing',
        found: false,
        reason: 'afterActionId not found in filtered maintenance actions',
        startIndex: null,
      },
      actions: [],
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
      maintenanceMissingCursorFailure({ ...clean, actions: [{ id: 'maint_link' }] }),
      'maintenance missing-cursor smoke returned actions',
    );
    assert.equal(
      maintenanceMissingCursorFailure({ ...clean, summary: { remainingActions: 1 } }),
      'maintenance missing-cursor smoke should have zero remaining actions',
    );
  });

  it('fails malformed maintenance ready-cursor smoke responses', () => {
    const clean = {
      operation: 'maintenance_plan',
      sideEffect: false,
      summary: { remainingActions: 0 },
      cursor: {
        afterActionId: null,
        found: true,
        reason: null,
        startIndex: 0,
      },
      actions: [],
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
      maintenanceReadyCursorFailure({ ...clean, actions: null }),
      'maintenance ready-cursor smoke response missing actions array',
    );
    assert.equal(
      maintenanceReadyCursorFailure({ ...clean, summary: {} }),
      'maintenance ready-cursor smoke missing remainingActions summary',
    );
    const withoutNextExecutable = { ...clean };
    delete withoutNextExecutable.nextExecutableAction;
    assert.equal(
      maintenanceReadyCursorFailure(withoutNextExecutable),
      'maintenance ready-cursor smoke missing next action pointers',
    );
  });

  it('fails initialize instructions missing first-contact safety guidance', () => {
    const safeInstructions = [
      'Use read-only first-contact diagnosis before write tools.',
      'rename_concept refuses an existing `newSlug` unless overwrite: true is explicit.',
      'delete_concept force: true means accepting dangling referrers.',
      'Use expected_mtime when patching a previously-read concept.',
      'Tool schemas reject unknown arguments with nearest hints.',
      'unknown arguments are rejected instead of being ignored.',
      'Unknown argument "lmit" for list_concepts. Did you mean "limit"?',
      'operation must be one of: overview, health. Invalid value: overveiw. Did you mean "overview"?',
      'maintenance_plan phases, severities, and kinds filters are enum-validated.',
      'maintenance_plan ready pages return cursor.found=true with cursor.reason=null.',
      'maintenance_plan afterActionId cursor misses return cursor.found=false and cursor.reason.',
      'This filler keeps the instructions representative of a real initialize response.',
    ].join('\n');

    assert.equal(initializeInstructionsFailure({ result: { instructions: safeInstructions } }), null);
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: '' } }),
      'initialize instructions missing or too short',
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
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('Did you mean "overview"?', '') } }),
      'initialize instructions missing nearest enum hint guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('phases, severities, and kinds', 'filters') } }),
      'initialize instructions missing maintenance filter enum guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('cursor.found=true with cursor.reason=null', 'ready cursor') } }),
      'initialize instructions missing maintenance ready cursor guidance',
    );
    assert.equal(
      initializeInstructionsFailure({ result: { instructions: safeInstructions.replace('cursor.found=false and cursor.reason', 'empty page') } }),
      'initialize instructions missing maintenance cursor miss guidance',
    );
  });

  it('rejects partial or non-positive verify timeout env values', () => {
    assert.equal(parseVerifyTimeoutMs('1000ms'), false);
    assert.equal(parseVerifyTimeoutMs('0'), false);
    assert.equal(parseVerifyTimeoutMs('-1'), false);
    assert.equal(parseVerifyTimeoutMs('nope'), false);
  });

  it('formats actionable timeout failures', () => {
    assert.equal(
      verifyTimeoutFailure(1),
      'server verify timed out after 1ms. Increase --timeout-ms or OMOT_VERIFY_TIMEOUT_MS for large or slow vaults.',
    );
  });

  it('formats startup failures before initialize separately from timeouts', () => {
    assert.equal(serverStartupFailure('Vault root not found'), 'server failed before initialize. stderr: Vault root not found');
    assert.equal(serverStartupFailure(''), 'no initialize response');
  });

  it('detects when all first-contact JSON-RPC responses arrived', () => {
    assert.equal(
      hasAllFirstContactResponses(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
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

  it('keeps first-contact response labels aligned with the get_concepts smoke', () => {
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
    assert.deepEqual(
      [...expectedResponseIds(buildFirstContactRequests()), 11, 13, 14, 15].sort((a, b) => a - b),
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
    assert.equal(
      getConceptsFailure({
        concepts: [
          {
            ok: true,
            slug: 'project',
            frontmatter: { kind: 'project', title: 'Project' },
            mtime: 1,
          },
          {
            ok: true,
            slug: 'capabilities/mcp-server',
            frontmatter: { kind: 'capability', title: 'MCP Server' },
            mtime: 1,
          },
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
    const okConcepts = [
      { ok: true, slug: 'project', frontmatter: { kind: 'project', title: 'Project' }, mtime: 1 },
      { ok: true, slug: 'capabilities/mcp-server', frontmatter: { kind: 'capability', title: 'MCP Server' }, mtime: 1 },
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
      getConceptsFailure({ concepts: [okConcepts[0], { ...okConcepts[1], frontmatter: null }, okConcepts[2]] }),
      'get_concepts response missing frontmatter: capabilities/mcp-server',
    );
    assert.equal(
      getConceptsFailure({ concepts: [okConcepts[0], okConcepts[1], { slug: 'missing-verify-slug', ok: true }] }),
      'get_concepts response expected partial row to be ok:false',
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
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { broken: null } } }), 'validate_vault response malformed byCode entry: broken');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { broken: { count: 1, files: [] } } } }), 'validate_vault response missing byCode severity: broken');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { broken: { severity: 'error', files: [] } } } }), 'validate_vault response missing byCode count: broken');
    assert.equal(validateVaultFailure({ scanned: 1, summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0, byCode: { broken: { severity: 'error', count: 1 } } } }), 'validate_vault response missing byCode files: broken');
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
      componentLimit: 3,
      cycleLimit: 3,
      recommendationLimit: 3,
      orderLimit: 3,
      nodeLimit: 3,
      dependencyTypes: ['dependencies'],
      componentTypes: ['domain', 'capabilities'],
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

  it('formats health check coverage for verify output', () => {
    assert.equal(healthChecksSummary(null), null);
    assert.equal(healthChecksSummary([]), null);
    assert.equal(
      healthChecksSummary([
        { id: 'compile_issues', status: 'pass' },
        { id: 'unresolved_edges', status: 'pass' },
        { id: 'dependency_cycles', status: 'warn' },
      ]),
      'compile_issues:pass, unresolved_edges:pass, dependency_cycles:warn',
    );
    assert.equal(
      healthChecksSummary([
        { id: 'a', status: 'pass' },
        { id: 'b', status: 'pass' },
        { id: 'c', status: 'pass' },
      ], 2),
      'a:pass, b:pass, +1 more',
    );
  });

  it('formats non-blocking workspace brief next actions for verify output', () => {
    assert.equal(advisoryNextActionsSummary(null), null);
    assert.equal(
      advisoryNextActionsSummary([
        { id: 'compile_issues', severity: 'warn' },
        { kind: 'add_missing_relations', severity: 'warn' },
        { kind: 'materialize_external_elements', severity: 'info' },
        { kind: 'resolve_dangling_references', severity: 'fail' },
      ]),
      'compile_issues:warn, add_missing_relations:warn, materialize_external_elements:info',
    );
    assert.equal(
      advisoryNextActionsSummary([
        { kind: 'a', severity: 'info' },
        { kind: 'b', severity: 'warn' },
        { kind: 'c', severity: 'info' },
        { kind: 'd', severity: 'warn' },
      ], 2),
      'a:info, b:warn, +2 more',
    );
  });

  it('formats workspace brief counts for human-facing verify output', () => {
    assert.equal(
      workspaceBriefSummary({
        summary: { nodes: 1 },
        nextActions: [{ id: 'cleanup', severity: 'warn' }],
        health: { checks: [{ id: 'compile_issues', status: 'warn' }, { id: 'components', status: 'pass' }] },
      }),
      '1 node, 1 next action, 2 health checks',
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
          health: { checks: [{ id: 'dependency_cycles', status: 'fail' }] },
        },
        'workspace_brief',
      ),
      'workspace_brief has failing health checks: dependency_cycles. Inspect query_ontology({operation:"health"}) before writing.',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief_tuned',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          nextActions: [],
          health: { checks: [{ id: 'components', status: 'fail' }] },
        },
        'workspace_brief',
      ),
      'workspace_brief_tuned has failing health checks: components. Inspect query_ontology({operation:"health"}) before writing.',
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
      'workspace_brief response malformed nextAction',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ kind: 'health_check' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed nextAction',
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
      'workspace_brief response malformed nextAction',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ kind: 'health_check', severity: '' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed nextAction',
    );
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'healthy',
          health: { checks: [] },
          nextActions: [{ kind: 'health_check', severity: 'fatal' }],
        },
        'workspace_brief',
      ),
      'workspace_brief response malformed nextAction',
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
      'health response malformed health check',
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
      'health response malformed health check',
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
      'health response malformed health check',
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
      'health response malformed health check',
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
      'health response malformed health check',
    );
  });

  it('accepts workspace_brief responses with warn next actions', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
          health: { checks: [] },
          nextActions: [
            { kind: 'health_check', severity: 'warn', id: 'compile_issues' },
            { kind: 'add_missing_relations', severity: 'warn', count: 2 },
          ],
        },
        'workspace_brief',
      ),
      null,
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
            { kind: 'resolve_dangling_references', severity: 'fail', count: 1 },
          ],
        },
        'workspace_brief',
      ),
      'workspace_brief has actionable nextActions: resolve_dangling_references. Inspect workspace_brief.nextActions before writing.',
    );
  });
});
