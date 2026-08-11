// `ontology-atlas agent-brief [vault]` — Claude Code/Codex handoff snapshot.
// MCP `query_ontology({operation: 'agent_brief'})` thin wrapper.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertAgentBriefShape, agentBriefExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { formatUnknownFlagError, parsePositiveIntegerFlag, parseRequiredFlagValue, parseVaultFlag, resolveExclusiveVaultArg } from '../lib/cli-args.mjs';
import { DIAGNOSIS_OPTION_FLAGS, parseDiagnosisOption } from '../lib/diagnosis-options.mjs';
import { diagnosisStatusColor } from '../lib/diagnosis-colors.mjs';
import { stampMomentIfFirst } from '../lib/telemetry.mjs';
import { cliInvocation } from '../lib/self-invocation.mjs';

const CLI_ENTRYPOINT = fileURLToPath(new URL('../index.mjs', import.meta.url));
const ALLOWED_FLAGS = ['--vault', '--project', '--json', '--prompt', '--graph-db-pack', '--verify-fallbacks', '--exit-zero', '--fallback-timeout-ms', '--fallback-slow-ms', '--fallback-concurrency', ...DIAGNOSIS_OPTION_FLAGS];
const DEFAULT_FALLBACK_TIMEOUT_MS = 15_000;
const DEFAULT_FALLBACK_SLOW_MS = 5_000;
const DEFAULT_FALLBACK_CONCURRENCY = 4;
const FALLBACK_TIMEOUT_ENV = 'OATLAS_AGENT_FALLBACK_TIMEOUT_MS';
const FALLBACK_SLOW_ENV = 'OATLAS_AGENT_FALLBACK_SLOW_MS';
const FALLBACK_CONCURRENCY_ENV = 'OATLAS_AGENT_FALLBACK_CONCURRENCY';
const WORKFLOW_GUIDE_PATH = 'docs/AGENT-GRAPH-WORKFLOW.md';

const READINESS_COLORS = {
  ready: COLORS.green,
  needs_attention: COLORS.yellow,
  needs_shape: COLORS.red,
};

