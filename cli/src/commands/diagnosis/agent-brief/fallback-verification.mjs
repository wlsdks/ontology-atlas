import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { COLORS } from '../../../lib/colors.mjs';
import { parsePositiveIntegerFlag } from '../../../lib/cli-args.mjs';
import { splitShellWords } from './shell-words.mjs';

const CLI_ENTRYPOINT = fileURLToPath(new URL('../../../index.mjs', import.meta.url));

export const DEFAULT_FALLBACK_TIMEOUT_MS = 15_000;
export const DEFAULT_FALLBACK_SLOW_MS = 5_000;
export const DEFAULT_FALLBACK_CONCURRENCY = 4;
export const FALLBACK_TIMEOUT_ENV = 'OATLAS_AGENT_FALLBACK_TIMEOUT_MS';
export const FALLBACK_SLOW_ENV = 'OATLAS_AGENT_FALLBACK_SLOW_MS';
export const FALLBACK_CONCURRENCY_ENV = 'OATLAS_AGENT_FALLBACK_CONCURRENCY';

export async function verifyCliFallbacks(result, vaultRoot, { json = false, timeoutMs = DEFAULT_FALLBACK_TIMEOUT_MS, slowThresholdMs = DEFAULT_FALLBACK_SLOW_MS, concurrency = DEFAULT_FALLBACK_CONCURRENCY } = {}) {
  const report = await buildFallbackVerificationReport(result, vaultRoot, { timeoutMs, slowThresholdMs, concurrency });
  if (json) {
    /*
     * The readiness result sets the exit code and the report has no `status`/`readiness`, so it
     * travels with it.
     */
    process.stdout.write(JSON.stringify(fallbackReportPayload(report, result), null, 2) + '\n');
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
  const { passed, failed, slow, totalMs, slowest } = summarizeFallbackRows(compactRows);
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
    const { advisoryResult, failed } = judgeFallbackExit(child);
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

/**
 * Exit 2 (or a crash) means the MCP call failed; exit 1 is an advisory answer (no path, needs
 * attention) that is correct on a sparse vault. Only a timeout, signal, spawn error, exit >= 2,
 * or an exit 1 that wrote to stderr fails the gate.
 */
export function judgeFallbackExit(child) {
  const timedOut = child.timedOut === true;
  const wroteToStderr = ((child.stderr ?? '').trim().length > 0);
  const advisoryResult =
    !timedOut &&
    !child.signal &&
    !child.error &&
    child.status === 1 &&
    !wroteToStderr;
  const failed = timedOut || (child.status !== 0 && !advisoryResult);
  return { advisoryResult, failed };
}

export function summarizeFallbackRows(compactRows) {
  const passed = compactRows.filter((row) => row.status === 'pass').length;
  const failed = compactRows.length - passed;
  const slow = compactRows.filter((row) => row.slow === true).length;
  const totalMs = compactRows.reduce((sum, item) => sum + item.elapsedMs, 0);
  const slowest = compactRows.length > 0
    ? compactRows.reduce((max, item) => (item.elapsedMs > max.elapsedMs ? item : max), compactRows[0])
    : null;
  return { passed, failed, slow, totalMs, slowest };
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

export function positiveIntegerFromEnv(envName, flagName, defaultValue, env = process.env) {
  const raw = env[envName];
  if (raw == null || raw === '') return defaultValue;
  const parsed = parsePositiveIntegerFlag(envName, raw);
  if (parsed instanceof Error) {
    return new Error(`${parsed.message}. Received: ${JSON.stringify(String(raw))}. Set ${envName}=N or ${flagName} N.`);
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
 * Extracts the args after the subcommand from `node <abs>/cli/src/index.mjs <sub>` or legacy
 * `ontology-atlas <sub>`.
 */
export function parseFallbackCommand(command) {
  const tokens = splitShellWords(command);
  if (tokens.length === 0) return { error: 'empty fallback command' };
  if (tokens[0] === 'ontology-atlas') return { args: tokens.slice(1) };
  if (tokens[0] === 'node' && tokens.length >= 2 && /index\.mjs$/.test(tokens[1])) {
    return { args: tokens.slice(2) };
  }
  return { error: `expected an ontology-atlas CLI command, got ${tokens[0]}` };
}

/**
 * What `--verify-fallbacks` prints as JSON. Pure, so the invariant is testable without
 * `mcp/node_modules`, which the fastest CI job does not install.
 */
export function fallbackReportPayload(report, result) {
  return { ...report, status: result?.status ?? null, readiness: result?.readiness ?? null };
}
