// `oh-my-ontology growth [vault]` — graph growth candidate dashboard.
// MCP `query_ontology({operation: 'growth_plan'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertGrowthPlanShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--json', '--limit'];

const COLORS = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
  red: '\x1b[31m',
};

const GROUPS = [
  ['relationRecommendations', 'relation recommendations', 'recommendations'],
  ['externalElementRefs', 'external element refs', 'rows'],
  ['danglingReferences', 'dangling references', 'rows'],
  ['unassignedNodes', 'unassigned nodes', 'rows'],
  ['emptyDomains', 'empty domains', 'rows'],
];

export async function runGrowth(args) {
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
    result = await callMcpTool(vaultRoot, 'query_ontology', {
      operation: 'growth_plan',
      limit: parsed.limit,
    });
    assertGrowthPlanShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (parsed.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  renderGrowth(result);
  return 0;
}

function renderGrowth(result) {
  const summary = result.summary;
  process.stdout.write(
    `${COLORS.bold}growth plan${COLORS.reset}` +
      ` ${COLORS.dim}— ${summary.totalActions} actions${COLORS.reset}\n`,
  );
  process.stdout.write(
    `${COLORS.dim}summary:${COLORS.reset} ` +
      [
        `relations:${summary.relationRecommendations}`,
        `external:${summary.externalElementRefs}`,
        `ignoredExternal:${summary.externalElementRefsIgnored}`,
        `dangling:${summary.danglingReferences}`,
        `unassigned:${summary.unassignedNodes}`,
        `emptyDomains:${summary.emptyDomains}`,
      ].join(', ') +
      '\n',
  );
  if (result.compiledSummary) {
    const compiled = result.compiledSummary;
    process.stdout.write(
      `${COLORS.dim}compiled:${COLORS.reset} nodes:${compiled.nodes ?? '?'} edges:${compiled.edges ?? '?'} issues:${compiled.issues ?? '?'} unresolved:${compiled.unresolvedEdges ?? '?'}\n`,
    );
  }
  process.stdout.write('\n');

  if (summary.totalActions === 0) {
    process.stdout.write(`${COLORS.green}no growth candidates${COLORS.reset}\n`);
    return;
  }

  for (const [key, label, rowsKey] of GROUPS) {
    const group = result[key];
    const rows = group?.[rowsKey] ?? [];
    const total = key === 'relationRecommendations' ? group.totalRecommendations : group.total;
    if (!total) continue;
    process.stdout.write(`${COLORS.bold}${label}${COLORS.reset} ${COLORS.dim}— ${rows.length}/${total}${group.limited ? ' limited' : ''}${COLORS.reset}\n`);
    for (const row of rows) renderGrowthRow(row);
    process.stdout.write('\n');
  }
}

function renderGrowthRow(row) {
  const subject = row.from && row.to
    ? `${row.from} -> ${row.to}`
    : row.from && row.ref
      ? `${row.from} -> ${row.ref}`
      : row.slug || row.domain || row.ref || row.kind;
  process.stdout.write(
    `  ${COLORS.cyan}${row.kind}${COLORS.reset}` +
      ` ${COLORS.dim}score ${row.score ?? '?'}${COLORS.reset}` +
      ` ${subject}\n`,
  );
  if (row.reason) process.stdout.write(`       ${COLORS.dim}${row.reason}${COLORS.reset}\n`);
  if (row.proposedAction?.tool) {
    process.stdout.write(
      `       ${COLORS.cyan}${row.proposedAction.tool}${COLORS.reset}` +
        ` ${COLORS.dim}${JSON.stringify(row.proposedAction.args ?? {})}${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 20 };
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

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology growth [vault] [--vault path] [--json] [--limit N]\n\n` +
      `Inspect MCP growth_plan candidates without writing to the vault.\n` +
      `Non-JSON output includes relation recommendations, external element refs,\n` +
      `dangling references, unassigned nodes, empty domains, and ignored external refs.\n` +
      `--limit range 1-${LIMIT_CAP}.\n`,
  );
}
