// R+ — `oh-my-ontology orphans [vault]`
// Lists isolated nodes — docs that no other node references in their
// frontmatter. Thin wrapper over MCP find_orphans.

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';

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
  const { vault, json, kind, excludeKinds, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolve(process.cwd(), vault);
  const toolArgs = {};
  if (kind) toolArgs.kind = kind;
  if (excludeKinds.length > 0) toolArgs.excludeKinds = excludeKinds;

  let result;
  try {
    result = await callMcpTool(vaultRoot, 'find_orphans', toolArgs);
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
  const flags = { vault: '.', json: false, kind: null, excludeKinds: [] };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--kind') flags.kind = args[++i] || null;
    else if (a.startsWith('--kind=')) flags.kind = a.slice('--kind='.length);
    else if (a === '--exclude-kinds') {
      const next = args[++i] || '';
      flags.excludeKinds = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a.startsWith('--exclude-kinds=')) {
      flags.excludeKinds = a
        .slice('--exclude-kinds='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  // Optional first positional is vault path (parity with list/find/validate/backlinks).
  if (positional.length >= 1 && flags.vault === '.') {
    flags.vault = positional[0];
  }
  return {
    vault: flags.vault,
    json: flags.json,
    kind: flags.kind,
    excludeKinds: flags.excludeKinds,
  };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology orphans [vault] [--kind X] [--exclude-kinds A,B] [--vault path] [--json]\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology orphans\n` +
      `  oh-my-ontology orphans --kind capability\n` +
      `  oh-my-ontology orphans ./docs/ontology --json\n`,
  );
}
