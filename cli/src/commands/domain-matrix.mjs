// `oh-my-ontology domain-matrix [vault]` — domain coupling matrix.
// MCP `query_ontology({operation: 'domain_matrix'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertDomainMatrixShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--project', '--limit', '--types', '--json'];


export async function runDomainMatrix(args) {
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
    assertDomainMatrixShape(result);
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
  const summary = result.summary;
  process.stdout.write(
    `${COLORS.dim}domain_matrix${COLORS.reset} ${COLORS.bold}${summary.domains}${COLORS.reset} domain(s)` +
      ` · ${COLORS.bold}${summary.crossDomainEdges}${COLORS.reset} cross-domain edge(s)` +
      ` · ${COLORS.bold}${summary.selfDomainEdges}${COLORS.reset} self edge(s)` +
      ` · ${COLORS.bold}${summary.externalEdges}${COLORS.reset} external edge(s)` +
      ` · ${COLORS.bold}${summary.unresolvedEdges}${COLORS.reset} unresolved edge(s)\n`,
  );
  if (result.project) {
    process.stdout.write(`${COLORS.dim}project${COLORS.reset} ${result.project}\n`);
  }
  const types = Array.isArray(result.filters?.relationTypes)
    ? result.filters.relationTypes.join(',')
    : Array.isArray(result.filters?.types) ? result.filters.types.join(',') : '';
  if (types) {
    process.stdout.write(`${COLORS.dim}types${COLORS.reset} ${types}\n`);
  }
  process.stdout.write(
    `${COLORS.dim}nodes${COLORS.reset} ${summary.assignedNodes}/${summary.nodes} assigned` +
      (summary.unassignedNodes > 0 ? ` · ${summary.unassignedNodes} unassigned` : '') +
      '\n\n',
  );

  if (result.domains.length > 0) {
    process.stdout.write(`${COLORS.dim}DOMAINS${COLORS.reset}\n`);
    for (const domain of result.domains) {
      const title = domain.node.title && domain.node.title !== domain.slug
        ? ` ${COLORS.dim}— ${domain.node.title}${COLORS.reset}`
        : '';
      process.stdout.write(
        `  ${COLORS.blue}${domain.slug}${COLORS.reset}${title}` +
          ` ${COLORS.dim}nodes ${domain.nodes} · out ${domain.outgoing} · in ${domain.incoming}` +
          ` · self ${domain.selfEdges} · external ${domain.externalEdges}` +
          (domain.unresolvedEdges > 0 ? ` · unresolved ${domain.unresolvedEdges}` : '') +
          `${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const rows = result.connections.rows;
  const limited = result.connections.limited === true;
  process.stdout.write(
    `${COLORS.dim}CONNECTIONS${COLORS.reset} ${COLORS.bold}${rows.length}/${result.connections.total}${COLORS.reset}` +
      `${limited ? ` ${COLORS.dim}(limited)${COLORS.reset}` : ''}\n`,
  );
  if (rows.length === 0) {
    process.stdout.write(`  ${COLORS.dim}no cross-domain connections${COLORS.reset}\n`);
    return;
  }
  for (const row of rows) {
    process.stdout.write(
        `  ${COLORS.cyan}${row.from}${COLORS.reset} ${COLORS.dim}→${COLORS.reset} ` +
        `${COLORS.cyan}${row.to}${COLORS.reset} ${COLORS.bold}${row.count}${COLORS.reset}` +
        ` ${COLORS.dim}${formatRelationCounts(row.byRelationType || row.byRelation)}${COLORS.reset}\n`,
    );
    for (const example of row.examples.slice(0, 3)) {
      const relationLabel = example.relationType || example.via;
      process.stdout.write(
        `    ${COLORS.dim}ex${COLORS.reset} ${example.from} --${relationLabel}--> ${example.to}\n`,
      );
    }
  }
  const focus = rows.find((row) => Array.isArray(row.examples) && row.examples.length > 0);
  const example = focus?.examples?.[0];
  if (focus && example) {
    const relationLabel = example.relationType || example.via;
    process.stdout.write(
      `\n${COLORS.dim}next${COLORS.reset} coupling ${COLORS.bold}${focus.from}${COLORS.reset}` +
        ` ${COLORS.dim}→${COLORS.reset} ${COLORS.bold}${focus.to}${COLORS.reset}` +
        `${COLORS.dim} — matrix rows are hotspots, not proof; inspect matching edges before boundary decisions${COLORS.reset}\n`,
    );
    process.stdout.write(
      `  ${COLORS.cyan}oh-my-ontology match-edges [vault] --from ${example.from} --to ${example.to} --types ${relationLabel} --limit 20${COLORS.reset}\n`,
    );
    process.stdout.write(
      `  ${COLORS.cyan}oh-my-ontology explain ${example.from} ${example.to} [vault] --direction undirected --max-hops 5 --types ${relationLabel} --limit 10${COLORS.reset}\n`,
    );
  }
}

function formatRelationCounts(bucket) {
  return Object.entries(bucket)
    .map(([relation, count]) => `${relation}:${count}`)
    .join(', ');
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    limit: 100,
    project: undefined,
    types: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--project') flags.project = parseRequiredFlagValue('--project', args[++i]);
    else if (a.startsWith('--project=')) flags.project = parseRequiredFlagValue('--project', a.slice('--project='.length));
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
  const typeError = validateRelationTypeList(flags.types ?? [], '--types items');
  if (typeError) return { error: typeError.message };
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    query: {
      operation: 'domain_matrix',
      limit: flags.limit,
      ...(flags.project ? { project: flags.project } : {}),
      ...(flags.types ? { types: flags.types } : {}),
    },
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology domain-matrix [vault] [--project SLUG] [--types A,B] [--limit N] [--json]\n\n` +
      `Domain coupling matrix over the compiled ontology graph. --limit range 1-${LIMIT_CAP}.\n` +
      `Use --project to scope the matrix to one project containment tree.\n` +
      `Use --types to focus semantic coupling, e.g. --types depends_on,relates,describes.\n`,
  );
}
