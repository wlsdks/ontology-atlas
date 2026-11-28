import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { EXPECTED_TOOLS } from './tools-list/inventory.mjs';

const VERIFY_ALLOWED_FLAGS = ['--vault', '--timeout-ms', '--help'];
const DEFAULT_VERIFY_RETRY_EXAMPLE = 'npm run verify -- --timeout-ms 15000';
const DEFAULT_VERIFY_KILL_GRACE_MS = 1_000;

export function parseVerifyTimeoutMs(value, fallback = 30000) {
  if (value == null || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : false;
}

export function parseVerifyKillGraceMs(env = process.env) {
  return parseVerifyTimeoutMs(env.OATLAS_VERIFY_KILL_GRACE_MS, DEFAULT_VERIFY_KILL_GRACE_MS);
}

export function verifyKillGraceValueErrorMessage(env = process.env) {
  const value = env.OATLAS_VERIFY_KILL_GRACE_MS;
  const received = value == null ? 'undefined' : JSON.stringify(String(value));
  return [
    'verify kill grace must be a positive integer wait window in milliseconds.',
    `Received: ${received}.`,
    'Set OATLAS_VERIFY_KILL_GRACE_MS=N.',
  ].join(' ');
}

export function verifyVaultPathError(vault, cwd = process.cwd()) {
  const resolved = resolve(cwd, vault);
  try {
    if (!statSync(resolved).isDirectory()) {
      return `vault path is not a directory: ${vault} (resolved ${resolved})`;
    }
    return null;
  } catch {
    return (
      `vault path does not exist: ${vault} (resolved ${resolved}). ` +
      'If you are running from the repo root with `pnpm --filter ./mcp verify -- ...`, use `../docs/ontology` for the dogfood vault.'
    );
  }
}

export function emptyVerifyVaultFailure(parsed) {
  if (!parsed || typeof parsed !== 'object' || parsed.total !== 0) return null;
  const root = typeof parsed.vaultRoot === 'string' && parsed.vaultRoot.length > 0
    ? ` (vaultRoot ${parsed.vaultRoot})`
    : '';
  return (
    `verify vault has 0 ontology nodes${root}. ` +
    'Point verify at a populated ontology vault; from the repo root with `pnpm --filter ./mcp verify -- ...`, use `../docs/ontology` for the dogfood vault.'
  );
}

export function parseVerifyArgs({
  env = process.env,
  argv = process.argv,
  cwd = process.cwd(),
  isMain = false,
} = {}) {
  const args = normalizeVerifyArgs(isMain ? argv.slice(2) : []);
  let help = false;
  let error = null;
  let positionalVault = null;
  let timeoutMsRaw = null;
  const retryEnv = () => verifyRetryEnvForVault(positionalVault ?? findVerifyRetryVaultArg(args));

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--timeout-ms') {
      const value = args[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) {
        error = verifyTimeoutValueErrorMessage(value, retryEnv());
        break;
      }
      timeoutMsRaw = value;
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      const value = arg.slice('--timeout-ms='.length);
      if (value.length === 0) {
        error = verifyTimeoutValueErrorMessage(value, retryEnv());
        break;
      }
      timeoutMsRaw = value;
    } else if (arg === '--vault') {
      const value = parseVerifyVaultArg(args[index + 1]);
      if (value === false) {
        error = '--vault requires a path value';
        break;
      }
      if (positionalVault) {
        error = `Unexpected extra vault argument: ${value}`;
        break;
      }
      positionalVault = value;
      index += 1;
    } else if (arg.startsWith('--vault=')) {
      const value = parseVerifyVaultArg(arg.slice('--vault='.length));
      if (value === false) {
        error = '--vault requires a path value';
        break;
      }
      if (positionalVault) {
        error = `Unexpected extra vault argument: ${value}`;
        break;
      }
      positionalVault = value;
    } else if (arg.startsWith('-')) {
      error = formatUnknownVerifyOption(arg);
      break;
    } else if (positionalVault) {
      error = `Unexpected extra vault argument: ${arg}`;
      break;
    } else {
      const value = parseVerifyVaultArg(arg);
      if (value === false) {
        error = 'vault argument requires a path value';
        break;
      }
      positionalVault = value;
    }
  }

  const envVault = help || positionalVault
    ? { error: null, vault: null }
    : parseOptionalVerifyVaultEnv(env.OATLAS_VAULT);
  return {
    error: error ?? envVault.error,
    help,
    timeoutMsRaw: timeoutMsRaw ?? env.OATLAS_VERIFY_TIMEOUT_MS,
    vault: positionalVault ?? envVault.vault ?? cwd,
  };
}

export function normalizeVerifyArgs(args = []) {
  return args[0] === '--' ? args.slice(1) : args;
}

function parseOptionalVerifyVaultEnv(value) {
  if (typeof value !== 'string' || value.length === 0) return { error: null, vault: null };
  const vault = parseVerifyVaultArg(value);
  if (vault === false) return { error: 'OATLAS_VAULT requires a path value', vault: null };
  return { error: null, vault };
}

