// `oh-my-ontology path <from> <to> [vault]`
// Shortest path between two slugs (BFS, undirected). Thin wrapper over MCP
// find_path — same authority as a coding AI agent. find_path 의 `edges[]`
// (relation type per hop) 도 함께 사용자에게 노출해, 두 노드가 *왜* 연결됐는지
// 한 줄로 본다.

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runPath(args) {
  const { from, to, vault, maxHops, json, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolve(process.cwd(), vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'find_path', {
      from,
      to,
      ...(typeof maxHops === 'number' ? { maxHops } : {}),
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

  if (!result || result.found === false || !Array.isArray(result.hops) || result.hops.length === 0) {
    process.stdout.write(
      `${COLORS.dim}no path${COLORS.reset} ${COLORS.bold}${from}${COLORS.reset} ${COLORS.dim}→${COLORS.reset} ${COLORS.bold}${to}${COLORS.reset}` +
        ` ${COLORS.dim}(maxHops ${maxHops ?? 5} 초과 또는 vault 에 slug 없음)${COLORS.reset}\n`,
    );
    return 0;
  }

  const hops = result.hops;
  const edges = Array.isArray(result.edges) ? result.edges : [];
  const hopCount = typeof result.hopCount === 'number' ? result.hopCount : hops.length - 1;

  // Trivial path (from === to).
  if (hopCount === 0) {
    process.stdout.write(
      `${COLORS.bold}${hops[0]}${COLORS.reset} ${COLORS.dim}(same slug — 0 hops)${COLORS.reset}\n`,
    );
    return 0;
  }

  process.stdout.write(
    `${COLORS.bold}${from}${COLORS.reset} ${COLORS.dim}→${COLORS.reset} ${COLORS.bold}${to}${COLORS.reset}` +
      ` ${COLORS.dim}— ${hopCount} hop${hopCount === 1 ? '' : 's'}${COLORS.reset}\n\n`,
  );

  // Render: hop i  --(via)-->  hop i+1
  for (let i = 0; i < hops.length; i += 1) {
    process.stdout.write(`  ${COLORS.cyan}${hops[i]}${COLORS.reset}\n`);
    if (i < hops.length - 1) {
      const via = edges[i]?.via;
      const viaLabel = via ? `${COLORS.yellow}${via}${COLORS.reset}` : `${COLORS.dim}(unknown)${COLORS.reset}`;
      process.stdout.write(`    ${COLORS.dim}↓ via${COLORS.reset} ${viaLabel}\n`);
    }
  }
  return 0;
}

function parseArgs(args) {
  const flags = { vault: '.', json: false, maxHops: undefined };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--max-hops') {
      const next = args[++i];
      const n = Number.parseInt(next, 10);
      if (!Number.isFinite(n) || n < 1) {
        return { error: `--max-hops requires a positive integer, got "${next}"` };
      }
      flags.maxHops = n;
    } else if (a.startsWith('--max-hops=')) {
      const n = Number.parseInt(a.slice('--max-hops='.length), 10);
      if (!Number.isFinite(n) || n < 1) {
        return { error: `--max-hops requires a positive integer` };
      }
      flags.maxHops = n;
    } else if (a.startsWith('--')) {
      return { error: `unknown flag: ${a}` };
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    return { error: 'both <from> and <to> are required' };
  }
  // 3rd positional = vault path (parity with list/find/validate/backlinks/orphans).
  const [from, to, maybeVault] = positional;
  if (maybeVault && flags.vault === '.') {
    flags.vault = maybeVault;
  }
  return { from, to, vault: flags.vault, json: flags.json, maxHops: flags.maxHops };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology path <from> <to> [vault] [--max-hops N] [--vault path] [--json]\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  oh-my-ontology path capabilities/cli-developer-entry capabilities/mcp-server\n` +
      `  oh-my-ontology path project elements/sigma-graphology --max-hops 8 --json\n`,
  );
}