export async function runAgentBrief(args) {
  const { vault, json, prompt, graphDbPack, verifyFallbacks, exitZero, fallbackTimeoutMs, fallbackSlowMs, fallbackConcurrency, options, error, help } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }
  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'agent_brief', ...options });
    assertAgentBriefShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  // Slice 0 magic-moment instrumentation (PRODUCT-PLAN-2026-07.md §4/§9) —
  // this CLI command is the cheapest safe proxy for "an agent read the vault
  // and answered" (see lib/telemetry.mjs for why the MCP-side read tools
  // themselves are intentionally NOT instrumented). Best-effort only — a
  // telemetry write failure must never break the actual agent-brief output.
  try {
    stampMomentIfFirst(vaultRoot, { source: 'agent-brief' });
  } catch {
    // local-only instrumentation is advisory; ignore write failures.
  }
  if (verifyFallbacks) {
    const effectiveFallbackTimeoutMs = fallbackTimeoutMs ?? agentFallbackTimeoutMs();
    if (effectiveFallbackTimeoutMs instanceof Error) {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${effectiveFallbackTimeoutMs.message}\n`);
      printUsage();
      return 1;
    }
    const effectiveFallbackSlowMs = fallbackSlowMs ?? agentFallbackSlowMs();
    if (effectiveFallbackSlowMs instanceof Error) {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${effectiveFallbackSlowMs.message}\n`);
      printUsage();
      return 1;
    }
    const effectiveFallbackConcurrency = fallbackConcurrency ?? agentFallbackConcurrency();
    if (effectiveFallbackConcurrency instanceof Error) {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${effectiveFallbackConcurrency.message}\n`);
      printUsage();
      return 1;
    }
    const report = await verifyCliFallbacks(result, vaultRoot, {
      json,
      timeoutMs: effectiveFallbackTimeoutMs,
      slowThresholdMs: effectiveFallbackSlowMs,
      concurrency: effectiveFallbackConcurrency,
    });
    // --exit-zero only silences the readiness-driven part of the exit code
    // (see readinessExitCode below) — an actual failing fallback command is
    // a real command failure, not an advisory readiness signal, so it still
    // exits non-zero even with --exit-zero.
    return Math.max(readinessExitCode(result, exitZero), report.failed > 0 ? 1 : 0);
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return readinessExitCode(result, exitZero);
  }
  if (prompt) {
    process.stdout.write(result.handoffPrompt.trimEnd() + '\n');
    return readinessExitCode(result, exitZero);
  }
  if (graphDbPack) {
    process.stdout.write(formatGraphDbCliPack(result, vaultRoot).trimEnd() + '\n');
    return readinessExitCode(result, exitZero);
  }
  render(result);
  return readinessExitCode(result, exitZero);
}

/**
 * agent-brief's non-zero exit encodes graph *readiness* (`needs_attention` /
 * `needs_shape`), not "the command failed" — the call still ran and printed
 * valid data. Naive `agent-brief && next-step` scripting misreads that as a
 * failure the first time a vault has any warning (agent-persona-2026-07 QA
 * friction #5). `--exit-zero` opts into always exiting 0 for scripting that
 * wants to read `status`/`readiness` from JSON output itself instead of the
 * process exit code — it does not silence real parse/MCP-call failures
 * (those still return 1/2 above, before this is ever reached).
 */
export function readinessExitCode(result, exitZero) {
  return exitZero ? 0 : agentBriefExitCode(result);
}

async function verifyCliFallbacks(result, vaultRoot, { json = false, timeoutMs = DEFAULT_FALLBACK_TIMEOUT_MS, slowThresholdMs = DEFAULT_FALLBACK_SLOW_MS, concurrency = DEFAULT_FALLBACK_CONCURRENCY } = {}) {
  const report = await buildFallbackVerificationReport(result, vaultRoot, { timeoutMs, slowThresholdMs, concurrency });
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report;
  }
  renderFallbackVerificationReport(report);
  return report;
}

async function buildFallbackVerificationReport(result, vaultRoot, { timeoutMs = DEFAULT_FALLBACK_TIMEOUT_MS, slowThresholdMs = DEFAULT_FALLBACK_SLOW_MS, concurrency = DEFAULT_FALLBACK_CONCURRENCY } = {}) {
  const commands = Array.isArray(result.cliFallbackCommands) ? result.cliFallbackCommands : [];
  const startedAt = performance.now();
  const rows = new Array(commands.length);
  const effectiveConcurrency = Math.max(1, Math.min(concurrency, Math.max(1, commands.length)));
  let nextIndex = 0;
  const runNext = async () => {
    while (nextIndex < commands.length) {
      const index = nextIndex;
      nextIndex += 1;
      rows[index] = await verifyOneCliFallback(commands[index], vaultRoot, { timeoutMs, slowThresholdMs });
    }
  };
  await Promise.all(Array.from({ length: effectiveConcurrency }, runNext));
  const wallMs = Math.max(0, Math.round(performance.now() - startedAt));
  const compactRows = rows.filter(Boolean);
  const passed = compactRows.filter((row) => row.status === 'pass').length;
  const failed = compactRows.length - passed;
  const slow = compactRows.filter((row) => row.slow === true).length;
  const totalMs = compactRows.reduce((sum, item) => sum + item.elapsedMs, 0);
  const slowest = compactRows.length > 0
    ? compactRows.reduce((max, item) => (item.elapsedMs > max.elapsedMs ? item : max), compactRows[0])
    : null;
  return {
    operation: 'agent_fallback_check',
    ok: failed === 0,
    performanceOk: slow === 0,
    timeoutMs,
    slowThresholdMs,
    concurrency: effectiveConcurrency,
    total: compactRows.length,
    passed,
    failed,
    slow,
    totalMs,
    wallMs,
    slowest: slowest
      ? {
          command: slowest.command,
          elapsedMs: slowest.elapsedMs,
          status: slowest.status,
        }
      : null,
    commands: compactRows,
  };
}

async function verifyOneCliFallback(raw, vaultRoot, { timeoutMs, slowThresholdMs }) {
    const command = raw.replace('[vault]', vaultRoot);
    const parsed = parseFallbackCommand(command);
    if (parsed.error) {
      return {
        command: raw,
        resolvedCommand: command,
        status: 'fail',
        elapsedMs: 0,
        exitCode: null,
        error: parsed.error,
      };
    }
    const startedAt = performance.now();
    const child = await spawnFallbackCommand(parsed.args, timeoutMs);
    const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
    const timedOut = child.timedOut === true;
    // Fallback CLI commands follow one exit-code convention: exit 2 (or a crash)
    // means the MCP call/parse itself FAILED; exit 1 is an ADVISORY result — the
    // command ran and printed valid data, it just reports a negative/empty or
    // needs-attention answer (health needs_attention, `all-paths`/`explain`/
    // `path`/`cycles` "no path / unrelated / none found", etc.). On a fresh or
    // sparse vault (e.g. the 5-node starter, whose example nodes have no
    // relations yet) those advisory exit-1s are the CORRECT answer, not a run
    // failure. The gate proves the commands EXECUTE, so only a real run failure
    // — timeout, kill signal, spawn error, exit >= 2, or an exit-1 that wrote to
    // stderr (a usage/arg error, not an advisory result on stdout) — fails it.
    // Treating every exit 1 as failure made the documented setup gate impossible
    // to pass on any vault that isn't fully connected and perfectly healthy.
    const wroteToStderr = ((child.stderr ?? '').trim().length > 0);
    const advisoryResult =
      !timedOut &&
      !child.signal &&
      !child.error &&
      child.status === 1 &&
      !wroteToStderr;
    const failed = timedOut || (child.status !== 0 && !advisoryResult);
    const slow = elapsedMs >= slowThresholdMs;
    const sample = failed ? sampleFallbackOutput(child.stderr || child.stdout) : '';
    return {
      command: raw,
      resolvedCommand: command,
      status: failed ? 'fail' : 'pass',
      elapsedMs,
      exitCode: child.status,
      ...(advisoryResult ? { advisory: 'result' } : {}),
      ...(slow ? { slow: true } : {}),
      ...(child.signal ? { signal: child.signal } : {}),
      ...(timedOut ? { timedOut: true } : {}),
      ...(sample ? { outputSample: sample } : {}),
      ...(timedOut ? { error: `fallback command timed out after ${timeoutMs}ms` } : {}),
      ...(!timedOut && child.error ? { error: child.error.message } : {}),
  };
}

function renderFallbackVerificationReport(report) {
  process.stdout.write(`${COLORS.bold}agent fallback check${COLORS.reset} ${COLORS.dim}${report.total} command(s), concurrency ${report.concurrency}, timeout ${report.timeoutMs}ms, slow >= ${report.slowThresholdMs}ms${COLORS.reset}\n`);
  const gateColor = report.ok && report.performanceOk ? COLORS.green : report.ok ? COLORS.yellow : COLORS.red;
  process.stdout.write(
    `${gateColor}setup gate${COLORS.reset} ` +
      `${COLORS.dim}ok=${String(report.ok)} performanceOk=${String(report.performanceOk)} ` +
      `wall=${report.wallMs}ms slow=${report.slow}/${report.total} failed=${report.failed}${COLORS.reset}\n`,
  );
  for (const row of report.commands) {
    const color = row.status === 'fail' ? COLORS.red : row.slow ? COLORS.yellow : COLORS.green;
    const status = row.status === 'pass' && row.slow ? 'SLOW' : row.status.toUpperCase();
    process.stdout.write(`  ${color}${status}${COLORS.reset} ${formatFallbackTiming(row.elapsedMs)} ${row.command}\n`);
    if (row.outputSample) process.stdout.write(`       ${row.outputSample}\n`);
    if (row.error) process.stdout.write(`       ${COLORS.red}${row.error}${COLORS.reset}\n`);
  }
  const color = report.failed > 0 ? COLORS.red : COLORS.green;
  process.stdout.write(`${color}${report.failed > 0 ? 'failed' : 'ok'}${COLORS.reset} ${report.passed}/${report.total} fallback command(s) passed\n`);
  if (report.slow > 0) {
    process.stdout.write(`${COLORS.yellow}slow${COLORS.reset} ${report.slow}/${report.total} fallback command(s) took >= ${report.slowThresholdMs}ms\n`);
  } else {
    process.stdout.write(`${COLORS.green}performance ok${COLORS.reset} 0/${report.total} fallback command(s) took >= ${report.slowThresholdMs}ms\n`);
  }
  if (report.slowest) {
    process.stdout.write(`${COLORS.dim}timing:${COLORS.reset} wall ${report.wallMs}ms; total ${report.totalMs}ms; slowest ${report.slowest.elapsedMs}ms ${report.slowest.command}\n`);
  }
}

function spawnFallbackCommand(args, timeoutMs) {
  return new Promise((resolve) => {
    const maxBuffer = 1024 * 1024 * 8;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawn(process.execPath, [CLI_ENTRYPOINT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    const append = (current, chunk) => {
      if (current.length >= maxBuffer) return current;
      return (current + chunk.toString('utf8')).slice(0, maxBuffer);
    };
    child.stdout?.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout, stderr, error, timedOut });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, timedOut });
    });
  });
}

function agentFallbackTimeoutMs(env = process.env) {
  const raw = env[FALLBACK_TIMEOUT_ENV];
  if (raw == null || raw === '') return DEFAULT_FALLBACK_TIMEOUT_MS;
  const parsed = parsePositiveIntegerFlag(FALLBACK_TIMEOUT_ENV, raw);
  if (parsed instanceof Error) {
    return new Error(`${parsed.message}. Received: ${JSON.stringify(String(raw))}. Set ${FALLBACK_TIMEOUT_ENV}=N or --fallback-timeout-ms N.`);
  }
  return parsed;
}

function agentFallbackSlowMs(env = process.env) {
  const raw = env[FALLBACK_SLOW_ENV];
  if (raw == null || raw === '') return DEFAULT_FALLBACK_SLOW_MS;
  const parsed = parsePositiveIntegerFlag(FALLBACK_SLOW_ENV, raw);
  if (parsed instanceof Error) {
    return new Error(`${parsed.message}. Received: ${JSON.stringify(String(raw))}. Set ${FALLBACK_SLOW_ENV}=N or --fallback-slow-ms N.`);
  }
  return parsed;
}

function agentFallbackConcurrency(env = process.env) {
  const raw = env[FALLBACK_CONCURRENCY_ENV];
  if (raw == null || raw === '') return DEFAULT_FALLBACK_CONCURRENCY;
  const parsed = parsePositiveIntegerFlag(FALLBACK_CONCURRENCY_ENV, raw);
  if (parsed instanceof Error) {
    return new Error(`${parsed.message}. Received: ${JSON.stringify(String(raw))}. Set ${FALLBACK_CONCURRENCY_ENV}=N or --fallback-concurrency N.`);
  }
  return parsed;
}

function formatFallbackTiming(elapsedMs) {
  return `${COLORS.dim}${elapsedMs}ms${COLORS.reset}`;
}

function sampleFallbackOutput(output) {
  return stripAnsi(String(output || ''))
    .split('\n')
    .filter(Boolean)
    .slice(0, 6)
    .join('\n       ');
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

/**
 * 폴백 명령 한 줄에서 **하위 명령 이후**만 뽑는다.
 *
 * 2026-07-29: 이 팩이 찍는 명령이 `ontology-atlas …` 였다. 그 이름은 어디에도
 * 설치되지 않아서(레지스트리 발행 폐기, `docs/DECISIONS.md` 2026-07-27) 19줄
 * 전부 복사하면 `command not found` 였다 — 헤더는 "Run these commands" 라고
 * 적혀 있는데도. `cliInvocation()` 으로 바꾸면서 이 파서도 새 형태를 받아야
 * 한다: `node <abs>/cli/src/index.mjs <sub> …`.
 *
 * 옛 형태도 계속 받는다 — 사용자가 예전 출력을 붙여넣을 수 있고, 여기서
 * 거절하면 `--verify-fallbacks` 가 자기 팩을 못 읽는다.
 */
function parseFallbackCommand(command) {
  const tokens = splitShellWords(command);
  if (tokens.length === 0) return { error: 'empty fallback command' };
  if (tokens[0] === 'ontology-atlas') return { args: tokens.slice(1) };
  // `node <entry> <sub> …` — entry 는 절대 경로일 수도, 상대 경로일 수도 있다.
  if (tokens[0] === 'node' && tokens.length >= 2 && /index\.mjs$/.test(tokens[1])) {
    return { args: tokens.slice(2) };
  }
  return { error: `expected an ontology-atlas CLI command, got ${tokens[0]}` };
}

function formatGraphDbCliPack(result, vaultRoot) {
  const graphDbQueryPack = Array.isArray(result?.graphDbQueryPack) ? result.graphDbQueryPack : [];
  const commands = [];
  const seen = new Set();
  const selfCheckCommand = graphDbWithFlags(`${cliInvocation()} agent-brief ${graphDbShellQuote(vaultRoot)}`, [
    '--verify-fallbacks',
    '--json',
    '--fallback-timeout-ms 15000',
    '--fallback-slow-ms 5000',
    '--fallback-concurrency 4',
  ]);
  for (const item of Array.isArray(graphDbQueryPack) ? graphDbQueryPack : []) {
    for (const command of graphDbPackItemCliCommands(item)) {
      const runnableCommand = command.replaceAll('[vault]', graphDbShellQuote(vaultRoot));
      if (!runnableCommand || seen.has(runnableCommand)) continue;
      seen.add(runnableCommand);
      commands.push({ id: item.id, intent: item.intent, goal: item.goal, command: runnableCommand });
    }
  }
  return [
    '# ontology-atlas Graph DB CLI pack',
    '# Run these commands when the MCP connector is unavailable.',
    `# Feature guide: ${WORKFLOW_GUIDE_PATH} explains CLI-only use, MCP-connected use, graph DB differences, and verification checks.`,
    ...formatModeGuideComments(result),
    '# Self-check first: Claude Code/Codex automation can parse ok, performanceOk, failed, timeoutMs, slowThresholdMs, concurrency, wallMs, slow, commands[].timedOut, commands[].slow, and slowest.elapsedMs.',
    selfCheckCommand,
    '',
    '# The selected vault path is already inserted; plan scans first, keep traversal bounded, and use follow-up evidence before writing.',
    '# Evidence rule: scan rows are candidates, not proof; cite follow-up detail before writing or refactoring.',
    '# Proof checklist: report totalMatches/limited/row count, run node_profile or blast_radius for node rows, run explain/path/relation-check for edge rows, and report evidence.pathsComplete for paths.',
    '',
    ...commands.flatMap(({ id, intent, goal, command }) => [
      `# ${id}`,
      ...graphDbCommentLine('intent', intent),
      ...graphDbCommentLine('goal', goal),
      command,
    ]),
  ].join('\n');
}