function parseVerifyVaultArg(value) {
  const path = String(value ?? '').trim();
  if (!path || path.startsWith('-')) return false;
  return path;
}

function findVerifyRetryVaultArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--vault') {
      const value = parseVerifyVaultArg(args[index + 1]);
      if (value !== false) return value;
      index += 1;
    } else if (arg.startsWith('--vault=')) {
      const value = parseVerifyVaultArg(arg.slice('--vault='.length));
      if (value !== false) return value;
    } else if (!arg.startsWith('-')) {
      const value = parseVerifyVaultArg(arg);
      if (value !== false) return value;
    }
  }
  return null;
}

function formatUnknownVerifyOption(arg) {
  const suggestion = closestVerifyFlag(arg);
  const suggestionText = suggestion ? ` Did you mean ${suggestion}?` : '';
  return `Unknown option: ${arg}.${suggestionText}`;
}

function closestVerifyFlag(arg) {
  if (!arg) return null;
  const comparableArg = String(arg).split('=')[0];
  let best = null;
  for (const flag of VERIFY_ALLOWED_FLAGS) {
    const distance = levenshteinDistance(comparableArg, flag);
    if (!best || distance < best.distance) {
      best = { flag, distance };
    }
  }
  if (!best) return null;
  const threshold = Math.max(2, Math.ceil(best.flag.replace(/^--/, '').length / 2));
  return best.distance <= threshold ? best.flag : null;
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }
  return previous[b.length];
}

export function verifyTimeoutFailure(timeoutMs, env = process.env) {
  return [
    `server verify timed out after ${timeoutMs}ms.`,
    'Increase --timeout-ms or OATLAS_VERIFY_TIMEOUT_MS for large or slow vaults.',
    'After timeout verify sends SIGTERM and then SIGKILL; set OATLAS_VERIFY_KILL_GRACE_MS=N only to tune that cleanup window.',
    `Example: ${verifyRetryExample(env)}`,
  ].join(' ');
}

export function verifyRetryExample(env = process.env) {
  const value = typeof env.OATLAS_VERIFY_RETRY_EXAMPLE === 'string' ? env.OATLAS_VERIFY_RETRY_EXAMPLE.trim() : '';
  return value || DEFAULT_VERIFY_RETRY_EXAMPLE;
}

export function verifyRetryEnvForVault(vaultArg, env = process.env, cwd = process.cwd()) {
  const existing = typeof env.OATLAS_VERIFY_RETRY_EXAMPLE === 'string' ? env.OATLAS_VERIFY_RETRY_EXAMPLE.trim() : '';
  if (existing) return { ...env, OATLAS_VERIFY_RETRY_EXAMPLE: existing };
  const vault = typeof vaultArg === 'string' ? vaultArg.trim() : '';
  if (!vault || vault === '.' || vault === cwd) return env;
  return {
    ...env,
    OATLAS_VERIFY_RETRY_EXAMPLE: `npm run verify -- --vault ${shellArg(vault)} --timeout-ms 15000`,
  };
}

function shellArg(value) {
  const raw = String(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(raw)) return raw;
  return `'${raw.replaceAll("'", "'\\''")}'`;
}

export function verifyTimeoutValueErrorMessage(value, env = process.env) {
  const received = value == null ? 'undefined' : JSON.stringify(String(value));
  return [
    'verify timeout must be a positive integer wait window in milliseconds.',
    `Received: ${received}.`,
    'Set --timeout-ms N or OATLAS_VERIFY_TIMEOUT_MS=N.',
    `Example: ${verifyRetryExample(env)}`,
  ].join('\n');
}

export function verifySuccessMessage(toolCount = EXPECTED_TOOLS.length) {
  return `All passed: register .mcp.json with your MCP client and restart to use the ${toolCount} tools.`;
}

