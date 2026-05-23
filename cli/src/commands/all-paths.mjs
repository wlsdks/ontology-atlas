// `oh-my-ontology all-paths <from> <to> [vault]`
// Bounded simple path enumeration over MCP query_ontology(all_paths). This is
// the CLI pair to agent_brief's traversal contract: report completeness
// metadata before using path absence as evidence.

import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  assertAllPathsShape,
  assertQueryPlanShape,
  allPathsResultExitCode,
} from '../lib/query-result-contract.mjs';
import {
  formatQueryHint,
  printQueryPlan,
  shouldBlockPlannedExecution,
} from '../lib/query-plan-output.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const MAX_HOPS_CAP = 20;
const LIMIT_CAP = 500;
const SEARCH_BUDGET_CAP = 50000;
const ALLOWED_FLAGS = [
  '--vault',
  '--max-hops',
  '--limit',
  '--search-budget',
  '--types',
  '--plan',
  '--force',
  '--json',
];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runAllPaths(args) {
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

  const { from, to, vault, maxHops, limit, searchBudget, types, plan: shouldPlan, force, json } = parsed;
  const vaultRoot = resolveVaultRoot(vault);
  let plan = null;
  let result;
  try {
    const query = {
      operation: 'all_paths',
      from,
      to,
      ...(typeof maxHops === 'number' ? { maxHops } : {}),
      ...(typeof limit === 'number' ? { limit } : {}),
      ...(typeof searchBudget === 'number' ? { searchBudget } : {}),
      ...(types ? { types } : {}),
    };
    if (shouldPlan) {
      plan = await callMcpTool(vaultRoot, 'query_ontology', {
        ...query,
        operation: 'query_plan',
        targetOperation: 'all_paths',
      });
      assertQueryPlanShape(plan, 'all_paths');
      if (shouldBlockPlannedExecution(plan) && !force) {
        if (json) {
          process.stdout.write(JSON.stringify({ plan, skipped: true }, null, 2) + '\n');
        } else {
          printQueryPlan(plan, COLORS);
          process.stdout.write(
            `\n${COLORS.yellow}skipped${COLORS.reset} enumeration blocked by query_plan. Re-run with --force to execute anyway.\n`,
          );
        }
        return 1;
      }
    }
    result = await callMcpTool(vaultRoot, 'query_ontology', query);
    assertAllPathsShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (json) {
    process.stdout.write(JSON.stringify(plan ? { plan, result } : result, null, 2) + '\n');
    return allPathsResultExitCode(result);
  }

  if (plan) printQueryPlan(plan, COLORS);
  printHuman(result);
  return allPathsResultExitCode(result);
}

function printHuman(result) {
  const evidenceColor = result.evidence.status === 'complete' ? COLORS.green : COLORS.yellow;
  const typeLabel = Array.isArray(result.evidence.suggestedQuery?.types)
    ? ` types=${result.evidence.suggestedQuery.types.join(',')}`
    : '';
  process.stdout.write(
    `${COLORS.bold}${result.from}${COLORS.reset} ${COLORS.dim}⇄${COLORS.reset} ${COLORS.bold}${result.to}${COLORS.reset}` +
      ` ${COLORS.dim}— all_paths maxHops=${result.maxHops} limit=${result.limit} searchBudget=${result.searchBudget}${typeLabel}${COLORS.reset}\n`,
  );
  process.stdout.write(
    `  ${COLORS.bold}evidence${COLORS.reset} ${evidenceColor}${result.evidence.status}${COLORS.reset}` +
      ` ${COLORS.dim}reason=${result.evidence.reason} pathsComplete=${result.evidence.pathsComplete}` +
      ` totalPathsExact=${result.totalPathsExact} expandedStates=${result.expandedStates}${COLORS.reset}\n`,
  );
  process.stdout.write(
    `  ${COLORS.bold}paths${COLORS.reset} returned=${result.paths.length}/${result.totalPaths}` +
      ` ${COLORS.dim}shortest=${result.shortestHopCount ?? 'n/a'} exhaustive=${result.exhaustive} truncatedByBudget=${result.truncatedByBudget}${COLORS.reset}\n`,
  );

  if (!result.found) {
    process.stdout.write(
      `\n${COLORS.dim}no paths within the requested bounds. Treat absence as complete only when evidence.pathsComplete=true.${COLORS.reset}\n`,
    );
    return;
  }

  if (!result.evidence.pathsComplete) {
    const next = result.evidence.saferQuery ?? result.evidence.suggestedQuery;
    process.stdout.write(
      `  ${COLORS.yellow}next${COLORS.reset} ${result.evidence.recommendation}\n` +
        `       ${formatQueryHint(next)}\n`,
    );
  }

  for (let index = 0; index < result.paths.length; index += 1) {
    const path = result.paths[index];
    process.stdout.write(`\n  ${COLORS.bold}#${index + 1}${COLORS.reset} ${path.hopCount} hop${path.hopCount === 1 ? '' : 's'}\n`);
    for (let hopIndex = 0; hopIndex < path.hops.length; hopIndex += 1) {
      process.stdout.write(`    ${formatHop(path.nodes[hopIndex])}\n`);
      if (hopIndex < path.hops.length - 1) {
        const via = path.edges[hopIndex]?.via;
        process.stdout.write(`      ${COLORS.dim}↓ via${COLORS.reset} ${COLORS.yellow}${via}${COLORS.reset}\n`);
      }
    }
  }
}

function formatHop(node) {
  if (!node?.title || node.title === node.slug) {
    return `${COLORS.cyan}${node.slug}${COLORS.reset}`;
  }
  return `${COLORS.cyan}${node.slug}${COLORS.reset} ${COLORS.dim}— ${node.title}${COLORS.reset}`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    plan: false,
    force: false,
    maxHops: undefined,
    limit: undefined,
    searchBudget: undefined,
    types: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--plan') flags.plan = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--max-hops') {
      flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', args[++i], { max: MAX_HOPS_CAP });
    } else if (a.startsWith('--max-hops=')) {
      flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', a.slice('--max-hops='.length), { max: MAX_HOPS_CAP });
    } else if (a === '--limit') {
      flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    } else if (a.startsWith('--limit=')) {
      flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    } else if (a === '--search-budget') {
      flags.searchBudget = parseBoundedPositiveIntegerFlag('--search-budget', args[++i], { max: SEARCH_BUDGET_CAP });
    } else if (a.startsWith('--search-budget=')) {
      flags.searchBudget = parseBoundedPositiveIntegerFlag('--search-budget', a.slice('--search-budget='.length), { max: SEARCH_BUDGET_CAP });
    } else if (a === '--types') {
      flags.types = parseCsvListFlag('--types', args[++i], { itemName: 'relation type' });
    } else if (a.startsWith('--types=')) {
      flags.types = parseCsvListFlag('--types', a.slice('--types='.length), { itemName: 'relation type' });
    } else if (a.startsWith('-')) {
      return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    return { error: 'both <from> and <to> are required' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (flags.types) {
    const typeError = validateRelationTypeList(flags.types, '--types items');
    if (typeError) return { error: typeError.message };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 2 });
  if (vaultResult.error) return vaultResult;
  return {
    from: positional[0],
    to: positional[1],
    vault: vaultResult.vault,
    json: flags.json,
    plan: flags.plan,
    force: flags.force,
    maxHops: flags.maxHops,
    limit: flags.limit,
    searchBudget: flags.searchBudget,
    types: flags.types,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
      `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology all-paths <from> <to> [vault] [--max-hops N] [--limit N] [--search-budget N] [--types A,B] [--plan] [--force] [--vault path] [--json]\n\n` +
      `Enumerates bounded simple paths via MCP query_ontology(all_paths). found=false exits 1. ` +
      `Use --plan to run query_plan(all_paths) first; expensive or warning plans skip enumeration unless --force is passed.\n` +
      `Always inspect evidence.pathsComplete and totalPathsExact before using absence as proof.\n\n` +
      `${COLORS.bold}Ranges:${COLORS.reset}\n` +
      `  --max-hops 0-${MAX_HOPS_CAP}, --limit 1-${LIMIT_CAP}, --search-budget 1-${SEARCH_BUDGET_CAP}\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  oh-my-ontology all-paths capabilities/session domains/auth --plan --max-hops 3 --types depends_on,relates\n` +
      `  oh-my-ontology all-paths project elements/sigma-graphology --limit 10 --search-budget 1000 --json\n`,
  );
}
