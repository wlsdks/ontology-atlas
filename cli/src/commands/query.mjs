// R15 follow-up — `oh-my-ontology query "<filter>" [vault]`
// Typed filter DSL: kind=X AND has(elements) AND NOT domain=auth.
// Thin wrapper over MCP query_concepts.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryConceptsShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--json', '--limit'];
const GRAPH_OPERATION_HINT =
  'query is the typed filter DSL; for graph operations use dedicated commands such as overview, health, agent-brief, workspace-brief, growth, maintenance, path, relation-check, match-nodes, match-edges, blast-radius, cycles, or hubs.';

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
  const { filter, vault, json, limit, error, help } = parseArgs(args);
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
    result = await callMcpTool(vaultRoot, 'query_concepts', { filter, limit });
    assertQueryConceptsShape(result);
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
  const total = result?.total ?? matches.length;
  const limited = result?.limited === true;
  process.stdout.write(
    `${COLORS.dim}filter:${COLORS.reset} ${COLORS.bold}${filter}${COLORS.reset} ` +
      `${COLORS.dim}— showing ${matches.length}/${total} match(es)${limited ? ' (limited)' : ''}${COLORS.reset}\n`,
  );
  if (result?.parsedAs && result.parsedAs !== filter) {
    process.stdout.write(`${COLORS.dim}parsed:${COLORS.reset} ${result.parsedAs}\n`);
  }
  process.stdout.write('\n');
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
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 100 };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit='))
      flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--operation' || a.startsWith('--operation=')) {
      return { error: `${formatUnknownFlagError(a, ALLOWED_FLAGS)} ${GRAPH_OPERATION_HINT}` };
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
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

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology query "<filter>" [vault] [--vault path] [--json] [--limit N]\n\n` +
      `--limit range 1-${LIMIT_CAP}.\n\n` +
      `${COLORS.bold}Filter DSL${COLORS.reset} (AND / OR / NOT, parens supported):\n` +
      `  kind=capability\n` +
      `  domain=auth\n` +
      `  has(elements)\n` +
      `  kind=capability AND has(elements)\n` +
      `  kind=capability AND NOT has(elements)        ${COLORS.dim}# unfinished caps${COLORS.reset}\n` +
      `  (kind=capability OR kind=element) AND domain=auth\n\n` +
      `${COLORS.dim}${GRAPH_OPERATION_HINT}${COLORS.reset}\n`,
  );
}