function formatModeGuideComments(result) {
  const rows = modeComparisonRows(result);
  if (rows.length === 0) return [];
  return [
    '# Mode guide:',
    ...rows.map((row) => `# - ${row.label}: ${row.gives}`),
  ];
}

function modeComparisonRows(result) {
  return Array.isArray(result?.docs?.modeComparison)
    ? result.docs.modeComparison.filter((row) => row && typeof row.label === 'string' && typeof row.gives === 'string')
    : [];
}

function graphDbCommentLine(label, value) {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return [`# ${label}: ${value.replace(/\s+/g, ' ').trim()}`];
}

function graphDbPackItemCliCommands(item) {
  if (!item || !Array.isArray(item.calls)) return [];
  return item.calls.map(graphDbToolCallCliCommand).filter(Boolean);
}

function graphDbToolCallCliCommand(call) {
  if (!call || call.tool !== 'query_ontology' || !call.arguments) return null;
  const args = call.arguments;
  if (args.operation === 'query_plan') {
    if (args.targetOperation === 'match_nodes') return graphDbMatchNodesCliCommand(args, { plan: true });
    if (args.targetOperation === 'match_edges') return graphDbMatchEdgesCliCommand(args, { plan: true });
    if (args.targetOperation === 'centrality') {
      return graphDbWithFlags(`${cliInvocation()} hubs [vault]`, [
        '--plan',
        graphDbPositiveFlag('--limit', args.limit),
        graphDbCsvFlag('--types', args.types),
      ]);
    }
    if (args.targetOperation === 'all_paths') {
      return graphDbAllPathsCliCommand(args, { plan: true });
    }
    return null;
  }
  if (args.operation === 'facets') {
    return graphDbWithFlags(`${cliInvocation()} facets [vault]`, [graphDbPositiveFlag('--limit', args.limit)]);
  }
  if (args.operation === 'schema') {
    return graphDbWithFlags(`${cliInvocation()} schema [vault]`, [graphDbPositiveFlag('--limit', args.limit)]);
  }
  if (args.operation === 'match_nodes') return graphDbMatchNodesCliCommand(args);
  if (args.operation === 'match_edges') return graphDbMatchEdgesCliCommand(args);
  if (args.operation === 'domain_matrix') {
    return graphDbWithFlags(`${cliInvocation()} domain-matrix [vault]`, [
      graphDbStringFlag('--project', args.project),
      graphDbPositiveFlag('--limit', args.limit),
      graphDbCsvFlag('--types', args.types),
    ]);
  }
  if (args.operation === 'centrality') {
    return graphDbWithFlags(`${cliInvocation()} hubs [vault]`, [
      graphDbPositiveFlag('--limit', args.limit),
      graphDbCsvFlag('--types', args.types),
    ]);
  }
  if (args.operation === 'all_paths') return graphDbAllPathsCliCommand(args, { plan: true });
  if (args.operation === 'explain_relation') {
    const from = graphDbStringArg(args.from, '<from-slug>');
    const to = graphDbStringArg(args.to, '<to-slug>');
    return graphDbWithFlags(`${cliInvocation()} explain ${graphDbShellQuote(from)} ${graphDbShellQuote(to)} [vault]`, [
      graphDbStringFlag('--direction', args.direction),
      graphDbNonNegativeFlag('--max-hops', args.maxHops),
      graphDbCsvFlag('--types', args.types),
      graphDbPositiveFlag('--limit', args.limit),
    ]);
  }
  return null;
}

