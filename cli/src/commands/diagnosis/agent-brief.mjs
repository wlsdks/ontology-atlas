// `ontology-atlas agent-brief [vault]` — Claude Code/Codex handoff snapshot.

import { COLORS } from '../../lib/colors.mjs';
import { callMcpTool } from '../../lib/mcp-bridge/mcp-call.mjs';
import {
  assertAgentBriefResponseShape,
  agentBriefExitCode,
  isCompactContract,
} from '../../lib/query-result-contract/agent-brief/agent-brief.mjs';
import { resolveVaultRoot } from '../../lib/resolve-vault.mjs';
import { stampMomentIfFirst } from '../../lib/telemetry.mjs';
import {
  DEFAULT_FALLBACK_CONCURRENCY,
  DEFAULT_FALLBACK_SLOW_MS,
  DEFAULT_FALLBACK_TIMEOUT_MS,
  FALLBACK_CONCURRENCY_ENV,
  FALLBACK_SLOW_ENV,
  FALLBACK_TIMEOUT_ENV,
  positiveIntegerFromEnv,
  verifyCliFallbacks,
} from './agent-brief/fallback-verification.mjs';
import { formatGraphDbCliPack } from './agent-brief/graph-db-pack.mjs';
import { parseArgs, printUsage } from './agent-brief/parse-args.mjs';
import { render, renderCompact } from './agent-brief/render.mjs';

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
    assertAgentBriefResponseShape(result);
  } catch (error) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
  // Telemetry proxy for an agent reading the vault (lib/telemetry.mjs).
  // Best-effort: a telemetry write failure must never break the brief.
  try {
    stampMomentIfFirst(vaultRoot, { source: 'agent-brief' });
  } catch {
    // local-only instrumentation is advisory; ignore write failures.
  }
  if (verifyFallbacks) {
    const effectiveFallbackTimeoutMs = fallbackTimeoutMs
      ?? positiveIntegerFromEnv(FALLBACK_TIMEOUT_ENV, '--fallback-timeout-ms', DEFAULT_FALLBACK_TIMEOUT_MS);
    const effectiveFallbackSlowMs = fallbackSlowMs
      ?? positiveIntegerFromEnv(FALLBACK_SLOW_ENV, '--fallback-slow-ms', DEFAULT_FALLBACK_SLOW_MS);
    const effectiveFallbackConcurrency = fallbackConcurrency
      ?? positiveIntegerFromEnv(FALLBACK_CONCURRENCY_ENV, '--fallback-concurrency', DEFAULT_FALLBACK_CONCURRENCY);
    const settingError = [effectiveFallbackTimeoutMs, effectiveFallbackSlowMs, effectiveFallbackConcurrency]
      .find((setting) => setting instanceof Error);
    if (settingError) {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${settingError.message}\n`);
      printUsage();
      return 1;
    }
    const report = await verifyCliFallbacks(result, vaultRoot, {
      json,
      timeoutMs: effectiveFallbackTimeoutMs,
      slowThresholdMs: effectiveFallbackSlowMs,
      concurrency: effectiveFallbackConcurrency,
    });
    // --exit-zero silences only the readiness part of the exit code; a fallback command that
    // failed to run is a real failure and still exits non-zero.
    return Math.max(readinessExitCode(result, exitZero), report.failed > 0 ? 1 : 0);
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return readinessExitCode(result, exitZero);
  }
  if (prompt) {
    process.stdout.write(normalizeHandoffPrompt(result).trimEnd() + '\n');
    return readinessExitCode(result, exitZero);
  }
  if (graphDbPack) {
    process.stdout.write(formatGraphDbCliPack(result, vaultRoot).trimEnd() + '\n');
    return readinessExitCode(result, exitZero);
  }
  if (isCompactContract(result)) renderCompact(result);
  else render(result);
  const exitCode = readinessExitCode(result, exitZero);
  /*
   * Exit 1 here means the graph is not ripe, not a failure; say so on the screen that emits it,
   * because people and agents do not reread --help. JSON, prompt and pack output stay machine-only.
   */
  if (exitCode === 1 && !exitZero) {
    process.stdout.write(
      `\n${COLORS.dim}This 1 is not a failure; it means the graph is not ripe yet. ` +
        `Pass --exit-zero to read status/readiness directly.${COLORS.reset}\n`,
    );
  }
  return exitCode;
}

/**
 * The non-zero exit encodes graph readiness, not failure. `--exit-zero` always exits 0 for scripts that
 * read `status`/`readiness` from JSON; parse and MCP-call failures still return 1/2 above.
 */
export function readinessExitCode(result, exitZero) {
  return exitZero ? 0 : agentBriefExitCode(result);
}

// The MCP prompt is generated before the project-meaning overlay is attached, so replace its
// readiness line with this call's categorical result; otherwise it could claim an unassessed graph is ready.
export function normalizeHandoffPrompt(result) {
  const readiness = result?.readiness ?? {};
  const graph = result?.graph ?? {};
  const status = typeof result?.status === 'string' ? result.status : 'unknown';
  const readinessStatus = typeof readiness.status === 'string' ? readiness.status : 'unknown';
  const score = Number.isFinite(readiness.score) ? readiness.score : 0;
  const line = `Current readiness: ${readinessStatus} ${score}/100; graph ${graph.nodes ?? 0} nodes, ${graph.edges ?? 0} edges; status ${status}.`;
  const prompt = typeof result?.handoffPrompt === 'string' ? result.handoffPrompt : '';
  return prompt.replace(/^Current readiness: .*$/m, line);
}
