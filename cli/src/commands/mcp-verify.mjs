// `oh-my-ontology mcp-verify [vault]` — run the MCP package verify CLI
// against the resolved vault. This gives installed CLI users the same
// first-contact MCP check without knowing the mcp package's internal path.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { parseVaultFlag, resolveExclusiveVaultArg } from '../lib/cli-args.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);

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

  return runVerifyScript(verifyScript, vaultRoot, timeoutMs);
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

function runVerifyScript(verifyScript, vaultRoot, timeoutMs) {
  return new Promise((resolveP) => {
    const proc = spawn('node', [verifyScript], {
      env: {
        ...process.env,
        OMOT_VAULT: vaultRoot,
        ...(timeoutMs ? { OMOT_VERIFY_TIMEOUT_MS: timeoutMs } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (b) => process.stdout.write(b));
    proc.stderr.on('data', (b) => process.stderr.write(b));
    proc.on('close', (code) => resolveP(code ?? 1));
    proc.on('error', (err) => {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${err.message}\n`);
      resolveP(2);
    });
  });
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, timeoutMs: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--timeout-ms') flags.timeoutMs = parseTimeout(args[++i]);
    else if (a.startsWith('--timeout-ms=')) flags.timeoutMs = parseTimeout(a.slice('--timeout-ms='.length));
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  if (flags.timeoutMs === false) return { error: '--timeout-ms must be a positive integer' };
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, timeoutMs: flags.timeoutMs };
}

function parseTimeout(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : false;
}

function printUsage(output = process.stderr) {
  output.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology mcp-verify [vault] [--timeout-ms N]\n` +
      `  oh-my-ontology mcp-verify --vault path --timeout-ms 15000\n\n` +
      `Runs the MCP package verify CLI against the resolved vault.\n` +
      `Checks parser smoke, server boot, tool inventory, list/get_concepts/kind census/validate, workspace health,\n` +
      `compile_ontology, overview, overview/project_map query_plan, and neighbors/path/project_scope graph-query smoke.\n` +
      `Also checks tools/list schema strictness and runtime unknown-argument / invalid-enum rejection smoke.\n`,
  );
}
