// `oh-my-ontology hubs [vault]` — centrality 기반 hub 노드 ranking.
// MCP `query_ontology({operation: 'centrality'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  assertCentralityShape,
  assertQueryPlanShape,
} from '../lib/query-result-contract.mjs';
import {
  printQueryPlan,
  shouldBlockPlannedExecution,
} from '../lib/query-plan-output.mjs';
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
const ALLOWED_FLAGS = ['--vault', '--limit', '--types', '--plan', '--force', '--json'];

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

export async function runHubs(args) {
  const { vault, json, limit, types, plan: shouldPlan, force, error, help } = parseArgs(args);
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
  let plan = null;
  let result;
  try {
    const query = {
      operation: 'centrality',
      limit,
      ...(types.length > 0 ? { types } : {}),
    };
    if (shouldPlan) {
      plan = await callMcpTool(vaultRoot, 'query_ontology', {
        ...query,
        operation: 'query_plan',
        targetOperation: 'centrality',
      });
      assertQueryPlanShape(plan, 'centrality');
      if (shouldBlockPlannedExecution(plan) && !force) {
        if (json) {
          process.stdout.write(JSON.stringify({ plan, skipped: true }, null, 2) + '\n');
        } else {
          printQueryPlan(plan, COLORS, {
            fallbackHint: 'lower --limit, add --types, or reduce graph scope before ranking',
          });
          process.stdout.write(
            `\n${COLORS.yellow}skipped${COLORS.reset} centrality blocked by query_plan. Re-run with --force to execute anyway.\n`,
          );
        }
        return 1;
      }
    }
    result = await callMcpTool(vaultRoot, 'query_ontology', query);
    assertCentralityShape(result);
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
      fallbackHint: 'lower --limit, add --types, or reduce graph scope before ranking',
    });
  }
  render(result);
  return 0;
}

function render(result) {
  const r = result?.rankings ?? {};
  const sections = [
    ['PageRank (영향력)', r.pageRank, 'pageRank'],
    ['Bridges (도메인 사이 잇는 노드)', r.bridges, 'bridgeScore'],
    ['Authorities (많이 referenced)', r.authorities, 'inDegree'],
    ['Hubs (많이 reference)', r.hubs, 'outDegree'],
  ];
  for (const [title, rows, scoreKey] of sections) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    process.stdout.write(`${COLORS.dim}${title}${COLORS.reset}\n`);
    for (let i = 0; i < rows.length; i += 1) {
      const h = rows[i];
      const kc = KIND_COLORS[h.kind] || COLORS.dim;
      const rank = String(i + 1).padStart(2);
      const slug = h.slug.padEnd(50);
      const score =
        typeof h[scoreKey] === 'number' ? h[scoreKey].toFixed(scoreKey === 'pageRank' ? 4 : 0) : '-';
      const deg = `${COLORS.dim}${scoreKey} ${score}${COLORS.reset} ${COLORS.dim}(deg ${h.degree})${COLORS.reset}`;
      const titleText = h.title && h.title !== h.slug ? ` ${COLORS.dim}— ${h.title}${COLORS.reset}` : '';
      process.stdout.write(`  ${COLORS.bold}${rank}${COLORS.reset} ${kc}${slug}${COLORS.reset}${titleText} ${deg}\n`);
    }
    process.stdout.write('\n');
  }
  const focus =
    (Array.isArray(r.pageRank) && r.pageRank[0]) ||
    (Array.isArray(r.bridges) && r.bridges[0]) ||
    (Array.isArray(r.authorities) && r.authorities[0]) ||
    (Array.isArray(r.hubs) && r.hubs[0]);
  if (focus?.slug) {
    process.stdout.write(
      `${COLORS.dim}next${COLORS.reset} hub ${COLORS.bold}${focus.slug}${COLORS.reset}` +
        `${COLORS.dim} — ranking rows are hotspots, not proof; inspect the node and impact before onboarding/refactor decisions${COLORS.reset}\n`,
    );
    process.stdout.write(`  ${COLORS.cyan}oh-my-ontology node ${focus.slug} [vault] --limit 20${COLORS.reset}\n`);
    process.stdout.write(
      `  ${COLORS.cyan}oh-my-ontology blast-radius ${focus.slug} [vault] --plan --depth 2 --direction both${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 10, types: [], plan: false, force: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--plan') flags.plan = true;
    else if (a === '--force') flags.force = true;
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
    plan: flags.plan,
    force: flags.force,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology hubs [vault] [--limit N] [--types A,B] [--plan] [--force] [--json]\n\n` +
      `--limit range 1-${LIMIT_CAP}. --types narrows relation types before PageRank.\n` +
      `Use --plan to run query_plan(centrality) first; expensive or warning plans skip execution unless --force is passed.\n` +
      `4 rankings: PageRank (영향력) · Bridges (도메인 잇는) · Authorities (referenced) · Hubs (referencing).\n`,
  );
}
