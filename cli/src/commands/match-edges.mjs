// `oh-my-ontology match-edges [vault]` — graph DB-style edge scan.
// MCP `query_ontology({operation: 'match_edges'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  assertMatchEdgesShape,
  assertQueryPlanShape,
} from '../lib/query-result-contract.mjs';
import {
  printQueryPlan,
  shouldBlockPlannedExecution,
} from '../lib/query-plan-output.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';
import { READABLE_KIND_VALUES, validateKindValue } from '../lib/kinds.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';

const LIMIT_CAP = 500;
const EDGE_TARGET_KIND_VALUES = Object.freeze([...READABLE_KIND_VALUES, 'external', 'unresolved']);
const ALLOWED_FLAGS = [
  '--vault',
  '--from',
  '--to',
  '--from-kind',
  '--to-kind',
  '--type',
  '--types',
  '--include-external',
  '--include-unresolved',
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
  external: COLORS.dim,
  unresolved: COLORS.dim,
};

export async function runMatchEdges(args) {
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
        targetOperation: 'match_edges',
      });
      assertQueryPlanShape(plan, 'match_edges');
      if (shouldBlockPlannedExecution(plan) && !force) {
        if (json) {
          process.stdout.write(JSON.stringify({ plan, skipped: true }, null, 2) + '\n');
        } else {
          printQueryPlan(plan, COLORS, {
            fallbackHint: 'add --from-kind, --to-kind, --type/--types, or lower --limit before scanning edges',
          });
          process.stdout.write(
            `\n${COLORS.yellow}skipped${COLORS.reset} match_edges blocked by query_plan. Re-run with --force to execute anyway.\n`,
          );
        }
        return 1;
      }
    }
    result = await callMcpTool(vaultRoot, 'query_ontology', query);
    assertMatchEdgesShape(result);
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
      fallbackHint: 'add --from-kind, --to-kind, --type/--types, or lower --limit before scanning edges',
    });
  }
  render(result);
  return 0;
}

function render(result) {
  const edges = result?.edges ?? [];
  const total = result?.totalMatches ?? edges.length;
  const limited = result?.limited === true;
  process.stdout.write(
    `${COLORS.dim}match_edges${COLORS.reset} ${COLORS.bold}${edges.length}/${total}${COLORS.reset} edge(s)` +
      `${limited ? ` ${COLORS.dim}(limited)${COLORS.reset}` : ''}\n`,
  );
  const filterText = formatFilters(result?.filters);
  if (filterText) process.stdout.write(`${COLORS.dim}filters${COLORS.reset} ${filterText}\n`);
  process.stdout.write('\n');
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    const rank = String(index + 1).padStart(2);
    const fromKind = edge.fromNode?.kind || '?';
    const toKind = edge.toKind || '?';
    const fromColor = KIND_COLORS[fromKind] || COLORS.dim;
    const toColor = KIND_COLORS[toKind] || COLORS.dim;
    const fromTitle = edge.fromNode?.title ? ` ${COLORS.dim}— ${edge.fromNode.title}${COLORS.reset}` : '';
    const toTitle = edge.toNode?.title ? ` ${COLORS.dim}— ${edge.toNode.title}${COLORS.reset}` : '';
    process.stdout.write(
      `  ${COLORS.bold}${rank}${COLORS.reset} ${fromColor}${edge.from}${COLORS.reset}` +
        ` ${COLORS.yellow}--${edge.via}-->${COLORS.reset} ${toColor}${edge.to}${COLORS.reset}` +
        `${fromTitle}${toTitle} ${COLORS.dim}(${fromKind} → ${toKind})${COLORS.reset}\n`,
    );
  }
  const followUp = result?.followUp;
  if (followUp?.focusEdge && Array.isArray(followUp.cliFallbackCommands) && followUp.cliFallbackCommands.length > 0) {
    process.stdout.write(
      `\n${COLORS.dim}next${COLORS.reset} edge ${COLORS.bold}${followUp.focusEdge.from}${COLORS.reset}` +
        ` ${COLORS.yellow}--${followUp.focusEdge.via}-->${COLORS.reset} ` +
        `${COLORS.bold}${followUp.focusEdge.to}${COLORS.reset}` +
        `${COLORS.dim} — explain before treating a scan row as evidence${COLORS.reset}\n`,
    );
    for (const command of followUp.cliFallbackCommands.slice(0, 3)) {
      process.stdout.write(`  ${COLORS.cyan}${command}${COLORS.reset}\n`);
    }
  }
}

