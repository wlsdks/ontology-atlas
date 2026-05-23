// `oh-my-ontology reachability <slug> [vault]` — transitive graph traversal.
// MCP `query_ontology({operation: 'reachability'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  assertQueryPlanShape,
  assertReachabilityShape,
} from '../lib/query-result-contract.mjs';
import {
  printQueryPlan,
  shouldBlockPlannedExecution,
} from '../lib/query-plan-output.mjs';
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

const DEPTH_CAP = 20;
const LIMIT_CAP = 500;
const DIRECTION_VALUES = Object.freeze(['incoming', 'outgoing', 'both']);
const ALLOWED_FLAGS = [
  '--vault',
  '--json',
  '--depth',
  '--direction',
  '--limit',
  '--types',
  '--plan',
  '--force',
];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const KIND_COLORS = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
  document: COLORS.dim,
  'vault-readme': COLORS.dim,
};

export async function runReachability(args) {
  const {
    slug,
    vault,
    json,
    depth,
    direction,
    limit,
    types,
    plan: shouldPlan,
    force,
    error,
    help,
  } = parseArgs(args);
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
  const query = {
    operation: 'reachability',
    slug,
    depth,
    direction,
    limit,
    types,
  };
  let plan = null;
  let result;
  try {
    if (shouldPlan) {
      plan = await callMcpTool(vaultRoot, 'query_ontology', {
        ...query,
        operation: 'query_plan',
        targetOperation: 'reachability',
      });
      assertQueryPlanShape(plan, 'reachability');
      if (shouldBlockPlannedExecution(plan) && !force) {
        if (json) {
          process.stdout.write(JSON.stringify({ plan, skipped: true }, null, 2) + '\n');
        } else {
          printQueryPlan(plan, COLORS, {
            fallbackHint: 'reduce --depth, add --types, or inspect node first',
          });
          process.stdout.write(
            `\n${COLORS.yellow}skipped${COLORS.reset} reachability blocked by query_plan. Re-run with --force to execute anyway.\n`,
          );
        }
        return 1;
      }
    }

    result = await callMcpTool(vaultRoot, 'query_ontology', query);
    assertReachabilityShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (json) {
    process.stdout.write(JSON.stringify(plan ? { plan, result } : result, null, 2) + '\n');
    return 0;
  }
  if (plan) {
    printQueryPlan(plan, COLORS, {
      fallbackHint: 'reduce --depth, add --types, or inspect node first',
    });
  }
  render(result, { types });
  return 0;
}

function render(result, filters = {}) {
  const summary = result.summary ?? {};
  process.stdout.write(
    `${COLORS.bold}${result.start}${COLORS.reset} ${COLORS.dim}— reachability${COLORS.reset}` +
      ` ${COLORS.dim}(depth ${result.depth}, ${result.direction})${COLORS.reset}\n` +
      `  ${summary.reachableNodes ?? 0} reachable node(s)` +
      ` · ${summary.traversedEdges ?? 0} traversed edge(s)` +
      ` · ${summary.layers ?? 0} layer(s)` +
      ` · ${summary.terminalNodes ?? 0} terminal\n`,
  );
  if (Array.isArray(filters.types) && filters.types.length > 0) {
    process.stdout.write(`  ${COLORS.dim}types${COLORS.reset} ${filters.types.join(',')}\n`);
  }
  process.stdout.write('\n');

  renderCountBucket('by kind', result.byKind, KIND_COLORS);
  renderCountBucket('by relation', result.byRelation);

  const layers = Array.isArray(result.layers) ? result.layers : [];
  if (layers.length > 0) {
    process.stdout.write(`${COLORS.dim}layers${COLORS.reset}\n`);
    for (const layer of layers) {
      process.stdout.write(`  ${COLORS.bold}d${layer.distance}${COLORS.reset} ${COLORS.dim}(${layer.total})${COLORS.reset}\n`);
      for (const node of layer.nodes) {
        const kc = KIND_COLORS[node.kind] || COLORS.dim;
        const title = node.title && node.title !== node.slug ? ` ${COLORS.dim}— ${node.title}${COLORS.reset}` : '';
        process.stdout.write(`    ${kc}${node.slug}${COLORS.reset}${title}\n`);
      }
    }
  } else {
    process.stdout.write(`${COLORS.dim}no reachable nodes within current bounds${COLORS.reset}\n`);
  }

  const paths = result.paths?.rows ?? [];
  if (paths.length > 0) {
    process.stdout.write(`\n${COLORS.dim}shortest paths${COLORS.reset}\n`);
    for (const row of paths.slice(0, 5)) {
      process.stdout.write(`  d${row.distance} ${row.path.join(` ${COLORS.dim}→${COLORS.reset} `)}\n`);
    }
    if (result.paths.limited) {
      process.stdout.write(
        `  ${COLORS.dim}paths limited: showing ${paths.length}/${result.paths.total}; use --limit N for more.${COLORS.reset}\n`,
      );
    }
  }
}

function renderCountBucket(label, bucket, colorMap = {}) {
  const entries = Object.entries(bucket ?? {}).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return;
  process.stdout.write(`${COLORS.dim}${label}${COLORS.reset}\n`);
  for (const [key, count] of entries) {
    const color = colorMap[key] || COLORS.yellow;
    process.stdout.write(`  ${color}${key.padEnd(14)}${COLORS.reset} ${count}\n`);
  }
  process.stdout.write('\n');
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    depth: undefined,
    direction: 'outgoing',
    limit: undefined,
    types: undefined,
    plan: false,
    force: false,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--plan') flags.plan = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--depth') flags.depth = parseBoundedNonNegativeIntegerFlag('--depth', args[++i], { max: DEPTH_CAP });
    else if (a.startsWith('--depth=')) flags.depth = parseBoundedNonNegativeIntegerFlag('--depth', a.slice('--depth='.length), { max: DEPTH_CAP });
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--direction') flags.direction = parseRequiredFlagValue('--direction', args[++i]);
    else if (a.startsWith('--direction='))
      flags.direction = parseRequiredFlagValue('--direction', a.slice('--direction='.length));
    else if (a === '--types') flags.types = parseRelationTypes(args[++i]);
    else if (a.startsWith('--types=')) flags.types = parseRelationTypes(a.slice('--types='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'slug is required (e.g. `reachability capabilities/foo`)' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (!DIRECTION_VALUES.includes(flags.direction)) {
    return { error: formatAllowedValueError('--direction', flags.direction, DIRECTION_VALUES) };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    slug: positional[0],
    vault: vaultResult.vault,
    json: flags.json,
    depth: flags.depth,
    direction: flags.direction,
    limit: flags.limit,
    types: flags.types,
    plan: flags.plan,
    force: flags.force,
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
      `  oh-my-ontology reachability <slug> [vault] [--depth N] [--direction incoming|outgoing|both] [--types A,B] [--limit N] [--plan] [--force] [--json]\n\n` +
      `default depth 3, direction outgoing, --depth range 0-${DEPTH_CAP}, --limit range 1-${LIMIT_CAP}.\n` +
      `Use --plan to run query_plan(reachability) first; expensive or warning plans skip execution unless --force is passed.\n`,
  );
}
