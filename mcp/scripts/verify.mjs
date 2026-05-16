#!/usr/bin/env node
/**
 * MCP server verify CLI — UX-3.
 *
 * 사용자가 .mcp.json 등록 후 *서버가 정상* 인지 1 명령으로 확인.
 *
 * 사용법:
 *   node mcp/scripts/verify.mjs                    # vault = cwd
 *   OMOT_VAULT=./docs/ontology node mcp/scripts/verify.mjs
 *   OMOT_VERIFY_TIMEOUT_MS=15000 npm run verify    # larger/slower vaults
 *
 * 검증 항목:
 *   1. parser smoke test (parser.test.mjs) 통과
 *   2. server boot — initialize JSON-RPC 응답
 *   3. tools/list — 23 도구 모두 노출
 *   4. tools/call list_concepts — vault 노드 수 출력
 *   5. tools/call list_kinds — kind census aggregate
 *   6. tools/call validate_vault — whole-vault frontmatter / graph-reference health
 *   7. tools/call query_ontology workspace_brief + health — agent first-contact graph diagnosis
 *   8. tools/call compile_ontology(summary) — compiler graph summary contract
 *   9. tools/call query_ontology overview + query_plan(overview) — graph-query smoke contract
 *
 * 모두 PASS → exit 0, 실패 → exit 1 + 진단 메시지.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  hasAnyErrorResponse,
  hasAllResultResponses,
  missingResponseLabels,
  parseJsonRpcResponses,
} from './json-rpc-lines.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..');
const PARSER_TEST = join(MCP_ROOT, 'src', 'parser.test.mjs');
const SERVER_ENTRY = join(MCP_ROOT, 'src', 'index.js');
const VAULT = process.env.OMOT_VAULT || process.cwd();
const VERIFY_TIMEOUT_MS_RAW = process.env.OMOT_VERIFY_TIMEOUT_MS;

export const EXPECTED_READ_TOOLS = [
  'list_concepts',
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
  'analyze_repo_structure',
  'infer_imports',
];

export const EXPECTED_WRITE_TOOLS = [
  'add_concept',
  'add_concepts',
  'add_relation',
  'add_relations',
  'patch_concept',
  'delete_concept',
  'rename_concept',
  'merge_concepts',
];

export const EXPECTED_TOOLS = [...EXPECTED_READ_TOOLS, ...EXPECTED_WRITE_TOOLS];

export function expectedToolSplitLabel() {
  return `${EXPECTED_READ_TOOLS.length} read + ${EXPECTED_WRITE_TOOLS.length} write`;
}

const FIRST_CONTACT_RESPONSE_LABELS = new Map([
  [1, 'initialize'],
  [2, 'tools/list'],
  [3, 'list_concepts'],
  [4, 'list_kinds'],
  [5, 'validate_vault'],
  [6, 'workspace_brief'],
  [7, 'health'],
  [8, 'compile_ontology'],
  [9, 'overview'],
  [10, 'overview_query_plan'],
]);

function log(level, msg) {
  const tag =
    level === 'ok' ? '\x1b[32m✓\x1b[0m' :
    level === 'fail' ? '\x1b[31m✗\x1b[0m' :
    level === 'info' ? '·' : '?';
  console.log(`${tag} ${msg}`);
}

export function parseVerifyTimeoutMs(value, fallback = 8000) {
  if (value == null || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : false;
}

export function verifyTimeoutFailure(timeoutMs) {
  return `server verify timed out after ${timeoutMs}ms. Increase OMOT_VERIFY_TIMEOUT_MS for large or slow vaults.`;
}

export function serverStartupFailure(stderr) {
  const detail = String(stderr || '').trim().slice(0, 300);
  return detail ? `server failed before initialize. stderr: ${detail}` : 'no initialize response';
}

export function hasAllFirstContactResponses(stdout) {
  return hasAllResultResponses(stdout, new Set(FIRST_CONTACT_RESPONSE_LABELS.keys()));
}

export function hasFirstContactErrorResponse(stdout) {
  return hasAnyErrorResponse(stdout, new Set(FIRST_CONTACT_RESPONSE_LABELS.keys()));
}

export function firstContactErrorFailure(response) {
  const label = FIRST_CONTACT_RESPONSE_LABELS.get(response?.id) || `id ${response?.id}`;
  const message = response?.error?.message || JSON.stringify(response?.error || {});
  return `${label} returned JSON-RPC error: ${message}`;
}

function verifyTimeoutMs() {
  return parseVerifyTimeoutMs(VERIFY_TIMEOUT_MS_RAW);
}

export function vaultWarningsFailure(parsed) {
  const warnings = parsed?.vaultWarnings;
  if (!warnings) return null;
  if (typeof warnings !== 'object' || Array.isArray(warnings)) {
    return 'list_concepts vaultWarnings malformed';
  }
  if (!Number.isInteger(warnings.errorCount) || warnings.errorCount < 0) {
    return 'list_concepts vaultWarnings missing errorCount';
  }
  if (!Number.isInteger(warnings.warningCount) || warnings.warningCount < 0) {
    return 'list_concepts vaultWarnings missing warningCount';
  }
  const errorCount = warnings.errorCount;
  const warningCount = warnings.warningCount;
  if (errorCount === 0 && warningCount === 0) return null;
  return `list_concepts vaultWarnings present — errors ${errorCount}, warnings ${warningCount}`;
}

export function listKindsFailure(parsed) {
  if (!Number.isInteger(parsed?.total) || parsed.total < 0) {
    return 'list_kinds response missing total count';
  }
  if (!parsed.byKind || typeof parsed.byKind !== 'object' || Array.isArray(parsed.byKind)) {
    return 'list_kinds response missing byKind aggregate';
  }
  let sum = 0;
  for (const [kind, count] of Object.entries(parsed.byKind)) {
    if (typeof kind !== 'string' || kind.length === 0) {
      return 'list_kinds response has empty kind key';
    }
    if (!Number.isInteger(count) || count < 0) {
      return `list_kinds response missing count for kind: ${kind || 'unknown'}`;
    }
    sum += count;
  }
  if (sum !== parsed.total) {
    return `list_kinds response total mismatch — total ${parsed.total}, byKind ${sum}`;
  }
  return null;
}

export function listConceptsFailure(parsed) {
  if (!Number.isInteger(parsed?.total) || parsed.total < 0) {
    return 'list_concepts response missing total count';
  }
  if (typeof parsed.vaultRoot !== 'string' || parsed.vaultRoot.length === 0) {
    return 'list_concepts response missing vaultRoot';
  }
  if (!Array.isArray(parsed.nodes)) {
    return 'list_concepts response missing nodes array';
  }
  if (parsed.nodes.length > parsed.total) {
    return `list_concepts response node count exceeds total — nodes ${parsed.nodes.length}, total ${parsed.total}`;
  }
  for (const [index, node] of parsed.nodes.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return `list_concepts response malformed node at index ${index}`;
    }
    if (typeof node.slug !== 'string' || node.slug.length === 0) {
      return `list_concepts response missing node slug at index ${index}`;
    }
    if (typeof node.kind !== 'string' || node.kind.length === 0) {
      return `list_concepts response missing node kind: ${node.slug}`;
    }
    if (typeof node.title !== 'string' || node.title.length === 0) {
      return `list_concepts response missing node title: ${node.slug}`;
    }
    if (!Number.isFinite(node.mtime) || node.mtime < 0) {
      return `list_concepts response missing node mtime: ${node.slug}`;
    }
  }
  return vaultWarningsFailure(parsed);
}

export function validateVaultFailure(parsed) {
  const summary = parsed?.summary;
  if (!summary) return 'validate_vault response missing summary';
  if (!Number.isInteger(parsed?.scanned) || parsed.scanned < 0) {
    return 'validate_vault response missing scanned count';
  }
  if (!Number.isInteger(summary.problemFiles) || summary.problemFiles < 0) {
    return 'validate_vault response missing problemFiles count';
  }
  if (!Number.isInteger(summary.errorFiles) || summary.errorFiles < 0) {
    return 'validate_vault response missing errorFiles count';
  }
  if (!Number.isInteger(summary.warningFiles) || summary.warningFiles < 0) {
    return 'validate_vault response missing warningFiles count';
  }
  if (!summary.byCode || typeof summary.byCode !== 'object' || Array.isArray(summary.byCode)) {
    return 'validate_vault response missing byCode aggregate';
  }
  const byCodeFailure = validateByCodeAggregate(summary.byCode);
  if (byCodeFailure) return byCodeFailure;
  const problemFiles = summary.problemFiles;
  if (problemFiles === 0) return null;
  if (Object.keys(summary.byCode).length === 0) {
    return 'validate_vault response missing byCode entries for problem files';
  }
  const codeSummary = validationCodeSummary(summary.byCode);
  const suffix = codeSummary ? ` — codes ${codeSummary}` : '';
  return `validate_vault found ${problemFiles} problem file(s) — errors ${summary.errorFiles}, warnings ${summary.warningFiles}${suffix}`;
}

export function compileSummaryFailure(parsed) {
  if (!Number.isInteger(parsed?.version) || parsed.version < 1) {
    return 'compile_ontology response missing version';
  }
  if (typeof parsed.graphHash !== 'string' || parsed.graphHash.length === 0) {
    return 'compile_ontology response missing graphHash';
  }
  if (!Number.isFinite(parsed.maxMtime) || parsed.maxMtime < 0) {
    return 'compile_ontology response missing maxMtime';
  }
  const countFailure = numericFieldsFailure('compile_ontology', parsed, [
    'nodeCount',
    'edgeCount',
    'resolvedEdgeCount',
    'externalEdgeCount',
    'unresolvedEdgeCount',
    'aliasCount',
    'ambiguousAliasCount',
    'issueCount',
    'canonicalizationActionCount',
  ]);
  if (countFailure) return countFailure;
  const byKindFailure = countMapFailure('compile_ontology', 'byKind', parsed.byKind);
  if (byKindFailure) return byKindFailure;
  const byDomainFailure = countMapFailure('compile_ontology', 'byDomain', parsed.byDomain);
  if (byDomainFailure) return byDomainFailure;
  const byKindTotal = Object.values(parsed.byKind).reduce((sum, count) => sum + count, 0);
  if (byKindTotal !== parsed.nodeCount) {
    return `compile_ontology response byKind mismatch — nodeCount ${parsed.nodeCount}, byKind ${byKindTotal}`;
  }
  const edgeTotal =
    parsed.resolvedEdgeCount + parsed.externalEdgeCount + parsed.unresolvedEdgeCount;
  if (edgeTotal !== parsed.edgeCount) {
    return `compile_ontology response edge count mismatch — edgeCount ${parsed.edgeCount}, resolved+external+unresolved ${edgeTotal}`;
  }
  return null;
}

export function overviewFailure(parsed) {
  if (parsed?.operation !== 'overview') {
    return `overview returned unexpected operation: ${parsed?.operation}`;
  }
  const graph = parsed.graph;
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return 'overview response missing graph summary';
  }
  const graphFailure = numericFieldsFailure('overview.graph', graph, [
    'nodes',
    'edges',
    'resolvedEdges',
    'externalEdges',
    'unresolvedEdges',
    'aliases',
    'ambiguousAliases',
    'issues',
  ]);
  if (graphFailure) return graphFailure;
  if (typeof graph.graphHash !== 'string' || graph.graphHash.length === 0) {
    return 'overview response missing graphHash';
  }
  if (!Number.isFinite(graph.maxMtime) || graph.maxMtime < 0) {
    return 'overview response missing maxMtime';
  }
  const edgeTotal = graph.resolvedEdges + graph.externalEdges + graph.unresolvedEdges;
  if (edgeTotal !== graph.edges) {
    return `overview response edge count mismatch — edges ${graph.edges}, resolved+external+unresolved ${edgeTotal}`;
  }
  const byKindFailure = countMapFailure('overview', 'byKind', parsed.byKind);
  if (byKindFailure) return byKindFailure;
  const byKindTotal = Object.values(parsed.byKind).reduce((sum, count) => sum + count, 0);
  if (byKindTotal !== graph.nodes) {
    return `overview response byKind mismatch — nodes ${graph.nodes}, byKind ${byKindTotal}`;
  }
  if (!Array.isArray(parsed.hubs)) {
    return 'overview response missing hubs array';
  }
  return null;
}

export function overviewQueryPlanFailure(parsed) {
  if (parsed?.operation !== 'query_plan') {
    return `overview query_plan returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.targetOperation !== 'overview') {
    return `overview query_plan returned unexpected targetOperation: ${parsed.targetOperation}`;
  }
  if (parsed.sideEffect !== false) {
    return 'overview query_plan must be side-effect-free';
  }
  if (!parsed.normalized || parsed.normalized.targetOperation !== 'overview') {
    return 'overview query_plan missing normalized targetOperation';
  }
  if (!parsed.estimate || parsed.estimate.strategy !== 'aggregate_scan') {
    return 'overview query_plan missing aggregate_scan estimate';
  }
  if (!Number.isInteger(parsed.estimate.nodeScans) || parsed.estimate.nodeScans < 0) {
    return 'overview query_plan missing nodeScans';
  }
  if (!Number.isInteger(parsed.estimate.edgeScans) || parsed.estimate.edgeScans < 0) {
    return 'overview query_plan missing edgeScans';
  }
  if (!['low', 'medium', 'high'].includes(parsed.estimate.costClass)) {
    return 'overview query_plan missing costClass';
  }
  if (!Array.isArray(parsed.indexesUsed) || !parsed.indexesUsed.includes('compiled_artifact')) {
    return 'overview query_plan missing compiled_artifact index hint';
  }
  if (!Array.isArray(parsed.warnings)) {
    return 'overview query_plan missing warnings array';
  }
  return null;
}

export function verifyCountConsistencyFailure({ kinds, list, validation, compiled, overview }) {
  if (
    (kinds && listKindsFailure(kinds)) ||
    (list && listConceptsFailure(list)) ||
    (validation && validateVaultFailure(validation)) ||
    (compiled && compileSummaryFailure(compiled)) ||
    (overview && overviewFailure(overview))
  ) {
    return null;
  }

  const counts = [
    ['list_kinds.total', kinds?.total],
    ['list_concepts.total', list?.total],
    ['validate_vault.scanned', validation?.scanned],
    ['compile_ontology.nodeCount', compiled?.nodeCount],
    ['overview.graph.nodes', overview?.graph?.nodes],
  ].filter(([, value]) => Number.isInteger(value));

  if (counts.length <= 1) return null;

  const [baseLabel, baseValue] = counts[0];
  for (const [label, value] of counts.slice(1)) {
    if (value !== baseValue) {
      return `verify count mismatch — ${baseLabel} ${baseValue}, ${label} ${value}`;
    }
  }
  if (kinds?.byKind && compiled?.byKind) {
    const kindKeys = new Set([...Object.keys(kinds.byKind), ...Object.keys(compiled.byKind)]);
    for (const kind of [...kindKeys].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const compiledCount = compiled.byKind[kind] ?? 0;
      if (kindsCount !== compiledCount) {
        return `verify byKind mismatch — ${kind}: list_kinds ${kindsCount}, compile_ontology ${compiledCount}`;
      }
    }
  }
  if (kinds?.byKind && overview?.byKind) {
    const kindKeys = new Set([...Object.keys(kinds.byKind), ...Object.keys(overview.byKind)]);
    for (const kind of [...kindKeys].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const overviewCount = overview.byKind[kind] ?? 0;
      if (kindsCount !== overviewCount) {
        return `verify byKind mismatch — ${kind}: list_kinds ${kindsCount}, overview ${overviewCount}`;
      }
    }
  }
  return null;
}

export function diagnosisBlockingFailure(label, parsed, expectedOperation) {
  if (parsed?.operation !== expectedOperation) {
    return `${label} returned unexpected operation: ${parsed?.operation}`;
  }
  const checks = Array.isArray(parsed?.checks)
    ? parsed.checks
    : Array.isArray(parsed?.health?.checks)
      ? parsed.health.checks
      : [];
  const failedChecks = checks.filter((check) => check.status === 'fail');
  if (failedChecks.length > 0) {
    return `${label} has failing health checks: ${failedChecks.map((check) => check.id).join(', ')}`;
  }
  const blockingActions = blockingNextActions(parsed?.nextActions);
  if (blockingActions.length > 0) {
    return `${label} has actionable nextActions: ${blockingActions.join(', ')}`;
  }
  return null;
}

function validateByCodeAggregate(byCode) {
  for (const [code, entry] of Object.entries(byCode)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return `validate_vault response malformed byCode entry: ${code}`;
    }
    if (typeof entry.severity !== 'string' || entry.severity.length === 0) {
      return `validate_vault response missing byCode severity: ${code}`;
    }
    if (!Number.isInteger(entry.count) || entry.count < 0) {
      return `validate_vault response missing byCode count: ${code}`;
    }
    if (!Array.isArray(entry.files)) {
      return `validate_vault response missing byCode files: ${code}`;
    }
  }
  return null;
}

function numericFieldsFailure(label, value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} response missing numeric fields`;
  }
  for (const key of keys) {
    if (!Number.isInteger(value[key]) || value[key] < 0) {
      return `${label} response missing ${key}`;
    }
  }
  return null;
}

function countMapFailure(label, key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} response missing ${key} aggregate`;
  }
  for (const [entryKey, count] of Object.entries(value)) {
    if (entryKey.length === 0) {
      return `${label} response has empty ${key} key`;
    }
    if (!Number.isInteger(count) || count < 0) {
      return `${label} response missing ${key} count: ${entryKey || 'unknown'}`;
    }
  }
  return null;
}

export function validationCodeSummary(byCode, limit = 3) {
  const entries = Object.entries(byCode || {})
    .filter(([, entry]) => Number.isInteger(entry?.count))
    .sort(([aCode, a], [bCode, b]) => b.count - a.count || aCode.localeCompare(bCode));
  if (entries.length === 0) return null;
  const shown = entries.slice(0, limit).map(([code, entry]) => `${code}:${entry.severity || 'unknown'}:${entry.count}`);
  const suffix = entries.length > shown.length ? `, +${entries.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

function blockingNextActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action?.severity === 'fail')
    .map((action) => action.id || action.kind || 'unknown');
}

export function diagnosisIssueCount(parsed) {
  return parsed?.summary?.issues ?? parsed?.summary?.compileIssues ?? 0;
}

export function advisoryNextActionsSummary(actions, limit = 3) {
  if (!Array.isArray(actions)) return null;
  const advisory = actions
    .filter((action) => action?.severity !== 'fail')
    .map((action) => `${action.id || action.kind || 'unknown'}:${action.severity || 'unknown'}`);
  if (advisory.length === 0) return null;
  const shown = advisory.slice(0, limit);
  const suffix = advisory.length > shown.length ? `, +${advisory.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

async function step1ParserSmoke() {
  log('info', 'step 1 — parser smoke test');
  return new Promise((res) => {
    const proc = spawn('node', [PARSER_TEST], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('close', (code) => {
      if (code === 0 && /passed/.test(stdout)) {
        log('ok', stdout.trim().split('\n').slice(-1)[0]);
        res(true);
      } else {
        log('fail', `parser test failed (exit ${code})`);
        if (stdout) console.error(stdout);
        if (stderr) console.error(stderr);
        res(false);
      }
    });
  });
}

async function step2BootAndCall() {
  const timeoutMs = verifyTimeoutMs();
  if (timeoutMs === false) {
    log('fail', 'OMOT_VERIFY_TIMEOUT_MS must be a positive integer');
    return false;
  }
  log('info', `step 2 — server boot + tools/list + list_concepts/list_kinds (vault=${VAULT}, timeout=${timeoutMs}ms)`);

  const lines = [
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'verify-cli', version: '0' },
      },
    }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { limit: 5 } },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'list_kinds', arguments: {} },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'validate_vault', arguments: {} },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'workspace_brief', limit: 3 } },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'health' } },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'compile_ontology', arguments: { summary: true } },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'overview', limit: 5 } },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'overview' } },
    }),
  ];

  return new Promise((res) => {
    const proc = spawn('node', [SERVER_ENTRY], {
      env: { ...process.env, OMOT_VAULT: VAULT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let completed = false;
    let timer = null;
    proc.stdout.on('data', (b) => {
      stdout += b.toString();
      if (!completed && (hasAllFirstContactResponses(stdout) || hasFirstContactErrorResponse(stdout))) {
        completed = true;
        if (timer) clearTimeout(timer);
        proc.kill('SIGTERM');
      }
    });
    proc.stderr.on('data', (b) => (stderr += b.toString()));

    proc.stdin.write(lines.join('\n') + '\n');
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', () => {
      if (timer) clearTimeout(timer);
      const responses = parseJsonRpcResponses(stdout);

      const initRes = responses.find((r) => r.id === 1);
      const listRes = responses.find((r) => r.id === 2);
      const callRes = responses.find((r) => r.id === 3);
      const kindsRes = responses.find((r) => r.id === 4);
      const validateRes = responses.find((r) => r.id === 5);
      const briefRes = responses.find((r) => r.id === 6);
      const healthRes = responses.find((r) => r.id === 7);
      const compileRes = responses.find((r) => r.id === 8);
      const overviewRes = responses.find((r) => r.id === 9);
      const overviewPlanRes = responses.find((r) => r.id === 10);
      let kindsPayload = null;
      let listPayload = null;
      let validationPayload = null;
      let compilePayload = null;
      let overviewPayload = null;
      const missingResponses = [
        ['initialize', initRes],
        ['tools/list', listRes],
        ['list_concepts', callRes],
        ['list_kinds', kindsRes],
        ['validate_vault', validateRes],
        ['workspace_brief', briefRes],
        ['health', healthRes],
        ['compile_ontology', compileRes],
        ['overview', overviewRes],
        ['overview_query_plan', overviewPlanRes],
      ].filter(([, response]) => !response?.result);
      const errorRes = responses.find((response) => (
        FIRST_CONTACT_RESPONSE_LABELS.has(response?.id) && response?.error
      ));

      if (errorRes) {
        log('fail', firstContactErrorFailure(errorRes));
        return res(false);
      }

      if (timedOut && missingResponses.length > 0) {
        const missingLabels = missingResponseLabels(
          responses.filter((response) => response?.result),
          FIRST_CONTACT_RESPONSE_LABELS,
        );
        log('fail', `${verifyTimeoutFailure(timeoutMs)} Missing responses: ${missingLabels.join(', ')}`);
        if (stderr) console.error(stderr.slice(0, 300));
        return res(false);
      }

      if (!initRes || !initRes.result) {
        log('fail', serverStartupFailure(stderr));
        return res(false);
      }
      log('ok', `initialize OK — server ${initRes.result.serverInfo?.name}@${initRes.result.serverInfo?.version}`);

      if (!listRes || !listRes.result?.tools) {
        log('fail', 'no tools/list response');
        return res(false);
      }
      const toolNames = listRes.result.tools.map((t) => t.name).sort();
      const expectedSorted = [...EXPECTED_TOOLS].sort();
      const missing = expectedSorted.filter((n) => !toolNames.includes(n));
      const extra = toolNames.filter((n) => !expectedSorted.includes(n));
      if (missing.length > 0 || extra.length > 0) {
        log('fail', `tools mismatch — missing: ${missing.join(',') || '(none)'}, extra: ${extra.join(',') || '(none)'}`);
        return res(false);
      }
      log('ok', `tools/list ${toolNames.length}/${EXPECTED_TOOLS.length} (${expectedToolSplitLabel()}) — ${toolNames.join(' · ')}`);

      if (!callRes || !callRes.result) {
        log('fail', 'no list_concepts response');
        return res(false);
      }
      try {
        const text = callRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = listConceptsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        listPayload = parsed;
        log('ok', `list_concepts — vault total ${parsed.total} nodes (vaultRoot ${parsed.vaultRoot})`);
        if (parsed.total === 0) {
          log('info', 'Warning: vault is empty. Make sure OMOT_VAULT points to the right folder (e.g. ./docs/ontology)');
        }
      } catch (err) {
        log('fail', `failed to parse list_concepts response: ${err.message}`);
        return res(false);
      }

      if (!kindsRes || !kindsRes.result) {
        log('fail', 'no list_kinds response');
        return res(false);
      }
      try {
        const text = kindsRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = listKindsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        kindsPayload = parsed;
        const kindSummary = Object.entries(parsed.byKind)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([kind, count]) => `${kind}:${count}`)
          .join(', ');
        log('ok', `list_kinds — ${parsed.total} nodes (${kindSummary})`);
      } catch (err) {
        log('fail', `failed to parse list_kinds response: ${err.message}`);
        return res(false);
      }

      if (!validateRes || !validateRes.result) {
        log('fail', 'no validate_vault response');
        return res(false);
      }
      try {
        const text = validateRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = validateVaultFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        validationPayload = parsed;
        log('ok', `validate_vault — ${parsed.scanned ?? 0} files, problemFiles ${parsed.summary?.problemFiles ?? 0}`);
      } catch (err) {
        log('fail', `failed to parse validate_vault response: ${err.message}`);
        return res(false);
      }

      if (!briefRes || !briefRes.result) {
        log('fail', 'no query_ontology workspace_brief response');
        return res(false);
      }
      try {
        const text = briefRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = diagnosisBlockingFailure('workspace_brief', parsed, 'workspace_brief');
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `workspace_brief — ${parsed.status} (${parsed.summary?.nodes ?? 0} nodes, nextActions ${(parsed.nextActions || []).length})`);
        const advisory = advisoryNextActionsSummary(parsed.nextActions);
        if (advisory) log('info', `workspace_brief advisory nextActions — ${advisory}`);
      } catch (err) {
        log('fail', `failed to parse workspace_brief response: ${err.message}`);
        return res(false);
      }

      if (!healthRes || !healthRes.result) {
        log('fail', 'no query_ontology health response');
        return res(false);
      }
      try {
        const text = healthRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = diagnosisBlockingFailure('health', parsed, 'health');
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `health — ${parsed.status} (${(parsed.checks || []).length} checks, issues ${diagnosisIssueCount(parsed)})`);
      } catch (err) {
        log('fail', `failed to parse health response: ${err.message}`);
        return res(false);
      }

      if (!compileRes || !compileRes.result) {
        log('fail', 'no compile_ontology response');
        return res(false);
      }
      try {
        const text = compileRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = compileSummaryFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        compilePayload = parsed;
        log('ok', `compile_ontology — graph ${parsed.graphHash.slice(0, 12)} (${parsed.nodeCount} nodes, ${parsed.edgeCount} edges, issues ${parsed.issueCount})`);
      } catch (err) {
        log('fail', `failed to parse compile_ontology response: ${err.message}`);
        return res(false);
      }

      if (!overviewRes || !overviewRes.result) {
        log('fail', 'no query_ontology overview response');
        return res(false);
      }
      try {
        const text = overviewRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = overviewFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        overviewPayload = parsed;
        log('ok', `overview — graph ${parsed.graph.graphHash.slice(0, 12)} (${parsed.graph.nodes} nodes, ${parsed.graph.edges} edges, hubs ${(parsed.hubs || []).length})`);
      } catch (err) {
        log('fail', `failed to parse overview response: ${err.message}`);
        return res(false);
      }

      if (!overviewPlanRes || !overviewPlanRes.result) {
        log('fail', 'no query_ontology overview query_plan response');
        return res(false);
      }
      try {
        const text = overviewPlanRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = overviewQueryPlanFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `overview query_plan — ${parsed.estimate.strategy} (${parsed.estimate.costClass}, nodes ${parsed.estimate.nodeScans}, edges ${parsed.estimate.edgeScans})`);
        const countFailure = verifyCountConsistencyFailure({
          kinds: kindsPayload,
          list: listPayload,
          validation: validationPayload,
          compiled: compilePayload,
          overview: overviewPayload,
        });
        if (countFailure) {
          log('fail', countFailure);
          return res(false);
        }
        res(true);
      } catch (err) {
        log('fail', `failed to parse overview query_plan response: ${err.message}`);
        res(false);
      }
    });

    proc.on('error', (err) => {
      log('fail', `server spawn failed: ${err.message}`);
      res(false);
    });
  });
}

async function main() {
  console.log('\n[oh-my-ontology-mcp verify]\n');
  if (verifyTimeoutMs() === false) {
    log('fail', 'OMOT_VERIFY_TIMEOUT_MS must be a positive integer');
    process.exit(1);
  }
  const ok1 = await step1ParserSmoke();
  if (!ok1) process.exit(1);
  const ok2 = await step2BootAndCall();
  if (!ok2) process.exit(1);
  console.log(`\n\x1b[32mAll passed\x1b[0m — register .mcp.json with Claude Code and restart to use the ${EXPECTED_TOOLS.length} tools.\n`);
  process.exit(0);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
