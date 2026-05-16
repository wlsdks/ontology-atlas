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
 *   5. tools/call validate_vault — whole-vault frontmatter / graph-reference health
 *   6. tools/call query_ontology workspace_brief + health — agent first-contact graph diagnosis
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
  [4, 'validate_vault'],
  [5, 'workspace_brief'],
  [6, 'health'],
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
  const errorCount = warnings.errorCount || 0;
  const warningCount = warnings.warningCount || 0;
  if (errorCount === 0 && warningCount === 0) return null;
  return `list_concepts vaultWarnings present — errors ${errorCount}, warnings ${warningCount}`;
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
  const problemFiles = summary.problemFiles;
  if (problemFiles === 0) return null;
  return `validate_vault found ${problemFiles} problem file(s) — errors ${summary.errorFiles || 0}, warnings ${summary.warningFiles || 0}`;
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
  log('info', `step 2 — server boot + tools/list + list_concepts (vault=${VAULT}, timeout=${timeoutMs}ms)`);

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
      params: { name: 'validate_vault', arguments: {} },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'workspace_brief', limit: 3 } },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'health' } },
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
      const validateRes = responses.find((r) => r.id === 4);
      const briefRes = responses.find((r) => r.id === 5);
      const healthRes = responses.find((r) => r.id === 6);
      const missingResponses = [
        ['initialize', initRes],
        ['tools/list', listRes],
        ['list_concepts', callRes],
        ['validate_vault', validateRes],
        ['workspace_brief', briefRes],
        ['health', healthRes],
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
        log('ok', `list_concepts — vault total ${parsed.total} nodes (vaultRoot ${parsed.vaultRoot})`);
        if (parsed.total === 0) {
          log('info', 'Warning: vault is empty. Make sure OMOT_VAULT points to the right folder (e.g. ./docs/ontology)');
        }
        const failure = vaultWarningsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
      } catch (err) {
        log('fail', `failed to parse list_concepts response: ${err.message}`);
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
        res(true);
      } catch (err) {
        log('fail', `failed to parse health response: ${err.message}`);
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
