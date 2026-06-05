// `ontology-atlas topological-order [vault]` — prerequisite-first dependency ordering.
// MCP `query_ontology({operation: 'topological_order'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation } from '../lib/query-result-contract.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--limit', '--types', '--include-isolated', '--json'];


export async function runTopologicalOrder(args) {
  const { vault, json, limit, types, includeIsolated, error, help } = parseArgs(args);
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
    result = await callMcpTool(vaultRoot, 'query_ontology', {
      operation: 'topological_order',
      limit,
      ...(types.length > 0 ? { types } : {}),
      ...(includeIsolated ? { includeIsolated: true } : {}),
    });
    assertTopologicalOrderShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.acyclic ? 0 : 1;
  }

  render(result);
  return result.acyclic ? 0 : 1;
}

function assertTopologicalOrderShape(result) {
  assertQueryOperation(result, 'topological_order');
  for (const field of ['totalNodes', 'orderedCount', 'selectedEdges']) {
    if (!Number.isInteger(result[field]) || result[field] < 0) {
      throw new Error(`topological_order ${field} must be a non-negative integer`);
    }
  }
  if (typeof result.acyclic !== 'boolean') {
    throw new Error('topological_order acyclic must be a boolean');
  }
  if (!Array.isArray(result.order) || !Array.isArray(result.blocked)) {
    throw new Error('topological_order order and blocked must be arrays');
  }
  return result;
}

function render(result) {
  const status = result.acyclic ? `${COLORS.green}acyclic${COLORS.reset}` : `${COLORS.red}blocked${COLORS.reset}`;
  process.stdout.write(
    `${COLORS.bold}topological order${COLORS.reset} ${status}` +
      ` ${COLORS.dim}— ${result.orderedCount}/${result.totalNodes} ordered` +
      ` · ${result.selectedEdges} selected edges${result.limited ? ' · limited' : ''}${COLORS.reset}\n\n`,
  );
  for (const row of result.order) {
    const node = row.node || {};
    const title = node.title && node.title !== row.slug ? ` ${COLORS.dim}— ${node.title}${COLORS.reset}` : '';
    process.stdout.write(
      `  ${String(row.rank).padStart(2)} ${COLORS.cyan}${row.slug}${COLORS.reset}${title}` +
        ` ${COLORS.dim}${node.kind || ''}${COLORS.reset}\n`,
    );
  }
  if (Array.isArray(result.blocked) && result.blocked.length > 0) {
    process.stdout.write(`\n${COLORS.red}blocked by cycles${COLORS.reset}\n`);
    for (const row of result.blocked) {
      process.stdout.write(
        `  ${COLORS.yellow}${row.slug}${COLORS.reset} ${COLORS.dim}remainingInDegree ${row.remainingInDegree}${COLORS.reset}\n`,
      );
    }
    process.stdout.write(
      `\n${COLORS.dim}next${COLORS.reset} resolve cycles before trusting prerequisite order:\n` +
        `  ${COLORS.cyan}ontology-atlas cycles [vault] --json${COLORS.reset}\n` +
        `  ${COLORS.cyan}ontology-atlas maintenance [vault] --phases repair --severities fail --limit 5${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 100, types: [], includeIsolated: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--include-isolated') flags.includeIsolated = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--types') flags.types = parseCsvListFlag('--types', args[++i], { itemName: 'relation type' });
    else if (a.startsWith('--types=')) flags.types = parseCsvListFlag('--types', a.slice('--types='.length), { itemName: 'relation type' });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const typeError = validateRelationTypeList(flags.types, '--types items');
  if (typeError) return { error: typeError.message };
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    limit: flags.limit,
    types: flags.types,
    includeIsolated: flags.includeIsolated,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas topological-order [vault] [--limit N] [--types A,B] [--include-isolated] [--json]\n\n` +
      `Prerequisite-first dependency ordering. Exits non-zero when cycles block a complete order.\n` +
      `--limit range 1-${LIMIT_CAP}. --types defaults to depends_on/dependencies.\n`,
  );
}