function formatFilters(filters = {}) {
  const parts = [];
  for (const [label, value] of [
    ['from', filters.from],
    ['to', filters.to],
    ['fromKind', filters.fromKind],
    ['toKind', filters.toKind],
    ['types', Array.isArray(filters.types) ? filters.types.join(',') : filters.types],
    ['includeExternal', filters.includeExternal],
    ['includeUnresolved', filters.includeUnresolved],
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
    from: undefined,
    to: undefined,
    fromKind: undefined,
    toKind: undefined,
    type: undefined,
    types: undefined,
    includeExternal: undefined,
    includeUnresolved: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--plan') flags.plan = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--include-external') flags.includeExternal = true;
    else if (a === '--include-unresolved') flags.includeUnresolved = true;
    else if (a === '--from') flags.from = parseRequiredFlagValue('--from', args[++i]);
    else if (a.startsWith('--from=')) flags.from = parseRequiredFlagValue('--from', a.slice('--from='.length));
    else if (a === '--to') flags.to = parseRequiredFlagValue('--to', args[++i]);
    else if (a.startsWith('--to=')) flags.to = parseRequiredFlagValue('--to', a.slice('--to='.length));
    else if (a === '--from-kind') flags.fromKind = parseRequiredFlagValue('--from-kind', args[++i]);
    else if (a.startsWith('--from-kind=')) flags.fromKind = parseRequiredFlagValue('--from-kind', a.slice('--from-kind='.length));
    else if (a === '--to-kind') flags.toKind = parseRequiredFlagValue('--to-kind', args[++i]);
    else if (a.startsWith('--to-kind=')) flags.toKind = parseRequiredFlagValue('--to-kind', a.slice('--to-kind='.length));
    else if (a === '--type') flags.type = parseRequiredFlagValue('--type', args[++i]);
    else if (a.startsWith('--type=')) flags.type = parseRequiredFlagValue('--type', a.slice('--type='.length));
    else if (a === '--types') flags.types = parseCsvListFlag('--types', args[++i], { itemName: 'relation type' });
    else if (a.startsWith('--types=')) flags.types = parseCsvListFlag('--types', a.slice('--types='.length), { itemName: 'relation type' });
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (flags.type && flags.types) return { error: 'pass either --type or --types, not both' };
  const fromKindError = validateKindValue('--from-kind', flags.fromKind);
  if (fromKindError) return { error: fromKindError };
  const toKindError = validateKindValue('--to-kind', flags.toKind, EDGE_TARGET_KIND_VALUES);
  if (toKindError) return { error: toKindError };
  const typeValues = flags.types ?? (flags.type ? [flags.type] : []);
  const typeError = validateRelationTypeList(typeValues, flags.types ? '--types items' : '--type');
  if (typeError) return { error: typeError.message };
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  const query = {
    operation: 'match_edges',
    limit: flags.limit,
    ...(flags.from ? { from: flags.from } : {}),
    ...(flags.to ? { to: flags.to } : {}),
    ...(flags.fromKind ? { fromKind: flags.fromKind } : {}),
    ...(flags.toKind ? { toKind: flags.toKind } : {}),
    ...(flags.type ? { type: flags.type } : {}),
    ...(flags.types ? { types: flags.types } : {}),
    ...(flags.includeExternal !== undefined ? { includeExternal: flags.includeExternal } : {}),
    ...(flags.includeUnresolved !== undefined ? { includeUnresolved: flags.includeUnresolved } : {}),
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
      `  oh-my-ontology match-edges [vault] [--from SLUG] [--to SLUG] [--from-kind K] [--to-kind K]\n` +
      `       [--type T | --types A,B] [--include-external] [--include-unresolved]\n` +
      `       [--limit N] [--plan] [--force] [--json]\n\n` +
      `Graph DB-style edge scan over the compiled ontology graph. --limit range 1-${LIMIT_CAP}.\n` +
      `--to-kind also accepts external or unresolved. Use --plan to run query_plan(match_edges) first.\n`,
  );
}
