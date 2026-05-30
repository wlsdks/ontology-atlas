// `oh-my-ontology schema [vault]` — relation schema pattern scan.
// MCP `query_ontology({operation: 'schema'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--limit', '--json'];


export async function runSchema(args) {
  const { vault, json, limit, error, help } = parseArgs(args);
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
      operation: 'schema',
      limit,
    });
    assertSchemaShape(result);
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

function assertSchemaShape(result) {
  assertQueryOperation(result, 'schema');
  if (!Number.isInteger(result.totalPatterns) || result.totalPatterns < 0) {
    throw new Error('schema totalPatterns must be a non-negative integer');
  }
  if (typeof result.limited !== 'boolean') {
    throw new Error('schema limited must be a boolean');
  }
  if (!Array.isArray(result.patterns)) {
    throw new Error('schema patterns must be an array');
  }
  for (let index = 0; index < result.patterns.length; index += 1) {
    const pattern = result.patterns[index];
    if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern)) {
      throw new Error(`schema patterns[${index}] must be an object`);
    }
    for (const field of ['fromKind', 'relation', 'toKind']) {
      if (typeof pattern[field] !== 'string' || pattern[field].trim().length === 0) {
        throw new Error(`schema patterns[${index}].${field} must be a non-empty string`);
      }
    }
    for (const field of ['count', 'resolved', 'external', 'unresolved']) {
      if (!Number.isInteger(pattern[field]) || pattern[field] < 0) {
        throw new Error(`schema patterns[${index}].${field} must be a non-negative integer`);
      }
    }
  }
  return result;
}

function render(result) {
  process.stdout.write(
    `${COLORS.bold}relation schema${COLORS.reset}` +
      ` ${COLORS.dim}— ${result.totalPatterns} patterns${result.limited ? ' · limited' : ''}${COLORS.reset}\n\n`,
  );
  for (const pattern of result.patterns) {
    process.stdout.write(
      `${COLORS.cyan}${pattern.fromKind}${COLORS.reset}` +
        ` ${COLORS.dim}--${COLORS.reset}${COLORS.yellow}${pattern.relation}${COLORS.reset}${COLORS.dim}-->${COLORS.reset} ` +
        `${COLORS.cyan}${pattern.toKind}${COLORS.reset}` +
        ` ${COLORS.dim}count ${pattern.count} · resolved ${pattern.resolved} · external ${pattern.external}` +
        `${pattern.unresolved ? ` · unresolved ${pattern.unresolved}` : ''}${COLORS.reset}\n`,
    );
    const example = Array.isArray(pattern.examples) ? pattern.examples[0] : null;
    if (example?.from && example?.to) {
      process.stdout.write(
        `  ${COLORS.dim}example${COLORS.reset} ${example.from} ${COLORS.dim}->${COLORS.reset} ${example.to}\n`,
      );
    }
  }
  if (result.patterns.length > 0) {
    process.stdout.write(
      `\n${COLORS.dim}next${COLORS.reset} use schema rows as allowed-shape evidence before writes:\n` +
        `  ${COLORS.cyan}oh-my-ontology relation-check <from> <to> <type> [vault]${COLORS.reset}\n`,
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
      `  oh-my-ontology schema [vault] [--limit N] [--json]\n\n` +
      `Relation schema pattern scan for graph traversal and add_relation preflight evidence.\n` +
      `--limit range 1-${LIMIT_CAP}.\n`,
  );
}
