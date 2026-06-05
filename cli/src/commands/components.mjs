// `ontology-atlas components [vault]` — connected graph island scan.
// MCP `query_ontology({operation: 'components'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation } from '../lib/query-result-contract.mjs';
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
const ALLOWED_FLAGS = ['--vault', '--limit', '--node-limit', '--types', '--json'];


export async function runComponents(args) {
  const { vault, json, limit, nodeLimit, types, error, help } = parseArgs(args);
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
      operation: 'components',
      limit,
      nodeLimit,
      ...(types.length > 0 ? { types } : {}),
    });
    assertComponentsShape(result);
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

  render(result);
  return 0;
}

function assertComponentsShape(result) {
  assertQueryOperation(result, 'components');
  for (const field of ['totalComponents', 'largestSize', 'singletonCount']) {
    if (!Number.isInteger(result[field]) || result[field] < 0) {
      throw new Error(`components ${field} must be a non-negative integer`);
    }
  }
  if (typeof result.limited !== 'boolean') {
    throw new Error('components limited must be a boolean');
  }
  if (!Array.isArray(result.components)) {
    throw new Error('components components must be an array');
  }
  return result;
}

function render(result) {
  process.stdout.write(
    `${COLORS.bold}graph components${COLORS.reset}` +
      ` ${COLORS.dim}— ${result.totalComponents} islands · largest ${result.largestSize}` +
      ` · singletons ${result.singletonCount}${result.limited ? ' · limited' : ''}${COLORS.reset}\n\n`,
  );
  for (const component of result.components) {
    const kinds = Object.entries(component.kinds || {})
      .map(([kind, count]) => `${kind}:${count}`)
      .join(' ');
    process.stdout.write(
      `${COLORS.bold}component ${component.id}${COLORS.reset}` +
        ` ${COLORS.yellow}${component.size} nodes${COLORS.reset}` +
        (kinds ? ` ${COLORS.dim}${kinds}${COLORS.reset}` : '') +
        (component.nodeLimited ? ` ${COLORS.dim}(nodes limited)${COLORS.reset}` : '') +
        '\n',
    );
    for (const node of Array.isArray(component.nodes) ? component.nodes : []) {
      const title = node.title && node.title !== node.slug ? ` ${COLORS.dim}— ${node.title}${COLORS.reset}` : '';
      process.stdout.write(`  ${COLORS.cyan}${node.slug}${COLORS.reset}${title} ${COLORS.dim}${node.kind}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }
  if (result.totalComponents > 1) {
    process.stdout.write(
      `${COLORS.dim}next${COLORS.reset} inspect disconnected islands before trusting traversal maps:\n` +
        `  ${COLORS.cyan}ontology-atlas health [vault] --json${COLORS.reset}\n` +
        `  ${COLORS.cyan}ontology-atlas maintenance [vault] --kinds canonicalize_relation_array --limit 5${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 20, nodeLimit: 25, types: [] };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--node-limit') flags.nodeLimit = parseBoundedPositiveIntegerFlag('--node-limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--node-limit='))
      flags.nodeLimit = parseBoundedPositiveIntegerFlag('--node-limit', a.slice('--node-limit='.length), { max: LIMIT_CAP });
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
    nodeLimit: flags.nodeLimit,
    types: flags.types,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas components [vault] [--limit N] [--node-limit N] [--types A,B] [--json]\n\n` +
      `Connected graph island scan. Use before trusting traversal, project maps, or onboarding evidence.\n` +
      `--limit and --node-limit range 1-${LIMIT_CAP}. --types narrows relation types.\n`,
  );
}
