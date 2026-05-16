import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  advisoryNextActionsSummary,
  buildGetConceptsSmokeSlugs,
  compileSummaryFailure,
  diagnosisBlockingFailure,
  diagnosisIssueCount,
  EXPECTED_READ_TOOLS,
  EXPECTED_TOOLS,
  EXPECTED_WRITE_TOOLS,
  expectedToolSplitLabel,
  firstContactErrorFailure,
  getConceptsFailure,
  hasAllFirstContactResponses,
  hasFirstContactErrorResponse,
  listConceptsFailure,
  listKindsFailure,
  overviewFailure,
  overviewQueryPlanFailure,
  parseVerifyTimeoutMs,
  serverStartupFailure,
  validationCodeSummary,
  validateVaultFailure,
  verifyCountConsistencyFailure,
  verifyTimeoutFailure,
  vaultWarningsFailure,
} from '../scripts/verify.mjs';

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

  it('parses verify timeout env as a strict positive integer', () => {
    assert.equal(parseVerifyTimeoutMs(undefined), 8000);
    assert.equal(parseVerifyTimeoutMs(''), 8000);
    assert.equal(parseVerifyTimeoutMs('15000'), 15000);
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
      'server verify timed out after 1ms. Increase OMOT_VERIFY_TIMEOUT_MS for large or slow vaults.',
    );
  });

  it('formats startup failures before initialize separately from timeouts', () => {
    assert.equal(serverStartupFailure('Vault root not found'), 'server failed before initialize. stderr: Vault root not found');
    assert.equal(serverStartupFailure(''), 'no initialize response');
  });

  it('detects when all first-contact JSON-RPC responses arrived', () => {
    assert.equal(
      hasAllFirstContactResponses(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
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
      'list_concepts vaultWarnings present — errors 1, warnings 2',
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
      'validate_vault found 2 problem file(s) — errors 1, warnings 1 — codes dangling-graph-reference:warning:2, missing-kind:error:1',
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
    assert.equal(
      verifyCountConsistencyFailure({ kinds, list, validation: { ...validation, scanned: 2 }, compiled }),
      'verify count mismatch — list_kinds.total 1, validate_vault.scanned 2',
    );
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
      diagnosisBlockingFailure('health', { operation: 'health', status: 'healthy' }, 'health'),
      null,
    );
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
          health: { checks: [{ id: 'dependency_cycles', status: 'fail' }] },
        },
        'workspace_brief',
      ),
      'workspace_brief has failing health checks: dependency_cycles',
    );
  });

  it('accepts workspace_brief responses with warn next actions', () => {
    assert.equal(
      diagnosisBlockingFailure(
        'workspace_brief',
        {
          operation: 'workspace_brief',
          status: 'needs_attention',
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
          nextActions: [
            { kind: 'health_check', severity: 'info', id: 'components' },
            { kind: 'resolve_dangling_references', severity: 'fail', count: 1 },
          ],
        },
        'workspace_brief',
      ),
      'workspace_brief has actionable nextActions: resolve_dangling_references',
    );
  });
});
