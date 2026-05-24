// `oh-my-ontology explain <from> <to> [vault]` — relationship evidence.
// MCP `query_ontology({operation: 'explain_relation'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertExplainRelationShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';

const MAX_HOPS_CAP = 20;
const LIMIT_CAP = 100;
const DIRECTION_VALUES = Object.freeze(['incoming', 'outgoing', 'both', 'undirected']);
const ALLOWED_FLAGS = ['--vault', '--direction', '--max-hops', '--limit', '--types', '--json'];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runExplain(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolveVaultRoot(parsed.vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', parsed.query);
    assertExplainRelationShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (parsed.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.verdict === 'unrelated_within_hops' ? 1 : 0;
  }
  render(result, parsed.query);
  return result.verdict === 'unrelated_within_hops' ? 1 : 0;
}

function render(result, query) {
  process.stdout.write(
    `${COLORS.dim}explain_relation${COLORS.reset} ${formatNode(result.fromNode)} ${COLORS.dim}→${COLORS.reset} ${formatNode(result.toNode)}\n` +
      `  verdict ${formatVerdict(result.verdict)} · direction ${result.shortestPath.direction} · maxHops ${result.shortestPath.maxHops}\n`,
  );
  if (Array.isArray(query.types) && query.types.length > 0) {
    process.stdout.write(`  ${COLORS.dim}types${COLORS.reset} ${query.types.join(',')}\n`);
  }
  if (result.domains.from || result.domains.to) {
    process.stdout.write(
      `  ${COLORS.dim}domains${COLORS.reset} ${result.domains.from ?? '(none)'} → ${result.domains.to ?? '(none)'}` +
        ` · same=${result.domains.sameDomain}\n`,
    );
  }

  renderDirectEdges(result.direct.edges, result.direct.total);
  renderShortestPath(result.shortestPath);
  renderCommonNeighbors(result.commonNeighbors);
  renderNextRelation(result, query);
}

function renderDirectEdges(edges, total) {
  process.stdout.write(`\n${COLORS.dim}DIRECT EDGES${COLORS.reset} ${edges.length}/${total}\n`);
  if (edges.length === 0) {
    process.stdout.write(`  ${COLORS.dim}none${COLORS.reset}\n`);
    return;
  }
  for (const edge of edges) {
    const arrow = edge.direction === 'incoming' ? '<--' : '--';
    const suffix = edge.direction === 'incoming' ? '--' : '-->';
    process.stdout.write(
      `  ${edge.from} ${arrow}${COLORS.yellow}${edge.via}${COLORS.reset}${suffix} ${edge.to}` +
        ` ${COLORS.dim}(${edge.direction})${COLORS.reset}\n`,
    );
  }
}

function renderShortestPath(path) {
  const count = path.hopCount ?? 0;
  process.stdout.write(`\n${COLORS.dim}SHORTEST PATH${COLORS.reset} ${path.found ? `${count} hop${count === 1 ? '' : 's'}` : 'not found'}\n`);
  if (!path.found) {
    process.stdout.write(`  ${COLORS.dim}none within current maxHops/direction/types${COLORS.reset}\n`);
    return;
  }
  if (path.hops.length === 1) {
    process.stdout.write(`  ${formatNode(path.nodes[0])} ${COLORS.dim}(same node)${COLORS.reset}\n`);
    return;
  }
  for (let index = 0; index < path.edges.length; index += 1) {
    const from = path.nodes[index] ?? { slug: path.hops[index] };
    const to = path.nodes[index + 1] ?? { slug: path.hops[index + 1] };
    const edge = path.edges[index];
    process.stdout.write(
      `  ${index + 1}. ${formatNode(from)} ${COLORS.dim}--${edge.via}-->${COLORS.reset} ${formatNode(to)}\n`,
    );
  }
}

function renderCommonNeighbors(commonNeighbors) {
  const rows = commonNeighbors.rows;
  process.stdout.write(
    `\n${COLORS.dim}COMMON NEIGHBORS${COLORS.reset} ${rows.length}/${commonNeighbors.total}` +
      `${commonNeighbors.limited ? ` ${COLORS.dim}(limited)${COLORS.reset}` : ''}\n`,
  );
  if (rows.length === 0) {
    process.stdout.write(`  ${COLORS.dim}none${COLORS.reset}\n`);
    return;
  }
  for (const row of rows) {
    process.stdout.write(`  ${formatNode(row.node)}\n`);
    process.stdout.write(`    ${COLORS.dim}from:${COLORS.reset} ${formatEdgeList(row.fromEdges)}\n`);
    process.stdout.write(`    ${COLORS.dim}to:${COLORS.reset}   ${formatEdgeList(row.toEdges)}\n`);
  }
}

function renderNextRelation(result, query) {
  const relationType = result.direct.edges[0]?.via ?? result.shortestPath.edges[0]?.via ?? query.types?.[0] ?? 'relates';
  const typeList = Array.isArray(query.types) && query.types.length > 0 ? query.types.join(',') : relationType;
  const maxHops = Number.isInteger(query.maxHops) ? query.maxHops : result.shortestPath.maxHops;
  process.stdout.write(
    `\n${COLORS.bold}next relation${COLORS.reset} ${COLORS.cyan}${query.from}${COLORS.reset}` +
      ` ${COLORS.dim}→${COLORS.reset} ${COLORS.cyan}${query.to}${COLORS.reset}` +
      ` ${COLORS.dim}— explanation is evidence, not write approval; run path and preflight before changing graph${COLORS.reset}\n` +
      `  oh-my-ontology path ${query.from} ${query.to} [vault] --max-hops ${maxHops}\n` +
      `  oh-my-ontology match-edges [vault] --from ${query.from} --to ${query.to} --types ${typeList} --limit 10\n` +
      `  oh-my-ontology relation-check ${query.from} ${query.to} ${relationType} [vault]\n`,
  );
}

function formatEdgeList(edges) {
  if (!Array.isArray(edges) || edges.length === 0) return `${COLORS.dim}none${COLORS.reset}`;
  return edges
    .slice(0, 3)
    .map((edge) => `${edge.from} --${edge.via}--> ${edge.to}`)
    .join(` ${COLORS.dim}|${COLORS.reset} `);
}

function formatNode(node) {
  if (!node?.title || node.title === node.slug) return `${COLORS.cyan}${node?.slug ?? '(unknown)'}${COLORS.reset}`;
  return `${COLORS.cyan}${node.slug}${COLORS.reset} ${COLORS.dim}— ${node.title}${COLORS.reset}`;
}

function formatVerdict(verdict) {
  const color = verdict === 'unrelated_within_hops' ? COLORS.red : COLORS.green;
  return `${color}${verdict}${COLORS.reset}`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    direction: 'undirected',
    maxHops: undefined,
    limit: undefined,
    types: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--direction') flags.direction = parseRequiredFlagValue('--direction', args[++i]);
    else if (a.startsWith('--direction=')) flags.direction = parseRequiredFlagValue('--direction', a.slice('--direction='.length));
    else if (a === '--max-hops') flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', args[++i], { max: MAX_HOPS_CAP });
    else if (a.startsWith('--max-hops=')) flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', a.slice('--max-hops='.length), { max: MAX_HOPS_CAP });
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--types') flags.types = parseRelationTypes(args[++i]);
    else if (a.startsWith('--types=')) flags.types = parseRelationTypes(a.slice('--types='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length < 2) return { error: 'both <from> and <to> are required' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (!DIRECTION_VALUES.includes(flags.direction)) {
    return { error: formatAllowedValueError('--direction', flags.direction, DIRECTION_VALUES) };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 2 });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    query: {
      operation: 'explain_relation',
      from: positional[0],
      to: positional[1],
      direction: flags.direction,
      ...(typeof flags.maxHops === 'number' ? { maxHops: flags.maxHops } : {}),
      ...(typeof flags.limit === 'number' ? { limit: flags.limit } : {}),
      ...(Array.isArray(flags.types) ? { types: flags.types } : {}),
    },
  };
}

function parseRelationTypes(value) {
  const parsed = parseCsvListFlag('--types', value, { itemName: 'relation type' });
  if (parsed instanceof Error) return parsed;
  const error = validateRelationTypeList(parsed, '--types items');
  return error ?? parsed;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology explain <from> <to> [vault] [--direction incoming|outgoing|both|undirected] [--max-hops N] [--types A,B] [--limit N] [--json]\n\n` +
      `Shows direct edges, shortest path, domain context, and common-neighbor evidence from the compiled graph.\n` +
      `--max-hops range 0-${MAX_HOPS_CAP}; --limit range 1-${LIMIT_CAP}; unrelated verdict exits 1.\n`,
  );
}