function graphDbAllPathsCliCommand(args, options = {}) {
  const from = graphDbStringArg(args.from, '<from-slug>');
  const to = graphDbStringArg(args.to, '<to-slug>');
  return graphDbWithFlags(`${cliInvocation()} all-paths ${graphDbShellQuote(from)} ${graphDbShellQuote(to)} [vault]`, [
    options.plan ? '--plan' : null,
    options.plan ? '--force' : null,
    graphDbNonNegativeFlag('--max-hops', args.maxHops),
    graphDbCsvFlag('--types', args.types),
    graphDbPositiveFlag('--search-budget', args.searchBudget),
    graphDbPositiveFlag('--limit', args.limit),
  ]);
}

function graphDbMatchNodesCliCommand(args, options = {}) {
  return graphDbWithFlags(`${cliInvocation()} match-nodes [vault]`, [
    options.plan ? '--plan' : null,
    graphDbStringFlag('--kind', args.kind),
    graphDbStringFlag('--domain', args.domain),
    graphDbStringFlag('--slug-contains', args.slugContains),
    graphDbNonNegativeFlag('--min-degree', args.minDegree),
    graphDbNonNegativeFlag('--max-degree', args.maxDegree),
    graphDbNonNegativeFlag('--min-in-degree', args.minInDegree),
    graphDbNonNegativeFlag('--min-out-degree', args.minOutDegree),
    graphDbBooleanFlag('--has-incoming', args.hasIncoming),
    graphDbBooleanFlag('--has-outgoing', args.hasOutgoing),
    graphDbStringFlag('--sort', args.sort),
    graphDbPositiveFlag('--limit', args.limit),
  ]);
}

