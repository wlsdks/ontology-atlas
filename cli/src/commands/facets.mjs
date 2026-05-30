// `oh-my-ontology facets [vault]` — graph dashboard facets.
// MCP `query_ontology({operation: 'facets'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--limit', '--json'];


export async function runFacets(args) {
  const { vault, json, limit, error, help } = parseArgs(args);
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
      operation: 'facets',
      limit,
    });
    assertFacetsShape(result);
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

  render(result);
  return 0;
}

function assertFacetsShape(result) {
  assertQueryOperation(result, 'facets');
  if (!isPlainObject(result.graph) || !isPlainObject(result.nodes) || !isPlainObject(result.edges)) {
    throw new Error('facets graph, nodes, and edges must be objects');
  }
  for (const field of ['nodes', 'edges', 'resolvedEdges', 'externalEdges', 'unresolvedEdges']) {
    if (!Number.isInteger(result.graph[field]) || result.graph[field] < 0) {
      throw new Error(`facets graph.${field} must be a non-negative integer`);
    }
  }
  if (!isPlainObject(result.nodes.byKind) || !isPlainObject(result.edges.byRelation)) {
    throw new Error('facets node and edge buckets must be objects');
  }
  if (!Array.isArray(result.nodes.topByDegree) || !Array.isArray(result.edges.topPatterns)) {
    throw new Error('facets topByDegree and topPatterns must be arrays');
  }
  return result;
}

function render(result) {
  const graph = result.graph;
  process.stdout.write(
    `${COLORS.bold}graph facets${COLORS.reset}` +
      ` ${COLORS.dim}— ${graph.nodes} nodes · ${graph.edges} edges` +
      ` · resolved ${graph.resolvedEdges} · external ${graph.externalEdges}` +
      `${graph.unresolvedEdges ? ` · unresolved ${graph.unresolvedEdges}` : ''}${COLORS.reset}\n\n`,
  );

  printBucket('node kinds', result.nodes.byKind);
  printBucket('domains', result.nodes.byDomain);
  printBucket('degree buckets', result.nodes.byDegreeBucket);
  printBucket('relations', result.edges.byRelation);
  printBucket('resolution', result.edges.byResolution);

  const topNodes = Array.isArray(result.nodes.topByDegree) ? result.nodes.topByDegree : [];
  if (topNodes.length > 0) {
    process.stdout.write(`${COLORS.dim}top degree${COLORS.reset}\n`);
    for (const node of topNodes) {
      const title = node.title && node.title !== node.slug ? ` ${COLORS.dim}— ${node.title}${COLORS.reset}` : '';
      process.stdout.write(
        `  ${COLORS.cyan}${node.slug}${COLORS.reset}${title}` +
          ` ${COLORS.dim}${node.kind} · degree ${node.degree ?? ((node.inDegree ?? 0) + (node.outDegree ?? 0))}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const topPatterns = Array.isArray(result.edges.topPatterns) ? result.edges.topPatterns : [];
  if (topPatterns.length > 0) {
    process.stdout.write(`${COLORS.dim}top schema patterns${COLORS.reset}\n`);
    for (const pattern of topPatterns) {
      process.stdout.write(
        `  ${COLORS.cyan}${pattern.fromKind}${COLORS.reset}` +
          ` ${COLORS.dim}--${COLORS.reset}${COLORS.yellow}${pattern.relation}${COLORS.reset}${COLORS.dim}-->${COLORS.reset} ` +
          `${COLORS.cyan}${pattern.toKind}${COLORS.reset}` +
          ` ${COLORS.dim}${pattern.count} edges${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  process.stdout.write(
    `${COLORS.dim}next${COLORS.reset} turn dashboard rows into evidence:\n` +
      `  ${COLORS.cyan}oh-my-ontology node <slug> [vault] --limit 20${COLORS.reset}\n` +
      `  ${COLORS.cyan}oh-my-ontology schema [vault] --limit 20${COLORS.reset}\n`,
  );
}

function printBucket(label, bucket) {
  if (!isPlainObject(bucket) || Object.keys(bucket).length === 0) return;
  process.stdout.write(`${COLORS.dim}${label}${COLORS.reset}\n`);
  for (const [key, count] of Object.entries(bucket).sort(([, a], [, b]) => Number(b) - Number(a))) {
    process.stdout.write(`  ${COLORS.yellow}${key}${COLORS.reset} ${COLORS.dim}${count}${COLORS.reset}\n`);
  }
  process.stdout.write('\n');
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 10 };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit='))
      flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, limit: flags.limit };
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology facets [vault] [--limit N] [--json]\n\n` +
      `Graph dashboard facets: kind/domain/degree/relation buckets, top nodes, and top schema patterns.\n` +
      `--limit range 1-${LIMIT_CAP}.\n`,
  );
}
