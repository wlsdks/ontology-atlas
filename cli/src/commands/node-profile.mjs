// `ontology-atlas node <slug> [vault]` — a full deep dive on one node.
// Thin wrapper over MCP `query_ontology({operation: 'node_profile'})`.
// Header, domain, containment lineage, and incoming/outgoing edges grouped by
// relation, all on one screen.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertNodeProfileShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--limit', '--types', '--no-external', '--no-unresolved'];


export async function runNodeProfile(args) {
  const {
    slug,
    vault,
    json,
    limit,
    types,
    includeExternal,
    includeUnresolved,
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
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', {
      operation: 'node_profile',
      slug,
      limit,
      types,
      includeExternal,
      includeUnresolved,
    });
    assertNodeProfileShape(result);
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
  render(result, { types, includeExternal, includeUnresolved });
  return 0;
}

function render(result, filters = {}) {
  const n = result?.node;
  if (!n) {
    process.stdout.write(`${COLORS.dim}node not found${COLORS.reset}\n`);
    return;
  }
  const kc = KIND_COLORS[n.kind] || COLORS.dim;
  const deg = result?.degree ?? { in: 0, out: 0, total: 0 };

  // Header
  process.stdout.write(
    `${kc}${(n.kind || '?').padEnd(11)}${COLORS.reset} ${COLORS.bold}${n.title || n.slug}${COLORS.reset}\n` +
      `  ${COLORS.dim}slug${COLORS.reset}    ${n.slug}\n` +
      (n.domain ? `  ${COLORS.dim}domain${COLORS.reset}  ${COLORS.blue}${n.domain}${COLORS.reset}\n` : '') +
      `  ${COLORS.dim}degree${COLORS.reset}  ${COLORS.bold}${deg.total}${COLORS.reset}` +
      ` ${COLORS.dim}(in ${deg.in} · out ${deg.out})${COLORS.reset}\n`,
  );

  // Aliases
  const aliases = Array.isArray(result?.aliases) ? result.aliases : [];
  const extraAliases = aliases.filter((a) => a !== n.slug);
  if (extraAliases.length > 0) {
    process.stdout.write(`  ${COLORS.dim}aliases${COLORS.reset} ${extraAliases.join(', ')}\n`);
  }
  if (hasActiveEdgeFilter(filters)) {
    process.stdout.write(`  ${COLORS.dim}filters${COLORS.reset} ${formatActiveEdgeFilters(filters)}\n`);
  }

  // Lineage (ancestor chain — project ← domain ← capability)
  const ancestors = result?.lineage?.ancestors?.nodes ?? [];
  if (ancestors.length > 0) {
    const chain = ancestors
      .slice()
      .sort((a, b) => b.distance - a.distance) // farthest first (project → nearest)
      .map((a) => {
        const ac = KIND_COLORS[a.node?.kind] || COLORS.dim;
        return `${ac}${a.node?.title || a.slug}${COLORS.reset}`;
      });
    process.stdout.write(
      `\n${COLORS.dim}LINEAGE${COLORS.reset}  ${chain.join(` ${COLORS.dim}→${COLORS.reset} `)} ${COLORS.dim}→${COLORS.reset} ${kc}${n.title || n.slug}${COLORS.reset}\n`,
    );
  }

  // Incoming edges
  const incoming = result?.edges?.incoming;
  if (incoming?.total > 0) {
    process.stdout.write(
      `\n${COLORS.dim}INCOMING${COLORS.reset} ${COLORS.bold}${incoming.total}${COLORS.reset}` +
        ` ${COLORS.dim}· what references this node${COLORS.reset}\n`,
    );
    renderEdgesByRelation(incoming.edges, 'from');
    renderLimitedHint(incoming, 'incoming');
  }

  // Outgoing edges
  const outgoing = result?.edges?.outgoing;
  if (outgoing?.total > 0) {
    process.stdout.write(
      `\n${COLORS.dim}OUTGOING${COLORS.reset} ${COLORS.bold}${outgoing.total}${COLORS.reset}` +
        ` ${COLORS.dim}· what this node references${COLORS.reset}\n`,
    );
    renderEdgesByRelation(outgoing.edges, 'to');
    renderLimitedHint(outgoing, 'outgoing');
  }

  if ((incoming?.total ?? 0) === 0 && (outgoing?.total ?? 0) === 0) {
    if (hasActiveEdgeFilter(filters)) {
      process.stdout.write(`\n${COLORS.dim}no matching edges for current filters${COLORS.reset}\n`);
    } else {
      process.stdout.write(`\n${COLORS.dim}isolated: connected to no other node${COLORS.reset}\n`);
    }
  }
}