function graphDbMatchEdgesCliCommand(args, options = {}) {
  return graphDbWithFlags(`${cliInvocation()} match-edges [vault]`, [
    options.plan ? '--plan' : null,
    graphDbStringFlag('--from', args.from),
    graphDbStringFlag('--to', args.to),
    graphDbStringFlag('--from-kind', args.fromKind),
    graphDbStringFlag('--to-kind', args.toKind),
    graphDbStringFlag('--type', args.type),
    graphDbCsvFlag('--types', args.types),
    graphDbBooleanFlag('--include-external', args.includeExternal),
    graphDbBooleanFlag('--include-unresolved', args.includeUnresolved),
    graphDbPositiveFlag('--limit', args.limit),
  ]);
}

function graphDbWithFlags(command, flags) {
  return [command, ...flags.filter(Boolean)].join(' ');
}

function graphDbStringArg(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function graphDbStringFlag(name, value) {
  return typeof value === 'string' && value.trim() ? `${name} ${graphDbShellQuote(value)}` : null;
}

function graphDbPositiveFlag(name, value) {
  return Number.isInteger(value) && value > 0 ? `${name} ${value}` : null;
}

function graphDbNonNegativeFlag(name, value) {
  return Number.isInteger(value) && value >= 0 ? `${name} ${value}` : null;
}

function graphDbBooleanFlag(name, value) {
  return value === true ? name : null;
}

function graphDbCsvFlag(name, value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.filter((item) => typeof item === 'string' && item.trim().length > 0);
  return values.length > 0 ? `${name} ${values.map(graphDbShellQuote).join(',')}` : null;
}

function graphDbShellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

function splitShellWords(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (quote === "'" && input.slice(i, i + 4) === "'\\''") {
        current += "'";
        i += 3;
      } else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (quote) return [];
  if (current) tokens.push(current);
  return tokens;
}

function render(result) {
  const status = result.status;
  const readiness = result.readiness;
  const graph = result.graph ?? {};
  const sc = diagnosisStatusColor(status, COLORS);
  const rc = READINESS_COLORS[readiness.status] ?? COLORS.dim;
  process.stdout.write(
    `${COLORS.bold}agent brief${COLORS.reset} ${sc}${status}${COLORS.reset}` +
      ` ${COLORS.dim}· readiness ${rc}${readiness.status}${COLORS.reset}` +
      ` ${COLORS.dim}${readiness.score}/100 · ${graph.nodes ?? 0} 노드 · ${graph.edges ?? 0} 관계` +
      ` · ${readiness.healthChecks} health checks${COLORS.reset}\n\n`,
  );

  const projectSourceLines = formatProjectSourceSummary(result.projectSource, result.projectSourceRemedy);
  if (projectSourceLines.length > 0) {
    process.stdout.write(`${COLORS.dim}PROJECT SOURCE${COLORS.reset} ${COLORS.dim}(receipt v${result.projectSource.contractVersion} · ${result.projectSlug})${COLORS.reset}\n`);
    for (const line of projectSourceLines) {
      process.stdout.write(`  ${COLORS.dim}${line}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  const meaningLines = formatMeaningAssessmentSummary(result.meaningAssessment);
  if (meaningLines.length > 0) {
    process.stdout.write(`${COLORS.dim}PROJECT MEANING${COLORS.reset} ${COLORS.dim}(${result.meaningAssessment.contract} · categorical, no score)${COLORS.reset}\n`);
    for (const line of meaningLines) {
      process.stdout.write(`  ${COLORS.dim}${line}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  if (typeof result.handoffPrompt === 'string' && result.handoffPrompt.trim()) {
    process.stdout.write(
      `${COLORS.dim}HANDOFF PROMPT${COLORS.reset} ${COLORS.dim}available in --json as .handoffPrompt for Claude Code/Codex paste-in setup${COLORS.reset}\n\n`,
    );
  }

  const modeRows = modeComparisonRows(result);
  if (modeRows.length > 0) {
    process.stdout.write(`${COLORS.dim}MODE GUIDE${COLORS.reset} ${COLORS.dim}(CLI-only / MCP-connected / Graph DB pack / setup gate)${COLORS.reset}\n`);
    for (const row of modeRows) {
      process.stdout.write(
        `  ${COLORS.bold}${row.label.padEnd(14)}${COLORS.reset}` +
          ` ${COLORS.dim}${row.gives}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const entrypoints = Array.isArray(result.entrypoints) ? result.entrypoints : [];
  if (entrypoints.length > 0) {
    process.stdout.write(`${COLORS.dim}ENTRYPOINTS${COLORS.reset} ${COLORS.dim}(agent가 먼저 볼 고연결 노드)${COLORS.reset}\n`);
    for (let i = 0; i < Math.min(entrypoints.length, 5); i += 1) {
      const node = entrypoints[i];
      const kc = KIND_COLORS[node.kind] || COLORS.dim;
      const titleText = node.title && node.title !== node.slug ? ` ${COLORS.dim}· ${node.title}${COLORS.reset}` : '';
      process.stdout.write(
        `  ${String(i + 1).padStart(2)} ${kc}${node.slug.padEnd(48)}${COLORS.reset}` +
          `${titleText} ${COLORS.dim}deg ${node.degree}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${COLORS.dim}FIRST MCP CALLS${COLORS.reset}\n`);
  for (const call of result.firstCalls) {
    process.stdout.write(`  ${COLORS.cyan}${formatToolCall(call)}${COLORS.reset}\n`);
  }
  process.stdout.write('\n');

  const cliFallbackCommands = Array.isArray(result.cliFallbackCommands) ? result.cliFallbackCommands : [];
  if (cliFallbackCommands.length > 0) {
    process.stdout.write(`${COLORS.dim}CLI FALLBACKS${COLORS.reset} ${COLORS.dim}(MCP connector unavailable)${COLORS.reset}\n`);
    for (const command of cliFallbackCommands) {
      process.stdout.write(`  ${COLORS.cyan}${command}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  const graphDbQueryPack = Array.isArray(result.graphDbQueryPack) ? result.graphDbQueryPack : [];
  if (graphDbQueryPack.length > 0) {
    process.stdout.write(`${COLORS.dim}GRAPH DB QUERY PACK${COLORS.reset} ${COLORS.dim}(MCP + CLI fallback)${COLORS.reset}\n`);
    for (const item of graphDbQueryPack) {
      const calls = item.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(`  ${COLORS.bold}${item.id}${COLORS.reset} ${COLORS.dim}${item.intent}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.dim}${item.goal}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.cyan}${calls}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${COLORS.dim}PLAYBOOKS${COLORS.reset}\n`);
  for (const playbook of result.playbooks) {
    const calls = playbook.calls.map((call) => call.arguments.operation).join(' → ');
    process.stdout.write(`  ${COLORS.bold}${playbook.id}${COLORS.reset} ${COLORS.dim}${calls}${COLORS.reset}\n`);
    process.stdout.write(`     ${COLORS.dim}${playbook.goal}${COLORS.reset}\n`);
    renderChecklist('evidence', playbook.evidence, COLORS.green);
    renderChecklist('stop if', playbook.stopWhen, COLORS.yellow);
  }
  process.stdout.write('\n');

  if (Array.isArray(result.traversalStrategy) && result.traversalStrategy.length > 0) {
    process.stdout.write(`${COLORS.dim}TRAVERSAL STRATEGY${COLORS.reset}\n`);
    for (const strategy of result.traversalStrategy) {
      const calls = strategy.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(
        `  ${COLORS.bold}${String(strategy.id).padEnd(24)}${COLORS.reset}` +
          ` ${COLORS.dim}${strategy.priority} · ${strategy.goal}${COLORS.reset}\n`,
      );
      process.stdout.write(`     ${COLORS.dim}when: ${strategy.useWhen}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.cyan}${calls}${COLORS.reset}\n`);
      renderChecklist('evidence', strategy.evidence, COLORS.green);
      renderChecklist('stop if', strategy.stopWhen, COLORS.yellow);
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.writeGuardrails) && result.writeGuardrails.length > 0) {
    process.stdout.write(`${COLORS.dim}WRITE GUARDRAILS${COLORS.reset}\n`);
    for (const guardrail of result.writeGuardrails) {
      const calls = guardrail.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(`  ${COLORS.bold}${guardrail.id}${COLORS.reset} ${COLORS.dim}${calls}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.dim}${guardrail.goal}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.relationDecisionGuide) && result.relationDecisionGuide.length > 0) {
    process.stdout.write(`${COLORS.dim}RELATION DECISION GUIDE${COLORS.reset}\n`);
    for (const row of result.relationDecisionGuide) {
      const color = row.severity === 'warn' ? COLORS.yellow : COLORS.dim;
      process.stdout.write(
        `  ${color}${row.decision.padEnd(18)}${COLORS.reset} ${COLORS.dim}${row.meaning}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.resultContracts) && result.resultContracts.length > 0) {
    process.stdout.write(`${COLORS.dim}RESULT CONTRACTS${COLORS.reset}\n`);
    for (const contract of result.resultContracts) {
      const fields = Array.isArray(contract.mustReport) ? contract.mustReport.join(', ') : '';
      process.stdout.write(
        `  ${COLORS.cyan}${String(contract.operation).padEnd(14)}${COLORS.reset}` +
          ` ${COLORS.dim}report ${fields}; ${contract.policy}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const checks = Array.isArray(result.health?.checks) ? result.health.checks : [];
  if (checks.length > 0) {
    const summary = checks.map((check) => `${check.id}:${check.status}:${check.count}`).join(', ');
    process.stdout.write(`${COLORS.dim}HEALTH CHECKS${COLORS.reset} ${COLORS.dim}${summary}${COLORS.reset}\n`);
  }

  const next = Array.isArray(result.nextActions) ? result.nextActions : [];
  if (next.length > 0) {
    process.stdout.write(`${COLORS.dim}NEXT ACTIONS${COLORS.reset} ${COLORS.dim}${next.map((action) => `${action.id}:${action.severity}`).join(', ')}${COLORS.reset}\n`);
  }

  process.stdout.write(`${COLORS.dim}WRITE POLICY${COLORS.reset}\n`);
  for (const policy of result.writePolicy) {
    process.stdout.write(`  ${COLORS.dim}- ${policy}${COLORS.reset}\n`);
  }
}

/**
 * The diagnosis and the command that resolves it, on the same block. A named
 * `nextAction` with nothing to run is what this readout used to print.
 */
export function formatProjectSourceSummary(projectSource, remedy = null) {
  if (!projectSource || typeof projectSource !== 'object') return [];
  const gap = projectSource.topGap?.id
    ? `${projectSource.topGap.id}${projectSource.topGap.nodeSlug ? `:${projectSource.topGap.nodeSlug}` : ''}`
    : 'none';
  const action = projectSource.nextAction?.id
    ? `${projectSource.nextAction.id}${projectSource.nextAction.target ? `:${projectSource.nextAction.target}` : ''}`
    : 'none';
  const lines = [
    `status       ${projectSource.status} (${projectSource.currentness})`,
    `measuredAt   ${projectSource.measuredAt ?? 'not measured'}`,
    `topGap       ${gap}`,
    `nextAction   ${action}`,
  ];
  if (remedy?.resolvable && remedy.cli?.command) {
    lines.push(`run          ${cliInvocation()} ${remedy.cli.command} ${(remedy.cli.args ?? []).join(' ')}`.trimEnd());
  }
  return lines;
}

export function formatMeaningAssessmentSummary(assessment) {
  if (!assessment || typeof assessment !== 'object') return [];
  const structure = assessment.dimensions?.structure?.status ?? 'invalid';
  const competency = assessment.dimensions?.competency?.status ?? 'needs_evidence';
  const sourceStatus = assessment.dimensions?.source?.status ?? 'invalid';
  const sourceCurrentness = assessment.dimensions?.source?.currentness ?? 'unavailable';
  const gap = assessment.topGap?.id
    ? `${assessment.topGap.dimension ?? 'assessment'}:${assessment.topGap.id}`
    : 'none';
  const action = assessment.nextAction?.id
    ? `${assessment.nextAction.id}${assessment.nextAction.target ? `:${assessment.nextAction.target}` : ''}`
    : 'none';
  return [
    `status       ${assessment.status}`,
    `dimensions   structure:${structure} · competency:${competency} · source:${sourceStatus}/${sourceCurrentness}`,
    `topGap       ${gap}`,
    `nextAction   ${action}`,
  ];
}

function renderChecklist(label, items, color) {
  if (!Array.isArray(items) || items.length === 0) return;
  process.stdout.write(`     ${color}${label}:${COLORS.reset} ${COLORS.dim}${items[0]}${COLORS.reset}\n`);
  for (const item of items.slice(1)) {
    process.stdout.write(`       ${COLORS.dim}- ${item}${COLORS.reset}\n`);
  }
}

function formatToolCall(call) {
  return `${call.tool}(${JSON.stringify(call.arguments)})`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    prompt: false,
    graphDbPack: false,
    verifyFallbacks: false,
    exitZero: false,
    fallbackTimeoutMs: null,
    fallbackTimeoutRaw: null,
    fallbackSlowMs: null,
    fallbackSlowRaw: null,
    fallbackConcurrency: null,
    fallbackConcurrencyRaw: null,
  };
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const [maybeFlag, maybeValue] = a.includes('=') ? a.split(/=(.*)/s, 2) : [a, null];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--project') {
      const project = parseRequiredFlagValue('--project', args[++i]);
      if (project instanceof Error) return { error: project.message };
      options.project = project;
    }
    else if (a.startsWith('--project=')) {
      const project = parseRequiredFlagValue('--project', a.slice('--project='.length));
      if (project instanceof Error) return { error: project.message };
      options.project = project;
    }
    else if (a === '--json') flags.json = true;
    else if (a === '--prompt') flags.prompt = true;
    else if (a === '--graph-db-pack') flags.graphDbPack = true;
    else if (a === '--verify-fallbacks') flags.verifyFallbacks = true;
    else if (a === '--exit-zero') flags.exitZero = true;
    else if (a === '--fallback-timeout-ms') {
      flags.fallbackTimeoutRaw = args[i + 1];
      flags.fallbackTimeoutMs = parsePositiveIntegerFlag('--fallback-timeout-ms', args[++i]);
    }
    else if (a.startsWith('--fallback-timeout-ms=')) {
      flags.fallbackTimeoutRaw = a.slice('--fallback-timeout-ms='.length);
      flags.fallbackTimeoutMs = parsePositiveIntegerFlag('--fallback-timeout-ms', flags.fallbackTimeoutRaw);
    }
    else if (a === '--fallback-slow-ms') {
      flags.fallbackSlowRaw = args[i + 1];
      flags.fallbackSlowMs = parsePositiveIntegerFlag('--fallback-slow-ms', args[++i]);
    }
    else if (a.startsWith('--fallback-slow-ms=')) {
      flags.fallbackSlowRaw = a.slice('--fallback-slow-ms='.length);
      flags.fallbackSlowMs = parsePositiveIntegerFlag('--fallback-slow-ms', flags.fallbackSlowRaw);
    }
    else if (a === '--fallback-concurrency') {
      flags.fallbackConcurrencyRaw = args[i + 1];
      flags.fallbackConcurrency = parsePositiveIntegerFlag('--fallback-concurrency', args[++i]);
    }
    else if (a.startsWith('--fallback-concurrency=')) {
      flags.fallbackConcurrencyRaw = a.slice('--fallback-concurrency='.length);
      flags.fallbackConcurrency = parsePositiveIntegerFlag('--fallback-concurrency', flags.fallbackConcurrencyRaw);
    }
    else if (DIAGNOSIS_OPTION_FLAGS.includes(a)) {
      const error = parseDiagnosisOption(options, a, args[++i]);
      if (error) return { error: error.message };
    } else if (DIAGNOSIS_OPTION_FLAGS.includes(maybeFlag)) {
      const error = parseDiagnosisOption(options, maybeFlag, maybeValue);
      if (error) return { error: error.message };
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  const outputFlags = [
    ['--json', flags.json],
    ['--prompt', flags.prompt],
    ['--graph-db-pack', flags.graphDbPack],
  ].filter(([, enabled]) => enabled);
  if (outputFlags.length > 1) {
    return { error: `${outputFlags.map(([name]) => name).join(' and ')} cannot be used together` };
  }
  if (flags.verifyFallbacks && (flags.prompt || flags.graphDbPack)) {
    return { error: `--verify-fallbacks cannot be used with ${outputFlags.map(([name]) => name).join(' or ')}` };
  }
  if (flags.fallbackTimeoutMs instanceof Error) {
    return {
      error: `${flags.fallbackTimeoutMs.message}. Received: ${JSON.stringify(String(flags.fallbackTimeoutRaw))}. Set --fallback-timeout-ms N or ${FALLBACK_TIMEOUT_ENV}=N.`,
    };
  }
  if (flags.fallbackSlowMs instanceof Error) {
    return {
      error: `${flags.fallbackSlowMs.message}. Received: ${JSON.stringify(String(flags.fallbackSlowRaw))}. Set --fallback-slow-ms N or ${FALLBACK_SLOW_ENV}=N.`,
    };
  }
  if (flags.fallbackConcurrency instanceof Error) {
    return {
      error: `${flags.fallbackConcurrency.message}. Received: ${JSON.stringify(String(flags.fallbackConcurrencyRaw))}. Set --fallback-concurrency N or ${FALLBACK_CONCURRENCY_ENV}=N.`,
    };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, prompt: flags.prompt, graphDbPack: flags.graphDbPack, verifyFallbacks: flags.verifyFallbacks, exitZero: flags.exitZero, fallbackTimeoutMs: flags.fallbackTimeoutMs, fallbackSlowMs: flags.fallbackSlowMs, fallbackConcurrency: flags.fallbackConcurrency, options };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas agent-brief [vault] [--json|--prompt|--graph-db-pack|--verify-fallbacks]\n` +
      `       [--project SLUG] [--exit-zero]\n` +
      `       [--dependency-types A,B] [--component-types A,B]\n` +
      `       [--fallback-timeout-ms N] [--fallback-slow-ms N] [--fallback-concurrency N]\n` +
      `       [--component-limit N] [--cycle-limit N] [--recommendation-limit N]\n` +
      `       [--order-limit N] [--node-limit N]\n\n` +
      `Claude Code/Codex handoff: readiness score, copyable handoffPrompt, graph entrypoints,\n` +
      `first MCP calls, investigation playbooks, traversal strategy, health coverage, and read-first write policy.\n` +
      `Use --json for repeatable agent handoff snapshots; use --prompt to print only .handoffPrompt.\n` +
      `Use --graph-db-pack to print only executable CLI graph scan commands for connector-less sessions.\n` +
      `Use --verify-fallbacks to execute the generated CLI fallback commands against this vault; combine with --json for a machine-readable timing report.\n` +
      `Use --fallback-timeout-ms N or ${FALLBACK_TIMEOUT_ENV}=N to bound each fallback command.\n` +
      `Use --fallback-slow-ms N or ${FALLBACK_SLOW_ENV}=N to mark slow-but-passing fallback rows in JSON and human output.\n` +
      `Use --fallback-concurrency N or ${FALLBACK_CONCURRENCY_ENV}=N to run fallback checks in a bounded parallel queue.\n\n` +
      `${COLORS.bold}Exit code${COLORS.reset} (readiness signal, not success/failure):\n` +
      `  0 = ready and healthy. 1 = the command ran and printed valid data, but graph\n` +
      `  readiness is "needs_attention"/"needs_shape", a health check failed, or a\n` +
      `  fail-severity nextAction is present: this is advisory graph state, NOT a\n` +
      `  command failure. 2 = the MCP call itself failed (parse/connection error).\n` +
      `  Naive \`agent-brief && next-step\` scripting misreads exit 1 as failure the\n` +
      `  first time a vault has any warning: pass --exit-zero to always exit 0 and\n` +
      `  read readiness/status from the JSON output instead (parse/MCP-call errors\n` +
      `  still exit 1/2 even with --exit-zero: only the readiness-driven part is silenced).\n` +
      `  --verify-fallbacks --exit-zero still exits 1 when a generated fallback command\n` +
      `  itself fails to run: that is a real failure, not a readiness signal.\n\n` +
      `Tuning flags forward to query_ontology agent_brief for focused diagnostics.\n`,
  );
}
