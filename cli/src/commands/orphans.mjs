// R+ — `oh-my-ontology orphans [vault]`
// Lists isolated nodes — docs that no other node references in their
// frontmatter. Thin wrapper over MCP find_orphans.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { validateKindList, validateKindValue } from '../lib/kinds.mjs';
import { assertOrphansShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  parseCsvListFlag,
  formatUnknownFlagError,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--kind', '--exclude-kinds'];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const KIND_COLORS = {
  project: '\x1b[35m',
  domain: '\x1b[34m',
  capability: '\x1b[36m',
  element: '\x1b[32m',
  document: '\x1b[37m',
  'vault-readme': '\x1b[2m',
};

export async function runOrphans(args) {
  const { vault, json, kind, excludeKinds, error, help } = parseArgs(args);
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
  const toolArgs = {};
  if (kind) toolArgs.kind = kind;
  if (excludeKinds.length > 0) toolArgs.excludeKinds = excludeKinds;

  let result;
  try {
    result = await callMcpTool(vaultRoot, 'find_orphans', toolArgs);
    assertOrphansShape(result);
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

  const orphans = result?.orphans ?? [];
  if (orphans.length === 0) {
    const kindFilter = kind ? ` (kind=${kind})` : '';
    process.stdout.write(
      `${COLORS.green}[oh-my-ontology] ${COLORS.reset}` +
        `${COLORS.dim}orphan 0${kindFilter} — vault clean ✓${COLORS.reset}\n`,
    );
    return 0;
  }

  const kindFilter = kind ? ` (kind=${kind})` : '';
  process.stdout.write(
    `${COLORS.bold}${result?.total ?? orphans.length} orphan(s)${COLORS.reset}` +
      `${COLORS.dim}${kindFilter} — 어디서도 frontmatter 로 reference 받지 않은 노드${COLORS.reset}\n\n`,
  );
  for (const o of orphans) {
    const color = KIND_COLORS[o.kind] || '';
    const kindCol = `${color}${(o.kind ?? '?').padEnd(13)}${COLORS.reset}`;
    const slugCol = (o.slug ?? '').padEnd(45);
    const titleCol = o.title
      ? o.title
      : `${COLORS.dim}(no title)${COLORS.reset}`;
    process.stdout.write(`  ${kindCol} ${slugCol} ${titleCol}\n`);
  }
  return 0;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, kind: null, excludeKinds: [] };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--kind') flags.kind = parseRequiredFlagValue('--kind', args[++i]);
    else if (a.startsWith('--kind=')) flags.kind = parseRequiredFlagValue('--kind', a.slice('--kind='.length));
    else if (a === '--exclude-kinds') {
      const next = parseCsvListFlag('--exclude-kinds', args[++i], { itemName: 'kind' });
      if (next instanceof Error) return { error: next.message };
      flags.excludeKinds = next;
    } else if (a.startsWith('--exclude-kinds=')) {
      const next = parseCsvListFlag('--exclude-kinds', a.slice('--exclude-kinds='.length), { itemName: 'kind' });
      if (next instanceof Error) return { error: next.message };
      flags.excludeKinds = next;
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const kindError = validateKindValue('--kind', flags.kind);
  if (kindError) return { error: kindError };
  const excludeKindsError = validateKindList('--exclude-kinds', flags.excludeKinds);
  if (excludeKindsError) return { error: excludeKindsError };
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    kind: flags.kind,
    excludeKinds: flags.excludeKinds,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology orphans [vault] [--kind X] [--exclude-kinds A,B] [--vault path] [--json]\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology orphans\n` +
      `  oh-my-ontology orphans --kind capability\n` +
      `  oh-my-ontology orphans ./docs/ontology --json\n`,
  );
}
