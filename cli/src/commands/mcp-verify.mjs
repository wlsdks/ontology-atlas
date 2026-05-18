// `oh-my-ontology mcp-verify [vault]` — run the MCP package verify CLI
// against the resolved vault. This gives installed CLI users the same
// first-contact MCP check without knowing the mcp package's internal path.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { formatUnknownFlagError, parsePositiveIntegerFlag, parseVaultFlag, resolveExclusiveVaultArg } from '../lib/cli-args.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const ALLOWED_FLAGS = ['--vault', '--timeout-ms'];
const DEFAULT_VERIFY_TIMEOUT_MS = 8_000;
const DEFAULT_VERIFY_KILL_GRACE_MS = 1_000;

const COLORS = {
  red: '\x1b[31m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runMcpVerify(args) {
  const { vault, timeoutMs, error, help } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage(process.stderr);
    return 1;
  }
  const envTimeoutError = mcpVerifyEnvTimeoutError(timeoutMs, process.env.OMOT_VERIFY_TIMEOUT_MS, vault);
  if (envTimeoutError) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${envTimeoutError}\n`);
    printUsage(process.stderr);
    return 1;
  }
  const envKillGraceError = mcpVerifyEnvKillGraceError(process.env.OMOT_VERIFY_KILL_GRACE_MS);
  if (envKillGraceError) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${envKillGraceError}\n`);
    printUsage(process.stderr);
    return 1;
  }

  const vaultRoot = resolveVaultRoot(vault);
  let verifyScript;
  try {
    verifyScript = resolveVerifyScript();
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  return runVerifyScript(verifyScript, vaultRoot, timeoutMs, vault);
}

