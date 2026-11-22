import { COLORS } from '../../../lib/colors.mjs';
import { formatUnknownFlagError, parsePositiveIntegerFlag, parseRequiredFlagValue, parseVaultFlag, resolveExclusiveVaultArg } from '../../../lib/cli-args.mjs';
import { DIAGNOSIS_OPTION_FLAGS, parseDiagnosisOption } from '../../../lib/diagnosis/diagnosis-options.mjs';
import { FALLBACK_CONCURRENCY_ENV, FALLBACK_SLOW_ENV, FALLBACK_TIMEOUT_ENV } from './fallback-verification.mjs';

const ALLOWED_FLAGS = ['--vault', '--project', '--compact', '--task', '--json', '--prompt', '--graph-db-pack', '--verify-fallbacks', '--exit-zero', '--fallback-timeout-ms', '--fallback-slow-ms', '--fallback-concurrency', ...DIAGNOSIS_OPTION_FLAGS];

export function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    prompt: false,
    graphDbPack: false,
    verifyFallbacks: false,
    exitZero: false,
    compact: false,
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
    else if (a === '--compact') {
      flags.compact = true;
      options.detail = 'compact';
    }
    else if (a === '--task') {
      const task = parseRequiredFlagValue('--task', args[++i]);
      if (task instanceof Error) return { error: task.message };
      options.task = task;
    }
    else if (a.startsWith('--task=')) {
      const task = parseRequiredFlagValue('--task', a.slice('--task='.length));
      if (task instanceof Error) return { error: task.message };
      options.task = task;
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
  if (flags.compact && !options.task) {
    return { error: '--compact requires --task TEXT' };
  }
  if (!flags.compact && options.task) {
    return { error: '--task is only valid with --compact' };
  }
  if (flags.compact && (flags.verifyFallbacks || flags.graphDbPack)) {
    return { error: `--compact cannot be used with ${flags.verifyFallbacks ? '--verify-fallbacks' : '--graph-db-pack'}` };
  }
  for (const [flag, value, raw, envName] of [
    ['--fallback-timeout-ms', flags.fallbackTimeoutMs, flags.fallbackTimeoutRaw, FALLBACK_TIMEOUT_ENV],
    ['--fallback-slow-ms', flags.fallbackSlowMs, flags.fallbackSlowRaw, FALLBACK_SLOW_ENV],
    ['--fallback-concurrency', flags.fallbackConcurrency, flags.fallbackConcurrencyRaw, FALLBACK_CONCURRENCY_ENV],
  ]) {
    if (value instanceof Error) {
      return { error: `${value.message}. Received: ${JSON.stringify(String(raw))}. Set ${flag} N or ${envName}=N.` };
    }
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, prompt: flags.prompt, graphDbPack: flags.graphDbPack, verifyFallbacks: flags.verifyFallbacks, exitZero: flags.exitZero, fallbackTimeoutMs: flags.fallbackTimeoutMs, fallbackSlowMs: flags.fallbackSlowMs, fallbackConcurrency: flags.fallbackConcurrency, options };
}

export function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas agent-brief [vault] [--json|--prompt|--graph-db-pack|--verify-fallbacks]\n` +
      `       [--project SLUG] [--compact --task TEXT] [--exit-zero]\n` +
      `       [--dependency-types A,B] [--component-types A,B]\n` +
      `       [--fallback-timeout-ms N] [--fallback-slow-ms N] [--fallback-concurrency N]\n` +
      `       [--component-limit N] [--cycle-limit N] [--recommendation-limit N]\n` +
      `       [--order-limit N] [--node-limit N]\n\n` +
      `Claude Code/Codex handoff: readiness score, copyable handoffPrompt, graph entrypoints,\n` +
      `first MCP calls, investigation playbooks, traversal strategy, health coverage, and read-first write policy.\n` +
      `Use --json for repeatable agent handoff snapshots; use --prompt to print only .handoffPrompt.\n` +
      `Use --compact --task TEXT for the request-local, selected-project handoff: --json prints its structure and --prompt its text, together at most 12000 UTF-8 bytes.\n` +
      `Compact v3 verifies reviewed path#symbol/test coordinates only against current bound source; stale, missing, ambiguous, or unsafe evidence returns no exact target.\n` +
      `Compact task text is not persisted and selects recorded evidence only; it never proves source behavior.\n` +
      `The current complete response remains the default while compact mode is qualified.\n` +
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
