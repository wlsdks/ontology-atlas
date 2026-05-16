// R15 follow-up — `oh-my-ontology query "<filter>" [vault]`
// Typed filter DSL: kind=X AND has(elements) AND NOT domain=auth.
// Thin wrapper over MCP query_concepts.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  parsePositiveIntegerFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const KIND_COLORS = {
  capability: COLORS.cyan,
  domain: COLORS.blue,
  element: COLORS.green,
  project: COLORS.magenta,
  document: COLORS.dim,
};

export async function runQuery(args) {
  const { filter, vault, json, limit, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_concepts', { filter, limit });
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

  const matches = result?.matches ?? [];
  process.stdout.write(
    `${COLORS.dim}filter:${COLORS.reset} ${COLORS.bold}${filter}${COLORS.reset} ` +
      `${COLORS.dim}— ${result?.total ?? matches.length} match(es)${result?.limited ? ' (limited)' : ''}${COLORS.reset}\n\n`,
  );
  if (matches.length === 0) return 0;
  for (const m of matches) {
    const kc = KIND_COLORS[m.kind] || COLORS.dim;
    process.stdout.write(
      `  ${kc}${(m.kind || '?').padEnd(12)}${COLORS.reset} ${m.slug}` +
        (m.title ? ` ${COLORS.dim}— ${m.title}${COLORS.reset}` : '') +
        `\n`,
    );
  }
  return 0;
}

function parseArgs(args) {
  const flags = { vault: null, json: false, limit: 100 };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = parsePositiveIntegerFlag('--limit', args[++i]);
    else if (a.startsWith('--limit='))
      flags.limit = parsePositiveIntegerFlag('--limit', a.slice('--limit='.length));
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'filter is required (e.g. "kind=capability AND has(elements)")' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    filter: positional[0],
    vault: vaultResult.vault,
    json: flags.json,
    limit: flags.limit,
  };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology query "<filter>" [vault] [--vault path] [--json] [--limit N]\n\n` +
      `${COLORS.bold}Filter DSL${COLORS.reset} (AND / OR / NOT, parens supported):\n` +
      `  kind=capability\n` +
      `  domain=auth\n` +
      `  has(elements)\n` +
      `  kind=capability AND has(elements)\n` +
      `  kind=capability AND NOT has(elements)        ${COLORS.dim}# unfinished caps${COLORS.reset}\n` +
      `  (kind=capability OR kind=element) AND domain=auth\n`,
  );
}