export function verifyUsage() {
  return (
    '\nUsage:\n' +
    '  node mcp/scripts/verify.mjs [vault] [--timeout-ms N]\n' +
    '  node mcp/scripts/verify.mjs --vault path --timeout-ms 15000\n' +
    '  npm run verify -- [vault] [--timeout-ms N]\n' +
    '  npm run verify -- --vault path --timeout-ms 15000\n' +
    '  pnpm --filter ./mcp verify -- [vault] [--timeout-ms N]\n' +
    '  pnpm --filter ./mcp verify -- --help\n\n' +
    'Runs the MCP server first-contact verification against the resolved vault.\n' +
    'Run npm run verify from the mcp/ package directory; from the repo root, use node mcp/scripts/verify.mjs or pnpm --filter ./mcp verify -- ...\n' +
    'Explicit [vault] or --vault arguments take precedence over OATLAS_VAULT.\n' +
    'Timeout cleanup sends SIGTERM and then SIGKILL; set OATLAS_VERIFY_KILL_GRACE_MS=N only when the post-timeout cleanup window needs explicit tuning.\n' +
    'Checks parser smoke, server boot, tool inventory (missing/extra/duplicate/invalid names), and direct read smokes,\n' +
    'including list/project probe/get_concepts/list_concepts mentions/find_backlinks/list_concepts filter/limited list_concepts filter/analyze_repo_structure/infer_imports/match_nodes hasIncoming:false.\n' +
    'It also checks node census, vault validation, workspace health, compile_ontology summary + paginated full-artifact + indexed full-artifact smoke, overview, query plans, and graph-query smoke.\n' +
    'Successful output prints read census consistency after cross-checking the list_concepts census/list_concepts/compile_ontology/overview.\n' +
    'Also checks strict unknown-tool / unknown-argument / invalid-enum rejection, list_concepts.kind, list_concepts filter kind/has-key, retired-tool answers, match_nodes.kind/sort, recommend_relations.kind, and match_edges.type/fromKind/toKind typo and unsupported-kind rejection, maintenance_plan filter enums,\n' +
    'tools/list inventory names, initialize-instruction tool inventory, schema strictness, and annotation coverage (title/read/write/destructive/idempotent/local-only),\n' +
    'batch reader/writer row isolation for non-object rows and unknown row fields with concepts[n]/relations[n] error labels, invalid add_relations type closest-value hints, and 50-row batch cap rejection,\n' +
    'destructive writer dry-runs for rename_concept/merge_concepts/delete_concept with every planned response present and no changed/postWriteMaintenance,\n' +
    'an absorb_document dry-run against a temp fixture file (Slice 0: never the vault under test) covering both the policy-absorb and architecture-suggest classification branches,\n' +
    'structuredContent coverage summary splits direct reads, batch row-isolation writes with no write metadata, destructive dry-runs, maintenance cursor checks, and graph queries,\n' +
    'and maintenance_plan cursor handling: ready page (cursor.found=true, cursor.reason=null)\n' +
    'plus missing afterActionId (cursor.found=false, reason, empty page, nextAfterActionId=null, hasMore=false).\n' +
    'When the ready cursor has actions, verify resumes from the first returned action id and confirms the resumed page does not repeat it.\n' +
    'Ready cursor smoke also verifies nextExecutableAction / nextReviewAction point only at the first executable/review action in the current returned page.\n' +
    'Ready cursor metadata verifies nextAfterActionId matches the last returned action and hasMore matches the remaining page state.\n' +
    'Successful cursor lines print bucket summaries plus current-page executable/review next-action summaries.\n\n' +
    'Focused checks:\n' +
    '  pnpm test:mcp:verify            MCP verify helper contract without the full integration suite.\n' +
    '  pnpm test:mcp:verify:first-contact\n' +
    '                                  Narrow first-contact initialize-tool-inventory/initialize-safety-recovery/unknown-tool/write-safety/health-summary/advisory/read/sample-shape helper gates.\n' +
    '  pnpm test:mcp:maintenance       Narrow maintenance_plan filter/cursor/resume/work-queue formatter gates.\n' +
    '  pnpm test:mcp:verify:timeout    Narrow MCP verify timeout/startup/help/empty-vault diagnostics.\n' +
    '  pnpm test:dogfood:args          Narrow dogfood shortcut argument helper contract.\n' +
    '  pnpm test:dogfood:script-refs   Narrow help/package-script reference + focused filter parser/wrapper summary contract.\n' +
    '  pnpm test:mcp:registration      Narrow source-checkout .mcp.json/.mcp.json.example/.codex/config.toml registration template contract.\n' +
    '  pnpm dogfood:compile            Cheap root checkout compile_ontology summary snapshot.\n' +
    '  pnpm dogfood:health             Cheap root checkout health gate.\n' +
    '  pnpm dogfood:brief              Cheap root checkout workspace_brief snapshot.\n' +
    '  pnpm dogfood:growth             Cheap root checkout growth_plan snapshot.\n' +
    '  pnpm dogfood:maintenance        Cheap root checkout maintenance_plan snapshot.\n' +
    '  pnpm dogfood:status             Cheap root checkout health + workspace-brief + agent-brief + maintenance preflight with focused hints before full verify.\n' +
    '  pnpm test:dogfood:status        Narrow dogfood status shortcut runner contract.\n' +
    '  pnpm dogfood:verify             Root checkout dogfood vault installed-style verify gate.\n'
  );
}

export function serverStartupFailure(stderr, env = process.env) {
  const detail = String(stderr || '').trim().slice(0, 300);
  const retry = `Example: ${verifyRetryExample(env)}`;
  return detail ? `server failed before initialize. stderr: ${detail} ${retry}` : `no initialize response. ${retry}`;
}

export function serverSignalFailure(signal, stderr, env = process.env) {
  const signalText = signal || 'unknown signal';
  const detail = String(stderr || '').trim().slice(0, 300);
  const retry = `Example: ${verifyRetryExample(env)}`;
  return detail
    ? `server terminated by ${signalText} before first-contact completed. stderr: ${detail} ${retry}`
    : `server terminated by ${signalText} before first-contact completed. ${retry}`;
}

export function parserSmokeFailure(code, signal) {
  if (signal) return `parser test terminated by ${signal}`;
  return `parser test failed (exit ${code})`;
}
