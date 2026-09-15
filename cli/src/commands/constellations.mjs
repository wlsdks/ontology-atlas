// Read-only saved constellation discovery through MCP list_constellations.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertConstellationListShape } from '../lib/constellation-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseNonNegativeIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 100;
const ALLOWED_FLAGS = ['--vault', '--offset', '--limit', '--json'];

export async function runConstellations(args) {
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
  let result;
  try {
    result = await callMcpTool(resolveVaultRoot(parsed.vault), 'list_constellations', {
      offset: parsed.offset,
      limit: parsed.limit,
    });
    assertConstellationListShape(result);
  } catch (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.availability === 'unavailable' ? 1 : 0;
  }
  render(result);
  return result.availability === 'unavailable' ? 1 : 0;
}

function render(result) {
  if (result.availability !== 'ready') {
    process.stdout.write(`${COLORS.dim}${result.guidance}${COLORS.reset}\n`);
    if (result.source.reason) process.stdout.write(`${COLORS.dim}reason${COLORS.reset}  ${result.source.reason}\n`);
    return;
  }
  process.stdout.write(
    `${COLORS.bold}saved constellations${COLORS.reset} ${COLORS.dim}· ${result.total} total · ${result.returned} shown${COLORS.reset}\n`,
  );
  for (const row of result.constellations) {
    const purpose = row.purpose.status === 'recorded' ? row.purpose.value : 'purpose unknown';
    process.stdout.write(
      `\n${COLORS.cyan}${row.name}${COLORS.reset} ${COLORS.dim}${row.id}${COLORS.reset}\n` +
      `  ${purpose}\n` +
      `  ${COLORS.dim}${row.ontologyMemberCount} ontology · ${row.referenceMemberCount} reference · updated ${row.updatedAt}${COLORS.reset}\n`,
    );
  }
  if (result.pagination.hasMore) {
    process.stdout.write(
      `\n${COLORS.dim}more${COLORS.reset}  ontology-atlas constellations [vault] --offset ${result.pagination.nextOffset} --limit ${result.pagination.limit}\n`,
    );
  }
  process.stdout.write(`\n${COLORS.dim}${result.guidance}${COLORS.reset}\n`);
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, offset: 0, limit: 50, json: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--vault') flags.vault = parseVaultFlag(args[++index]);
    else if (arg.startsWith('--vault=')) flags.vault = parseVaultFlag(arg.slice('--vault='.length));
    else if (arg === '--offset') flags.offset = parseNonNegativeIntegerFlag('--offset', args[++index]);
    else if (arg.startsWith('--offset=')) flags.offset = parseNonNegativeIntegerFlag('--offset', arg.slice('--offset='.length));
    else if (arg === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++index], { max: LIMIT_CAP });
    else if (arg.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', arg.slice('--limit='.length), { max: LIMIT_CAP });
    else if (arg === '--json') flags.json = true;
    else if (arg.startsWith('-')) return { error: formatUnknownFlagError(arg, ALLOWED_FLAGS) };
    else positional.push(arg);
  }
  for (const value of Object.values(flags)) if (value instanceof Error) return { error: value.message };
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  return vaultResult.error ? vaultResult : { ...flags, vault: vaultResult.vault };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
    `  ontology-atlas constellations [vault] [--offset N] [--limit N] [--json]\n\n` +
    `List saved constellation metadata through the read-only MCP contract. --limit range 1-${LIMIT_CAP}.\n`,
  );
}
