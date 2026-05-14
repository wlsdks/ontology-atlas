// `oh-my-ontology cycles [vault]` — dependency cycle 검출.
// MCP `query_ontology({operation: 'cycles'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runCycles(args) {
  const { vault, json, maxHops, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }
  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', {
      operation: 'cycles',
      maxHops,
    });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }
  const cycles = Array.isArray(result?.cycles) ? result.cycles : [];
  const total = result?.totalCycles ?? cycles.length;
  if (total === 0) {
    process.stdout.write(`${COLORS.green}cycles 0 — dependency graph clean ✓${COLORS.reset}\n`);
    return 0;
  }
  process.stdout.write(
    `${COLORS.red}${total} cycle${total === 1 ? '' : 's'} found${COLORS.reset}` +
      ` ${COLORS.dim}(relation: ${(result?.relationTypes || []).join(', ') || 'dependencies'}, maxDepth ${result?.maxDepth ?? 8})${COLORS.reset}\n\n`,
  );
  for (let i = 0; i < cycles.length; i += 1) {
    const c = cycles[i];
    process.stdout.write(`${COLORS.bold}cycle ${i + 1}${COLORS.reset}\n`);
    const slugs = Array.isArray(c?.slugs) ? c.slugs : [];
    for (let j = 0; j < slugs.length; j += 1) {
      process.stdout.write(`  ${COLORS.yellow}${slugs[j]}${COLORS.reset}\n`);
      if (j < slugs.length - 1) process.stdout.write(`    ${COLORS.dim}↓ depends_on${COLORS.reset}\n`);
    }
    if (slugs.length > 0) process.stdout.write(`    ${COLORS.dim}↩ back to ${slugs[0]}${COLORS.reset}\n\n`);
  }
  return 0;
}

function parseArgs(args) {
  const flags = { vault: '.', json: false, maxHops: undefined };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--max-hops') flags.maxHops = Number(args[++i]) || undefined;
    else if (a.startsWith('--max-hops='))
      flags.maxHops = Number(a.slice('--max-hops='.length)) || undefined;
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  if (positional.length > 0 && flags.vault === '.') flags.vault = positional[0];
  return { vault: flags.vault, json: flags.json, maxHops: flags.maxHops };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology cycles [vault] [--max-hops N] [--json]\n\n` +
      `directed depends_on cycle detection (default maxDepth 8).\n`,
  );
}
