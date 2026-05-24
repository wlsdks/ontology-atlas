// `oh-my-ontology cycles [vault]` — dependency cycle 검출.
// MCP `query_ontology({operation: 'cycles'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertCyclesShape, cyclesResultExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const MAX_HOPS_CAP = 20;
const ALLOWED_FLAGS = ['--vault', '--max-hops', '--json'];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runCycles(args) {
  const { vault, json, maxHops, error, help } = parseArgs(args);
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
      operation: 'cycles',
      maxHops,
    });
    assertCyclesShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return cyclesResultExitCode(result);
  }
  const cycles = Array.isArray(result?.cycles) ? result.cycles : [];
  const total = result?.totalCycles ?? cycles.length;
  if (total === 0) {
    process.stdout.write(`${COLORS.green}cycles 0 — dependency graph clean ✓${COLORS.reset}\n`);
    return 0;
  }
  process.stdout.write(
    `${COLORS.red}${total} cycle${total === 1 ? '' : 's'} found${COLORS.reset}` +
      ` ${COLORS.dim}(relation: ${(result?.relationTypes || []).join(', ') || 'dependencies'}, maxDepth ${result?.maxDepth ?? 8})${COLORS.reset}\n\n`,
  );
  for (let i = 0; i < cycles.length; i += 1) {
    const c = cycles[i];
    process.stdout.write(`${COLORS.bold}cycle ${i + 1}${COLORS.reset}\n`);
    const slugs = Array.isArray(c?.nodes) ? c.nodes : Array.isArray(c?.slugs) ? c.slugs : [];
    const summaries = Array.isArray(c?.nodeSummaries) ? c.nodeSummaries : [];
    for (let j = 0; j < slugs.length; j += 1) {
      process.stdout.write(`  ${formatCycleNode(slugs[j], summaries[j])}\n`);
      if (j < slugs.length - 1) process.stdout.write(`    ${COLORS.dim}↓ depends_on${COLORS.reset}\n`);
    }
    if (slugs.length > 0) process.stdout.write(`    ${COLORS.dim}↩ back to ${slugs[0]}${COLORS.reset}\n\n`);
  }
  printNextCycle(cycles[0], result?.maxDepth ?? 8);
  return cyclesResultExitCode(result);
}

function printNextCycle(cycle, maxDepth) {
  const slugs = Array.isArray(cycle?.nodes) ? cycle.nodes : Array.isArray(cycle?.slugs) ? cycle.slugs : [];
  const uniqueSlugs = slugs.filter((slug, index) => typeof slug === 'string' && slug.length > 0 && slugs.indexOf(slug) === index);
  if (uniqueSlugs.length < 2) return;
  const from = uniqueSlugs[0];
  const to = uniqueSlugs[1];
  const boundedMaxHops = Math.max(0, Math.min(MAX_HOPS_CAP, Number.isInteger(maxDepth) ? maxDepth : 8));
  process.stdout.write(
    `${COLORS.bold}next cycle${COLORS.reset} ${COLORS.cyan}${from}${COLORS.reset}` +
      ` ${COLORS.dim}→${COLORS.reset} ${COLORS.cyan}${to}${COLORS.reset}` +
      ` ${COLORS.dim}— cycle rows are failures, but fix the edge only after inspecting path evidence and maintenance guidance${COLORS.reset}\n` +
      `  oh-my-ontology path ${from} ${to} [vault] --max-hops ${boundedMaxHops}\n` +
      `  oh-my-ontology match-edges [vault] --from ${from} --to ${to} --types depends_on --limit 10\n` +
      `  oh-my-ontology maintenance [vault] --phases repair --severities fail --kinds break_dependency_cycle --limit 3\n`,
  );
}

function formatCycleNode(slug, summary) {
  const title = summary?.title && summary.title !== slug ? ` ${COLORS.dim}— ${summary.title}${COLORS.reset}` : '';
  return `${COLORS.yellow}${slug}${COLORS.reset}${title}`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, maxHops: undefined };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--max-hops') flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', args[++i], { max: MAX_HOPS_CAP });
    else if (a.startsWith('--max-hops='))
      flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', a.slice('--max-hops='.length), { max: MAX_HOPS_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, maxHops: flags.maxHops };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology cycles [vault] [--max-hops N] [--json]\n\n` +
      `directed depends_on cycle detection (default maxDepth 8, --max-hops range 0-${MAX_HOPS_CAP}). exit 0 only when no cycles are found.\n`,
  );
}
