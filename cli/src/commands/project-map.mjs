// `oh-my-ontology project-map <project> [vault]` — domain-by-domain project map.
// MCP `query_ontology({operation: 'project_map'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--limit', '--item-limit', '--json'];


export async function runProjectMap(args) {
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
    assertProjectMapShape(result);
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
  render(result);
  return 0;
}

function render(result) {
  const summary = result.summary ?? {};
  process.stdout.write(
    `${COLORS.dim}project_map${COLORS.reset} ${COLORS.bold}${result.project}${COLORS.reset}\n` +
      `  ${summary.nodes ?? 0} node(s)` +
      ` · ${summary.domains ?? 0} domain(s)` +
      ` · ${summary.capabilities ?? 0} capability node(s)` +
      ` · ${summary.elements ?? 0} element node(s)` +
      ` · ${summary.boundaryEdges ?? 0} boundary edge(s)` +
      ` · ${summary.externalEdges ?? 0} external edge(s)\n\n`,
  );

  if (result.domains.length > 0) {
    process.stdout.write(`${COLORS.dim}domains${COLORS.reset}\n`);
    for (const row of result.domains) {
      const title = row.node?.title && row.node.title !== row.slug
        ? ` ${COLORS.dim}— ${row.node.title}${COLORS.reset}`
        : '';
      const rowSummary = row.summary ?? {};
      process.stdout.write(
        `  ${COLORS.blue}${row.slug}${COLORS.reset}${title}` +
          ` ${COLORS.dim}nodes ${rowSummary.nodes ?? 0} · capabilities ${rowSummary.capabilities ?? 0} · elements ${rowSummary.elements ?? 0}` +
          ` · internal ${rowSummary.internalEdges ?? 0} · boundary ${rowSummary.boundaryEdges ?? 0}${COLORS.reset}\n`,
      );
      const items = [
        ...(row.capabilities?.nodes ?? []),
        ...(row.elements?.nodes ?? []),
      ];
      for (const item of items.slice(0, 5)) {
        process.stdout.write(`    ${item.kind.padEnd(10)} ${item.slug}\n`);
      }
      if (row.capabilities?.limited || row.elements?.limited) {
        process.stdout.write(`    ${COLORS.dim}limited; increase --item-limit for more rows${COLORS.reset}\n`);
      }
    }
  } else {
    process.stdout.write(`${COLORS.dim}no domain rows in project scope${COLORS.reset}\n`);
  }

  if (result.unassigned?.total > 0) {
    process.stdout.write(`\n${COLORS.dim}unassigned${COLORS.reset} ${result.unassigned.nodes.length}/${result.unassigned.total}\n`);
    for (const node of result.unassigned.nodes.slice(0, 8)) {
      process.stdout.write(`  ${node.kind.padEnd(10)} ${node.slug}\n`);
    }
  }

  const focus = result.domains.find((row) =>
    (row.capabilities?.nodes?.length ?? 0) > 0 || (row.elements?.nodes?.length ?? 0) > 0,
  );
  if (focus) {
    process.stdout.write(
      `\n${COLORS.dim}next${COLORS.reset} domain ${COLORS.bold}${focus.slug}${COLORS.reset}` +
        `${COLORS.dim} — map rows are placement evidence; inspect the domain and containment path before moving nodes${COLORS.reset}\n`,
    );
    process.stdout.write(`  ${COLORS.cyan}oh-my-ontology node ${focus.slug} [vault] --limit 20${COLORS.reset}\n`);
    process.stdout.write(`  ${COLORS.cyan}oh-my-ontology pattern-walk ${result.project} [vault] --pattern domains,capabilities --limit 20${COLORS.reset}\n`);
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    limit: undefined,
    itemLimit: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--item-limit') flags.itemLimit = parseBoundedPositiveIntegerFlag('--item-limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--item-limit=')) flags.itemLimit = parseBoundedPositiveIntegerFlag('--item-limit', a.slice('--item-limit='.length), { max: LIMIT_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'project slug is required (e.g. `project-map project/app`)' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    query: {
      operation: 'project_map',
      project: positional[0],
      ...(flags.limit ? { limit: flags.limit } : {}),
      ...(flags.itemLimit ? { itemLimit: flags.itemLimit } : {}),
    },
  };
}

function assertProjectMapShape(result) {
  if (!result || result.operation !== 'project_map') {
    throw new Error('project_map returned unexpected operation');
  }
  if (typeof result.project !== 'string' || !result.summary || typeof result.summary !== 'object') {
    throw new Error('project_map result must include project and summary');
  }
  if (!Array.isArray(result.domains) || !result.unassigned || !Array.isArray(result.unassigned.nodes)) {
    throw new Error('project_map result must include domains and unassigned.nodes');
  }
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology project-map <project> [vault] [--limit N] [--item-limit N] [--json]\n\n` +
      `Print a domain-by-domain project containment map for connector-less graph traversal checks.\n`,
  );
}
