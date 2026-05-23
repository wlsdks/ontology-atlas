// `oh-my-ontology match-nodes [vault]` — graph DB-style node scan.
// MCP `query_ontology({operation: 'match_nodes'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  assertMatchNodesShape,
  assertQueryPlanShape,
} from '../lib/query-result-contract.mjs';
import {
  printQueryPlan,
  shouldBlockPlannedExecution,
} from '../lib/query-plan-output.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseBoundedPositiveIntegerFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';
import { validateKindValue } from '../lib/kinds.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';

const LIMIT_CAP = 500;
const DEGREE_CAP = 100000;
const SORT_VALUES = Object.freeze(['degree', 'inDegree', 'outDegree', 'slug']);
const ALLOWED_FLAGS = [
  '--vault',
  '--kind',
  '--domain',
  '--slug-contains',
  '--min-degree',
  '--max-degree',
  '--min-in-degree',
  '--min-out-degree',
  '--has-incoming',
  '--has-outgoing',
  '--sort',
  '--limit',
  '--plan',
  '--force',
  '--json',
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

export async function runMatchNodes(args) {
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

  const { vault, json, plan: shouldPlan, force, query } = parsed;
  const vaultRoot = resolveVaultRoot(vault);
  let plan = null;
  let result;
  try {
    if (shouldPlan) {
      plan = await callMcpTool(vaultRoot, 'query_ontology', {
        ...query,
        operation: 'query_plan',
        targetOperation: 'match_nodes',
      });
      assertQueryPlanShape(plan, 'match_nodes');
      if (shouldBlockPlannedExecution(plan) && !force) {
        if (json) {
          process.stdout.write(JSON.stringify({ plan, skipped: true }, null, 2) + '\n');
        } else {
          printQueryPlan(plan, COLORS, {
            fallbackHint: 'add --kind, --domain, degree filters, or lower --limit before scanning nodes',
          });
          process.stdout.write(
            `\n${COLORS.yellow}skipped${COLORS.reset} match_nodes blocked by query_plan. Re-run with --force to execute anyway.\n`,
          );
        }
        return 1;
      }
    }
    result = await callMcpTool(vaultRoot, 'query_ontology', query);
    assertMatchNodesShape(result);
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
      fallbackHint: 'add --kind, --domain, degree filters, or lower --limit before scanning nodes',
    });
  }
  render(result);
  return 0;
}

function render(result) {
  const nodes = result?.nodes ?? [];
  const total = result?.totalMatches ?? nodes.length;
  const limited = result?.limited === true;
  process.stdout.write(
    `${COLORS.dim}match_nodes${COLORS.reset} ${COLORS.bold}${nodes.length}/${total}${COLORS.reset} node(s)` +
      `${limited ? ` ${COLORS.dim}(limited)${COLORS.reset}` : ''}\n`,
  );
  const filterText = formatFilters(result?.filters);
  if (filterText) process.stdout.write(`${COLORS.dim}filters${COLORS.reset} ${filterText}\n`);
  process.stdout.write('\n');
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const kc = KIND_COLORS[node.kind] || COLORS.dim;
    const rank = String(index + 1).padStart(2);
    const title = node.title && node.title !== node.slug ? ` ${COLORS.dim}— ${node.title}${COLORS.reset}` : '';
    const degree = `deg ${node.degree} in ${node.inDegree ?? 0} out ${node.outDegree ?? 0}`;
    process.stdout.write(
      `  ${COLORS.bold}${rank}${COLORS.reset} ${kc}${(node.kind || '?').padEnd(12)}${COLORS.reset} ` +
        `${node.slug}${title} ${COLORS.dim}${degree}${COLORS.reset}\n`,
    );
  }
}