function hasActiveEdgeFilter({ types, includeExternal, includeUnresolved } = {}) {
  return (
    (Array.isArray(types) && types.length > 0) ||
    includeExternal === false ||
    includeUnresolved === false
  );
}

function formatActiveEdgeFilters({ types, includeExternal, includeUnresolved } = {}) {
  const parts = [];
  if (Array.isArray(types) && types.length > 0) parts.push(`types=${types.join(',')}`);
  if (includeExternal === false) parts.push('external=false');
  if (includeUnresolved === false) parts.push('unresolved=false');
  return parts.join(' · ') || 'none';
}

function renderEdgesByRelation(edges, peerField) {
  // Grouped by relation (the via key)
  const grouped = new Map();
  for (const e of edges) {
    const key = e.relationType || e.via || '?';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(e);
  }
  // Highest relation count first
  const sorted = [...grouped.entries()].sort(([, a], [, b]) => b.length - a.length);
  for (const [via, rows] of sorted) {
    process.stdout.write(`  ${COLORS.yellow}${via}${COLORS.reset} ${COLORS.dim}× ${rows.length}${COLORS.reset}\n`);
    for (const e of rows) {
      const other = e[peerField];
      const otherKind = e.otherKind || (e.external ? 'external' : '?');
      const kc = KIND_COLORS[otherKind] || COLORS.dim;
      const title = e.otherNode?.title ? ` ${COLORS.dim}· ${e.otherNode.title}${COLORS.reset}` : '';
      const externalMark = e.external ? ` ${COLORS.dim}[external]${COLORS.reset}` : '';
      process.stdout.write(`    ${kc}${other}${COLORS.reset}${title}${externalMark}\n`);
    }
  }
}

function renderLimitedHint(group, label) {
  if (!group?.limited) return;
  const shown = Array.isArray(group.edges) ? group.edges.length : 0;
  process.stdout.write(
    `  ${COLORS.dim}${label} edges limited: showing ${shown}/${group.total}; use --limit N for more.${COLORS.reset}\n`,
  );
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    limit: undefined,
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
    else if (a === '--limit') {
      const limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: 500 });
      if (limit instanceof Error) return { error: limit.message };
      flags.limit = limit;
    } else if (a.startsWith('--limit=')) {
      const limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: 500 });
      if (limit instanceof Error) return { error: limit.message };
      flags.limit = limit;
    } else if (a === '--types') {
      const types = parseRelationTypes(args[++i]);
      if (types instanceof Error) return { error: types.message };
      flags.types = types;
    } else if (a.startsWith('--types=')) {
      const types = parseRelationTypes(a.slice('--types='.length));
      if (types instanceof Error) return { error: types.message };
      flags.types = types;
    } else if (a === '--no-external') {
      flags.includeExternal = false;
    } else if (a === '--no-unresolved') {
      flags.includeUnresolved = false;
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'slug is required (e.g. `node capabilities/foo`)' };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    slug: positional[0],
    vault: vaultResult.vault,
    json: flags.json,
    limit: flags.limit,
    types: flags.types,
    includeExternal: flags.includeExternal,
    includeUnresolved: flags.includeUnresolved,
  };
}

function parseRelationTypes(value) {
  const types = parseCsvListFlag('--types', value, { itemName: 'relation type' });
  if (types instanceof Error) return types;
  const invalid = validateRelationTypeList(types, '--types items');
  return invalid || types;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas node <slug> [vault] [--limit N] [--types A,B] [--no-external] [--no-unresolved] [--json]\n\n` +
      `A full deep dive on one node: header · domain · lineage · incoming/outgoing edges, grouped by relation.\n` +
      `--limit N caps incoming/outgoing edge, lineage and containment rows, from 1 to 500.\n` +
      `--types A,B filters by relation type first. Example: --types dependencies,relates\n` +
      `--no-external / --no-unresolved hide external-file refs or unresolved refs from the edge list.\n`,
  );
}
