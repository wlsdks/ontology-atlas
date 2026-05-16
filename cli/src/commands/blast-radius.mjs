// `oh-my-ontology blast-radius <slug> [vault] [--depth N] [--direction]`
// 이 노드를 바꾸면 무엇이 깨지나 — refactor safety 도구.
// MCP `query_ontology({operation: 'blast_radius'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  parsePositiveIntegerFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const KIND_COLORS = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
  document: COLORS.dim,
  'vault-readme': COLORS.dim,
};
const RISK_COLORS = {
  low: COLORS.green,
  medium: COLORS.yellow,
  high: COLORS.red,
};

export async function runBlastRadius(args) {
  const { slug, vault, json, depth, direction, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }
  const vaultRoot = resolveVaultRoot(vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', {
      operation: 'blast_radius',
      slug,
      depth,
      direction,
    });
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
  render(result, slug);
  return 0;
}

function render(result, requestedSlug) {
  const sum = result?.summary ?? {};
  const risk = result?.risk ?? 'unknown';
  const rc = RISK_COLORS[risk] || COLORS.dim;
  process.stdout.write(
    `${COLORS.bold}${requestedSlug}${COLORS.reset} ${COLORS.dim}— blast radius${COLORS.reset}` +
      ` ${COLORS.dim}(depth ${result?.depth ?? 2}, ${result?.direction ?? 'incoming'})${COLORS.reset}\n` +
      `  risk ${rc}${risk}${COLORS.reset}` +
      ` · ${sum.affectedNodes ?? 0} 노드 · ${sum.affectedEdges ?? 0} 관계` +
      ` · ${sum.crossDomainEdges ?? 0} cross-domain\n\n`,
  );
  const byKind = result?.byKind ?? {};
  if (Object.keys(byKind).length > 0) {
    process.stdout.write(`${COLORS.dim}affected by kind${COLORS.reset}\n`);
    for (const [kind, count] of Object.entries(byKind).sort(([, a], [, b]) => b - a)) {
      const kc = KIND_COLORS[kind] || COLORS.dim;
      process.stdout.write(`  ${kc}${kind.padEnd(14)}${COLORS.reset} ${count}\n`);
    }
    process.stdout.write('\n');
  }
  const byDomain = result?.byDomain ?? {};
  if (Object.keys(byDomain).length > 0) {
    process.stdout.write(`${COLORS.dim}affected by domain${COLORS.reset}\n`);
    for (const [dom, count] of Object.entries(byDomain).sort(([, a], [, b]) => b - a)) {
      process.stdout.write(`  ${COLORS.blue}${dom.padEnd(40)}${COLORS.reset} ${count}\n`);
    }
    process.stdout.write('\n');
  }
  const rows = result?.nodes?.rows ?? [];
  if (rows.length > 0) {
    process.stdout.write(`${COLORS.dim}affected nodes (distance 별)${COLORS.reset}\n`);
    for (const r of rows) {
      const kind = r.node?.kind ?? '?';
      const kc = KIND_COLORS[kind] || COLORS.dim;
      const dist = `${COLORS.dim}d${r.distance}${COLORS.reset}`;
      process.stdout.write(`  ${dist} ${kc}${r.slug}${COLORS.reset}\n`);
    }
  }
}

function parseArgs(args) {
  const flags = {
    vault: null,
    json: false,
    depth: undefined,
    direction: 'incoming',
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--depth') flags.depth = parsePositiveIntegerFlag('--depth', args[++i]);
    else if (a.startsWith('--depth=')) flags.depth = parsePositiveIntegerFlag('--depth', a.slice('--depth='.length));
    else if (a === '--direction') flags.direction = parseRequiredFlagValue('--direction', args[++i]);
    else if (a.startsWith('--direction='))
      flags.direction = parseRequiredFlagValue('--direction', a.slice('--direction='.length));
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'slug is required (e.g. `blast-radius capabilities/foo`)' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (!['incoming', 'outgoing', 'both'].includes(flags.direction)) {
    return { error: '--direction must be one of incoming / outgoing / both' };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    slug: positional[0],
    vault: vaultResult.vault,
    json: flags.json,
    depth: flags.depth,
    direction: flags.direction,
  };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology blast-radius <slug> [vault] [--depth N] [--direction incoming|outgoing|both] [--json]\n\n` +
      `default depth 2, direction incoming (이 노드를 의존하는 무엇).\n`,
  );
}