function resolveVerifyScript() {
  const envPath = process.env.OMOT_MCP_VERIFY_PATH;
  if (envPath) {
    if (isFile(envPath)) return envPath;
    if (existsSync(envPath)) throw new Error(`OMOT_MCP_VERIFY_PATH is not a file: ${envPath}`);
    throw new Error(`OMOT_MCP_VERIFY_PATH does not exist: ${envPath}`);
  }

  const monoDev = resolve(__dirname, '../../../mcp/scripts/verify.mjs');
  if (existsSync(monoDev)) return monoDev;

  try {
    return require_.resolve('oh-my-ontology-mcp/scripts/verify.mjs');
  } catch {
    throw new Error(
      'oh-my-ontology-mcp verify script not found. Install oh-my-ontology-mcp or set OMOT_MCP_VERIFY_PATH.',
    );
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function runVerifyScript(verifyScript, vaultRoot, timeoutMs, vaultArg) {
  return new Promise((resolveP) => {
    const verifyWaitMs = mcpVerifyEffectiveTimeoutMs(timeoutMs, process.env);
    const killGraceMs = mcpVerifyEffectiveKillGraceMs(process.env);
    const wrapperTimeoutMs = verifyWaitMs + killGraceMs;
    let settled = false;
    let exited = false;
    let wrapperTimedOut = false;
    let killTimer = null;
    let timeoutTimer = null;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolveP(code);
    };
    const proc = spawn(process.execPath, [verifyScript], {
      env: {
        ...process.env,
        OMOT_VAULT: vaultRoot,
        OMOT_VERIFY_RETRY_EXAMPLE: mcpVerifyRetryExample(vaultArg),
        ...(timeoutMs ? { OMOT_VERIFY_TIMEOUT_MS: String(timeoutMs) } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (b) => process.stdout.write(b));
    proc.stderr.on('data', (b) => process.stderr.write(b));
    timeoutTimer = setTimeout(() => {
      wrapperTimedOut = true;
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  MCP verify wrapper timed out after ${wrapperTimeoutMs}ms. ` +
        'Check OMOT_MCP_VERIFY_PATH or increase --timeout-ms / OMOT_VERIFY_TIMEOUT_MS.\n',
      );
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!exited) proc.kill('SIGKILL');
      }, killGraceMs);
      killTimer.unref?.();
    }, wrapperTimeoutMs);
    timeoutTimer.unref?.();
    proc.on('close', (code, signal) => {
      exited = true;
      if (!wrapperTimedOut && signal) {
        process.stderr.write(
          `${COLORS.red}error${COLORS.reset}  MCP verify script terminated by ${signal}. ` +
          'Check OMOT_MCP_VERIFY_PATH or rerun with --timeout-ms 15000 for slower vaults.\n',
        );
      }
      finish(code ?? 1);
    });
    proc.on('error', (err) => {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${err.message}\n`);
      finish(2);
    });
  });
}

function mcpVerifyRetryExample(vaultArg) {
  const vaultPart = vaultArg && vaultArg !== '.' ? ` --vault ${shellArg(vaultArg)}` : '';
  return `oh-my-ontology mcp-verify${vaultPart} --timeout-ms 15000`;
}

function shellArg(value) {
  const raw = String(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(raw)) return raw;
  return `'${raw.replaceAll("'", "'\\''")}'`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, timeoutMs: null, timeoutMsRaw: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--timeout-ms') {
      flags.timeoutMsRaw = args[i + 1];
      flags.timeoutMs = parsePositiveIntegerFlag('--timeout-ms', args[++i]);
    }
    else if (a.startsWith('--timeout-ms=')) {
      flags.timeoutMsRaw = a.slice('--timeout-ms='.length);
      flags.timeoutMs = parsePositiveIntegerFlag('--timeout-ms', flags.timeoutMsRaw);
    }
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (flags.timeoutMs instanceof Error) {
    const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
    return {
      error: mcpVerifyTimeoutValueErrorMessage(
        flags.timeoutMs.message,
        flags.timeoutMsRaw,
        vaultResult.error ? null : vaultResult.vault,
      ),
    };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, timeoutMs: flags.timeoutMs };
}

function mcpVerifyTimeoutValueErrorMessage(reason, value, vaultArg = null) {
  const received = value == null ? 'undefined' : JSON.stringify(String(value));
  return [
    `${reason}.`,
    `Received: ${received}.`,
    'Set --timeout-ms N or OMOT_VERIFY_TIMEOUT_MS=N.',
    `Example: ${mcpVerifyRetryExample(vaultArg)}`,
  ].join(' ');
}

function mcpVerifyEnvTimeoutError(timeoutMs, rawValue, vaultArg = null) {
  if (timeoutMs != null || rawValue == null || rawValue === '') return null;
  const parsed = parsePositiveIntegerFlag('OMOT_VERIFY_TIMEOUT_MS', rawValue);
  if (!(parsed instanceof Error)) return null;
  return mcpVerifyTimeoutValueErrorMessage(parsed.message, rawValue, vaultArg);
}

function mcpVerifyEffectiveTimeoutMs(timeoutMs, env = process.env) {
  if (timeoutMs != null) return timeoutMs;
  const rawValue = env.OMOT_VERIFY_TIMEOUT_MS;
  if (rawValue == null || rawValue === '') return DEFAULT_VERIFY_TIMEOUT_MS;
  const parsed = parsePositiveIntegerFlag('OMOT_VERIFY_TIMEOUT_MS', rawValue);
  return parsed instanceof Error ? DEFAULT_VERIFY_TIMEOUT_MS : parsed;
}

function mcpVerifyEffectiveKillGraceMs(env = process.env) {
  const rawValue = env.OMOT_VERIFY_KILL_GRACE_MS;
  if (rawValue == null || rawValue === '') return DEFAULT_VERIFY_KILL_GRACE_MS;
  const parsed = parsePositiveIntegerFlag('OMOT_VERIFY_KILL_GRACE_MS', rawValue);
  return parsed instanceof Error ? DEFAULT_VERIFY_KILL_GRACE_MS : parsed;
}

function mcpVerifyEnvKillGraceError(rawValue) {
  if (rawValue == null || rawValue === '') return null;
  const parsed = parsePositiveIntegerFlag('OMOT_VERIFY_KILL_GRACE_MS', rawValue);
  if (!(parsed instanceof Error)) return null;
  const received = JSON.stringify(String(rawValue));
  return [
    `${parsed.message}.`,
    `Received: ${received}.`,
    'Set OMOT_VERIFY_KILL_GRACE_MS=N.',
  ].join(' ');
}

function printUsage(output = process.stderr) {
  output.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology mcp-verify [vault] [--timeout-ms N]\n` +
      `  oh-my-ontology mcp-verify --vault path --timeout-ms 15000\n\n` +
      `Runs the MCP package verify CLI against the resolved vault.\n` +
      `Timeout cleanup sends SIGTERM and then SIGKILL; set OMOT_VERIFY_KILL_GRACE_MS=N only when the post-timeout cleanup window needs explicit tuning.\n` +
      `Checks parser smoke, server boot, tool inventory (missing/extra/duplicate/invalid names), list/project probe/get_concept/get_concepts/find_evidence/find_backlinks/query_concepts/limited query_concepts/analyze_repo_structure/infer_imports/find_neighbors/find_path/find_orphans/node census/file validation, workspace health,\n` +
      `compile_ontology summary + paginated full-artifact + indexed full-artifact smoke, overview, overview/project_map query_plan, and neighbors/node-to-project path/project_scope graph-query smoke.\n` +
      `Node census is cross-checked across list_kinds/list_concepts/compile_ontology/overview; validate_vault.scanned stays file-level health.\n` +
      `Successful output prints read census consistency so users can see the listing/compiler/overview read surfaces agree.\n` +
      `Also checks tools/list inventory names, schema strictness, and annotation coverage (title/read/write/destructive/idempotent/local-only), destructive writer dry-runs with every planned response present and no changed/postWriteMaintenance, patch_concept stale expected_mtime conflict guard rejection with vault_conflict, write-tool postWriteMaintenance byPhase/bySeverity/byKind buckets + score/proposedAction/next-action guidance, runtime unknown-argument / invalid-enum rejection with structuredContent errorCode values (unknown_argument / invalid_arguments), list_concepts.kind, query_concepts.kind/has-key, find_neighbors.types, find_orphans.kind/excludeKinds, match_nodes.kind/sort, recommend_relations.kind, and match_edges.type/fromKind/toKind typo and unsupported-kind rejection, relation filter / relation_check closest-value rejection, structuredContent coverage split by direct reads / batch row-isolation writes with no write metadata / destructive dry-runs / maintenance cursor checks / graph queries, and maintenance_plan cursor smoke.\n` +
      `Maintenance filters are enum-validated for phases/severities/kinds; cursor smoke checks both cursor.found=true with cursor.reason=null and cursor.found=false with the miss reason, zero remaining actions, and no next actions.\n` +
      `When the ready cursor has actions, verify resumes from the first returned action id and confirms the resumed page does not repeat it.\n` +
      `Ready cursor smoke also verifies nextExecutableAction / nextReviewAction point only at the first executable/review action in the current returned page.\n` +
      `Successful maintenance cursor lines print bucket summaries plus current-page executable/review next-action summaries.\n\n` +
      `Focused checks:\n` +
      `  pnpm test:cli:args              CLI argument parser contract checks.\n` +
      `  pnpm test:cli:mcp-call          CLI MCP wrapper parser/spawn/structuredContent contract checks.\n` +
      `  pnpm integration:cli:mcp-verify    Installed CLI mcp-verify wrapper flow/help/failure checks.\n` +
      `  pnpm dogfood:compile              Root checkout dogfood vault compile_ontology summary.\n` +
      `  pnpm dogfood:compile-fix          Root checkout dogfood vault compile --fix idempotence gate; success ends with [dogfood:compile-fix] docs/ontology unchanged.\n` +
      `  pnpm test:dogfood:args            Narrow dogfood shortcut argument helper contract.\n` +
      `  pnpm test:dogfood:script-refs     Narrow help/package-script reference contract.\n` +
      `  pnpm test:dogfood:compile-fix     Narrow dogfood compile --fix idempotence runner contract.\n` +
      `  pnpm dogfood:health               Root checkout dogfood vault health gate.\n` +
      `  pnpm dogfood:brief                Root checkout dogfood vault workspace_brief snapshot.\n` +
      `  pnpm dogfood:status               Root checkout dogfood vault human-readable health + brief; ends with [dogfood:status] health:N · workspace-brief:N and hints dogfood:verify on failure.\n` +
      `  pnpm test:dogfood:status          Narrow dogfood status shortcut runner contract.\n` +
      `  pnpm dogfood:verify               Root checkout dogfood vault verify shortcut.\n` +
      `  pnpm cli:mcp-verify docs/ontology --timeout-ms 15000\n` +
      `                                      Source-checkout dogfood verify with explicit args.\n` +
      `  pnpm cli:mcp-verify -- --help     Source-checkout shortcut for this help from the repo root.\n` +
      `  pnpm test:mcp:verify              MCP verify helper contract without the full integration suite.\n` +
      `  pnpm test:mcp:verify:first-contact Narrow first-contact initialize-tool-inventory/initialize-safety-recovery/unknown-tool/write-safety/health-summary/advisory/read/sample-shape helper gates.\n` +
      `  pnpm test:mcp:verify:timeout       Narrow MCP verify timeout/startup/help diagnostics.\n`,
  );
}
