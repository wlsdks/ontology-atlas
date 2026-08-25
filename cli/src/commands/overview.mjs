// `ontology-atlas overview [vault]`
// The vault's first-contact dashboard — counts, relation distribution, hub nodes.
// Thin wrapper over MCP `query_ontology({operation: 'overview'})`.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertOverviewShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--limit', '--json'];



export async function runOverview(args) {
  const { vault, json, hubsLimit, error, help } = parseArgs(args);
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
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'overview' });
    assertOverviewShape(result);
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

  renderOverview(result, hubsLimit);
  return 0;
}

function renderOverview(result, hubsLimit) {
  const graph = result?.graph ?? {};
  const byKind = result?.byKind ?? {};
  const byDomain = result?.byDomain ?? {};
  const byRelation = result?.byRelation ?? {};
  const hubs = Array.isArray(result?.hubs) ? result.hubs : [];

  // Header — the graph in one line.
  const nodes = graph.nodes ?? 0;
  const edges = graph.edges ?? 0;
  const resolved = graph.resolvedEdges ?? 0;
  const external = graph.externalEdges ?? 0;
  const unresolved = graph.unresolvedEdges ?? 0;
  const referencedOnly = graph.referencedOnly ?? 0;
  process.stdout.write(
    `${COLORS.bold}vault overview${COLORS.reset}` +
      ` ${COLORS.dim}· ${nodes} nodes · ${edges} relations (resolved ${resolved} · external ${external}${unresolved ? ` · unresolved ${unresolved}` : ''})${COLORS.reset}\n`,
  );
  // The screens (map, insights) count concepts named without a document too, so
  // their total is larger. Leaving that unexplained here would give two entrances
  // different numbers for one vault with neither saying why.
  if (referencedOnly > 0) {
    process.stdout.write(
      `${COLORS.dim}  ${nodes} concepts with a document + ${referencedOnly} named only in a reference = ${nodes + referencedOnly} counted by the map${COLORS.reset}\n`,
    );
  }
  // The relation count states its scope for the same reason (measured 2026-07-27:
  // web 448 vs here 542). Here, **one relation per reference written in the
  // frontmatter** is counted — a domain writing `capabilities:` and a capability
  // writing `domain:` for the same containment counts as 2. The map and insights
  // fold that one fact into a single relation.
  if (edges > 0) {
    process.stdout.write(
      `${COLORS.dim}  ${edges} relations counts written references: when both documents write the same relation it counts twice (the map folds it to one)${COLORS.reset}\n`,
    );
  }
  process.stdout.write('\n');

  // Kind distribution — count per kind plus a coloured bar.
  if (Object.keys(byKind).length > 0) {
    process.stdout.write(`${COLORS.dim}KIND distribution${COLORS.reset}\n`);
    const total = Object.values(byKind).reduce((sum, n) => sum + n, 0) || 1;
    for (const [kind, count] of sortByCount(byKind)) {
      const pct = Math.round((count / total) * 100);
      const bar = '█'.repeat(Math.max(1, Math.round((count / total) * 20)));
      const kc = KIND_COLORS[kind] || COLORS.dim;
      process.stdout.write(
        `  ${kc}${kind.padEnd(14)}${COLORS.reset} ${String(count).padStart(3)} ${COLORS.dim}${pct}%${COLORS.reset}  ${kc}${bar}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // Relation type distribution.
  if (Object.keys(byRelation).length > 0) {
    process.stdout.write(`${COLORS.dim}Relation-type distribution${COLORS.reset}\n`);
    const total = Object.values(byRelation).reduce((sum, n) => sum + n, 0) || 1;
    for (const [rel, count] of sortByCount(byRelation)) {
      const pct = Math.round((count / total) * 100);
      const bar = '─'.repeat(Math.max(1, Math.round((count / total) * 20)));
      process.stdout.write(
        `  ${COLORS.yellow}${rel.padEnd(14)}${COLORS.reset} ${String(count).padStart(3)} ${COLORS.dim}${pct}%${COLORS.reset}  ${COLORS.dim}${bar}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // Domain distribution (only when present).
  if (Object.keys(byDomain).length > 0) {
    process.stdout.write(`${COLORS.dim}Domain distribution${COLORS.reset}\n`);
    for (const [dom, count] of sortByCount(byDomain)) {
      process.stdout.write(
        `  ${COLORS.blue}${dom.padEnd(28)}${COLORS.reset} ${String(count).padStart(3)} nodes\n`,
      );
    }
    process.stdout.write('\n');
  }

  // Hub nodes — highest degree, excluding document / vault-readme.
  if (hubs.length > 0) {
    const cap = Math.min(hubs.length, hubsLimit);
    process.stdout.write(`${COLORS.dim}Hub nodes${COLORS.reset} ${COLORS.dim}(top ${cap} by degree, document/project excluded)${COLORS.reset}\n`);
    for (let i = 0; i < cap; i += 1) {
      const h = hubs[i];
      const kc = KIND_COLORS[h.kind] || COLORS.dim;
      const rank = String(i + 1).padStart(2);
      const slug = h.slug.padEnd(50);
      const deg = `${COLORS.dim}deg ${h.degree}${COLORS.reset}` +
        ` ${COLORS.dim}(in ${h.inDegree} · out ${h.outDegree})${COLORS.reset}`;
      const titleText = h.title && h.title !== h.slug ? ` ${COLORS.dim}· ${h.title}${COLORS.reset}` : '';
      process.stdout.write(`  ${COLORS.bold}${rank}${COLORS.reset} ${kc}${slug}${COLORS.reset}${titleText} ${deg}\n`);
    }
  }
}

function sortByCount(obj) {
  return Object.entries(obj).sort(([, a], [, b]) => b - a);
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, hubsLimit: 10 };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.hubsLimit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit='))
      flags.hubsLimit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    hubsLimit: flags.hubsLimit,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas overview [vault] [--vault path] [--limit N] [--json]\n\n` +
      `--limit range 1-${LIMIT_CAP}.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  ontology-atlas overview\n` +
      `  ontology-atlas overview ./docs/ontology\n` +
      `  ontology-atlas overview --limit 20\n` +
      `  ontology-atlas overview --json\n`,
  );
}
