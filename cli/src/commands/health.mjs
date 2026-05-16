// `oh-my-ontology health [vault]` — graph 무결성 dashboard.
// MCP `query_ontology({operation: 'health'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { parseVaultFlag, resolveExclusiveVaultArg } from '../lib/cli-args.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const STATUS_COLORS = {
  pass: COLORS.green,
  fail: COLORS.red,
  warn: COLORS.yellow,
  info: COLORS.dim,
};
const STATUS_ICONS = {
  pass: '✓',
  fail: '✗',
  warn: '⚠',
  info: 'ℹ',
};

export async function runHealth(args) {
  const { vault, json, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }
  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'health' });
    assertQueryOperation(result, 'health');
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return healthExitCode(result);
  }
  const status = result?.status ?? 'unknown';
  const sc = STATUS_COLORS[status] || COLORS.dim;
  const sum = result?.summary ?? {};
  process.stdout.write(
    `${COLORS.bold}vault health${COLORS.reset} ${sc}${status}${COLORS.reset}` +
      ` ${COLORS.dim}— ${sum.nodes ?? 0} 노드 · ${sum.edges ?? 0} 관계${COLORS.reset}\n\n`,
  );
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  for (const c of checks) {
    const cc = STATUS_COLORS[c.status] || COLORS.dim;
    const icon = STATUS_ICONS[c.status] || '·';
    process.stdout.write(
      `  ${cc}${icon}${COLORS.reset} ${cc}${(c.id || '').padEnd(28)}${COLORS.reset}` +
        ` ${COLORS.dim}${c.message ?? ''}${COLORS.reset}\n`,
    );
  }
  // dependency cycle / components count 강조
  if (sum.dependencyCycles) {
    process.stdout.write(`\n${COLORS.red}cycles ${sum.dependencyCycles}${COLORS.reset} — \`cycles\` 명령으로 자세히\n`);
  }
  return healthExitCode(result);
}

function healthExitCode(result) {
  const status = result?.status ?? 'unknown';
  return status === 'healthy' || status === 'pass' ? 0 : 1;
}

function parseArgs(args) {
  const flags = { vault: null, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology health [vault] [--json]\n\n` +
      `pass=healthy / warn=info-only / fail=blocking. exit 0 만 healthy.\n`,
  );
}