function formatFilters(filters = {}) {
  const parts = [];
  for (const [label, value] of [
    ['kind', filters.kind],
    ['domain', filters.domain],
    ['slug', filters.slugContains],
    ['minDegree', filters.minDegree],
    ['maxDegree', filters.maxDegree],
    ['minInDegree', filters.minInDegree],
    ['minOutDegree', filters.minOutDegree],
    ['hasIncoming', filters.hasIncoming],
    ['hasOutgoing', filters.hasOutgoing],
    ['sort', filters.sort],
  ]) {
    if (value !== null && value !== undefined) parts.push(`${label}=${value}`);
  }
  return parts.join(' · ');
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    limit: 100,
    plan: false,
    force: false,
    kind: undefined,
    domain: undefined,
    slugContains: undefined,
    minDegree: undefined,
    maxDegree: undefined,
    minInDegree: undefined,
    minOutDegree: undefined,
    hasIncoming: undefined,
    hasOutgoing: undefined,
    sort: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--plan') flags.plan = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--has-incoming') flags.hasIncoming = true;
    else if (a === '--has-outgoing') flags.hasOutgoing = true;
    else if (a === '--kind') flags.kind = parseRequiredFlagValue('--kind', args[++i]);
    else if (a.startsWith('--kind=')) flags.kind = parseRequiredFlagValue('--kind', a.slice('--kind='.length));
    else if (a === '--domain') flags.domain = parseRequiredFlagValue('--domain', args[++i]);
    else if (a.startsWith('--domain=')) flags.domain = parseRequiredFlagValue('--domain', a.slice('--domain='.length));
    else if (a === '--slug-contains') flags.slugContains = parseRequiredFlagValue('--slug-contains', args[++i]);
    else if (a.startsWith('--slug-contains=')) flags.slugContains = parseRequiredFlagValue('--slug-contains', a.slice('--slug-contains='.length));
    else if (a === '--sort') flags.sort = parseRequiredFlagValue('--sort', args[++i]);
    else if (a.startsWith('--sort=')) flags.sort = parseRequiredFlagValue('--sort', a.slice('--sort='.length));
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--min-degree') flags.minDegree = parseBoundedNonNegativeIntegerFlag('--min-degree', args[++i], { max: DEGREE_CAP });
    else if (a.startsWith('--min-degree=')) flags.minDegree = parseBoundedNonNegativeIntegerFlag('--min-degree', a.slice('--min-degree='.length), { max: DEGREE_CAP });
    else if (a === '--max-degree') flags.maxDegree = parseBoundedNonNegativeIntegerFlag('--max-degree', args[++i], { max: DEGREE_CAP });
    else if (a.startsWith('--max-degree=')) flags.maxDegree = parseBoundedNonNegativeIntegerFlag('--max-degree', a.slice('--max-degree='.length), { max: DEGREE_CAP });
    else if (a === '--min-in-degree') flags.minInDegree = parseBoundedNonNegativeIntegerFlag('--min-in-degree', args[++i], { max: DEGREE_CAP });
    else if (a.startsWith('--min-in-degree=')) flags.minInDegree = parseBoundedNonNegativeIntegerFlag('--min-in-degree', a.slice('--min-in-degree='.length), { max: DEGREE_CAP });
    else if (a === '--min-out-degree') flags.minOutDegree = parseBoundedNonNegativeIntegerFlag('--min-out-degree', args[++i], { max: DEGREE_CAP });
    else if (a.startsWith('--min-out-degree=')) flags.minOutDegree = parseBoundedNonNegativeIntegerFlag('--min-out-degree', a.slice('--min-out-degree='.length), { max: DEGREE_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const kindError = validateKindValue('--kind', flags.kind);
  if (kindError) return { error: kindError };
  if (flags.sort && !SORT_VALUES.includes(flags.sort)) {
    return { error: formatAllowedValueError('--sort', flags.sort, SORT_VALUES) };
  }
  if (
    flags.minDegree !== undefined
    && flags.maxDegree !== undefined
    && flags.minDegree > flags.maxDegree
  ) {
    return { error: '--min-degree must be <= --max-degree' };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  const query = {
    operation: 'match_nodes',
    limit: flags.limit,
    ...(flags.kind ? { kind: flags.kind } : {}),
    ...(flags.domain ? { domain: flags.domain } : {}),
    ...(flags.slugContains ? { slugContains: flags.slugContains } : {}),
    ...(flags.minDegree !== undefined ? { minDegree: flags.minDegree } : {}),
    ...(flags.maxDegree !== undefined ? { maxDegree: flags.maxDegree } : {}),
    ...(flags.minInDegree !== undefined ? { minInDegree: flags.minInDegree } : {}),
    ...(flags.minOutDegree !== undefined ? { minOutDegree: flags.minOutDegree } : {}),
    ...(flags.hasIncoming !== undefined ? { hasIncoming: flags.hasIncoming } : {}),
    ...(flags.hasOutgoing !== undefined ? { hasOutgoing: flags.hasOutgoing } : {}),
    ...(flags.sort ? { sort: flags.sort } : {}),
  };
  return {
    vault: vaultResult.vault,
    json: flags.json,
    plan: flags.plan,
    force: flags.force,
    query,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology match-nodes [vault] [--kind K] [--domain D] [--slug-contains TEXT]\n` +
      `       [--min-degree N] [--max-degree N] [--min-in-degree N] [--min-out-degree N]\n` +
      `       [--has-incoming] [--has-outgoing] [--sort degree|inDegree|outDegree|slug]\n` +
      `       [--limit N] [--plan] [--force] [--json]\n\n` +
      `Graph DB-style node scan over the compiled ontology graph. --limit range 1-${LIMIT_CAP}.\n` +
      `Use --plan to run query_plan(match_nodes) first; warning plans skip execution unless --force is passed.\n`,
  );
}
