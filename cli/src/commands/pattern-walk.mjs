// `oh-my-ontology pattern-walk <slug> [vault]` — explicit relation-sequence traversal.
// MCP `query_ontology({operation: 'pattern_walk'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';

const LIMIT_CAP = 500;
const DIRECTION_VALUES = Object.freeze(['incoming', 'outgoing', 'both']);
const ALLOWED_FLAGS = ['--vault', '--pattern', '--direction', '--limit', '--json'];

const KIND_COLORS = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.cyan,
  document: COLORS.dim,
  'vault-readme': COLORS.dim,
};

export async function runPatternWalk(args) {
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
    assertPatternWalkShape(result);
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
    `${COLORS.dim}pattern_walk${COLORS.reset} ${COLORS.bold}${result.start}${COLORS.reset}` +
      ` ${COLORS.dim}${result.direction} ${result.pattern.join(' -> ')}${COLORS.reset}\n` +
      `  ${summary.matchedPaths ?? 0} matched path(s)` +
      ` · ${summary.endNodes ?? 0} end node(s)` +
      ` · ${summary.traversedEdges ?? 0} traversed edge(s)` +
      ` · ${summary.steps ?? 0} step(s)\n\n`,
  );

  for (const layer of result.layers ?? []) {
    const total = layer.totalNodes ?? layer.total ?? layer.nodes.length;
    const pathCount = layer.totalPaths;
    const suffix = typeof pathCount === 'number'
      ? `${total} node(s) · ${pathCount} path(s)`
      : `${total} node(s)`;
    process.stdout.write(`${COLORS.dim}step ${layer.step}${COLORS.reset} ${COLORS.bold}${layer.relation}${COLORS.reset} ${COLORS.dim}(${suffix})${COLORS.reset}\n`);
    for (const row of layer.nodes.slice(0, 8)) {
      const node = row.node ?? row;
      const slug = row.slug ?? node.slug;
      const color = KIND_COLORS[node.kind] || COLORS.cyan;
      const title = node.title && node.title !== node.slug ? ` ${COLORS.dim}— ${node.title}${COLORS.reset}` : '';
      process.stdout.write(`  ${color}${slug}${COLORS.reset}${title}\n`);
    }
    if (layer.limited) {
      process.stdout.write(`  ${COLORS.dim}limited; increase --limit for more rows${COLORS.reset}\n`);
    }
  }

  const rows = result.paths?.rows ?? [];
  if (rows.length > 0) {
    process.stdout.write(`\n${COLORS.dim}paths${COLORS.reset} ${rows.length}/${result.paths.total}${result.paths.limited ? ' limited' : ''}\n`);
    for (const row of rows.slice(0, 8)) {
      process.stdout.write(`  ${row.path.join(` ${COLORS.dim}->${COLORS.reset} `)}\n`);
    }
  } else {
    process.stdout.write(`${COLORS.dim}no matching paths for this pattern${COLORS.reset}\n`);
  }

  const focus = rows.find((row) => Array.isArray(row.path) && row.path.length > 1);
  if (focus) {
    const end = focus.end ?? focus.path[focus.path.length - 1];
    process.stdout.write(
      `\n${COLORS.dim}next${COLORS.reset} containment ${COLORS.bold}${end}${COLORS.reset}` +
        `${COLORS.dim} — pattern rows are traversal evidence; inspect the endpoint before writing${COLORS.reset}\n`,
    );
    process.stdout.write(`  ${COLORS.cyan}oh-my-ontology node ${end} [vault] --limit 20${COLORS.reset}\n`);
    process.stdout.write(`  ${COLORS.cyan}oh-my-ontology path ${result.start} ${end} [vault] --max-hops ${result.pattern.length + 1}${COLORS.reset}\n`);
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    pattern: undefined,
    direction: 'outgoing',
    limit: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--pattern') flags.pattern = parsePattern(args[++i]);
    else if (a.startsWith('--pattern=')) flags.pattern = parsePattern(a.slice('--pattern='.length));
    else if (a === '--direction') flags.direction = parseRequiredFlagValue('--direction', args[++i]);
    else if (a.startsWith('--direction=')) flags.direction = parseRequiredFlagValue('--direction', a.slice('--direction='.length));
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'slug is required (e.g. `pattern-walk project/app --pattern domains,capabilities`)' };
  }
  if (!flags.pattern) {
    return { error: '--pattern is required (e.g. --pattern domains,capabilities)' };
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
    vault: vaultResult.vault,
    json: flags.json,
    query: {
      operation: 'pattern_walk',
      slug: positional[0],
      pattern: flags.pattern,
      direction: flags.direction,
      ...(flags.limit ? { limit: flags.limit } : {}),
    },
  };
}

function parsePattern(value) {
  const parsed = parseCsvListFlag('--pattern', value, { itemName: 'relation type' });
  if (parsed instanceof Error) return parsed;
  const error = validateRelationTypeList(parsed, '--pattern items');
  return error ?? parsed;
}

function assertPatternWalkShape(result) {
  if (!result || result.operation !== 'pattern_walk') {
    throw new Error('pattern_walk returned unexpected operation');
  }
  if (typeof result.start !== 'string' || !Array.isArray(result.pattern)) {
    throw new Error('pattern_walk result must include start and pattern');
  }
  if (!result.summary || typeof result.summary !== 'object') {
    throw new Error('pattern_walk summary must be an object');
  }
  if (!Array.isArray(result.layers) || !result.paths || !Array.isArray(result.paths.rows)) {
    throw new Error('pattern_walk result must include layers and paths.rows');
  }
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology pattern-walk <slug> [vault] --pattern domains,capabilities [--direction outgoing|incoming|both] [--limit N] [--json]\n\n` +
      `Follow an explicit relation sequence from a start node. Use it as containment/traversal evidence before broad graph conclusions.\n`,
  );
}
