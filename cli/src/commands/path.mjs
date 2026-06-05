// `ontology-atlas path <from> <to> [vault]`
// Shortest path between two slugs (BFS, undirected). Thin wrapper over MCP
// find_path — same authority as a coding AI agent. find_path 의 `edges[]`
// (relation type per hop) 도 함께 사용자에게 노출해, 두 노드가 *왜* 연결됐는지
// 한 줄로 본다.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertPathShape, pathResultExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const MAX_HOPS_CAP = 20;
const ALLOWED_FLAGS = ['--vault', '--max-hops', '--json'];


export async function runPath(args) {
  const { from, to, vault, maxHops, json, error, help } = parseArgs(args);
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
    result = await callMcpTool(vaultRoot, 'find_path', {
      from,
      to,
      ...(typeof maxHops === 'number' ? { maxHops } : {}),
    });
    assertPathShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return pathResultExitCode(result);
  }

  if (!result || result.found === false || !Array.isArray(result.hops) || result.hops.length === 0) {
    process.stdout.write(
      `${COLORS.dim}no path${COLORS.reset} ${COLORS.bold}${from}${COLORS.reset} ${COLORS.dim}→${COLORS.reset} ${COLORS.bold}${to}${COLORS.reset}` +
        ` ${COLORS.dim}(maxHops ${maxHops ?? 5} 초과 또는 vault 에 slug 없음)${COLORS.reset}\n`,
    );
    return 1;
  }
  if (pathResultExitCode(result) !== 0) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  malformed find_path response\n`);
    return 1;
  }

  const hops = result.hops;
  const edges = Array.isArray(result.edges) ? result.edges : [];
  const nodesBySlug = new Map(
    (Array.isArray(result.nodes) ? result.nodes : [])
      .map((node) => [node.slug, node]),
  );
  const hopCount = typeof result.hopCount === 'number' ? result.hopCount : hops.length - 1;

  // Trivial path (from === to).
  if (hopCount === 0) {
    process.stdout.write(
      `${formatHop(hops[0], nodesBySlug)} ${COLORS.dim}(same slug — 0 hops)${COLORS.reset}\n`,
    );
    return 0;
  }

  process.stdout.write(
    `${COLORS.bold}${from}${COLORS.reset} ${COLORS.dim}→${COLORS.reset} ${COLORS.bold}${to}${COLORS.reset}` +
      ` ${COLORS.dim}— ${hopCount} hop${hopCount === 1 ? '' : 's'}${COLORS.reset}\n\n`,
  );

  // Render: hop i  --(via)-->  hop i+1
  for (let i = 0; i < hops.length; i += 1) {
    process.stdout.write(`  ${formatHop(hops[i], nodesBySlug)}\n`);
    if (i < hops.length - 1) {
      const via = edges[i]?.via;
      const viaLabel = via ? `${COLORS.yellow}${via}${COLORS.reset}` : `${COLORS.dim}(unknown)${COLORS.reset}`;
      process.stdout.write(`    ${COLORS.dim}↓ via${COLORS.reset} ${viaLabel}\n`);
    }
  }
  return 0;
}

function formatHop(slug, nodesBySlug) {
  const node = nodesBySlug.get(slug);
  if (!node?.title || node.title === slug) {
    return `${COLORS.cyan}${slug}${COLORS.reset}`;
  }
  return `${COLORS.cyan}${slug}${COLORS.reset} ${COLORS.dim}— ${node.title}${COLORS.reset}`;
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
    else if (a === '--max-hops') {
      flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', args[++i], { max: MAX_HOPS_CAP });
    } else if (a.startsWith('--max-hops=')) {
      flags.maxHops = parseBoundedNonNegativeIntegerFlag('--max-hops', a.slice('--max-hops='.length), { max: MAX_HOPS_CAP });
    } else if (a.startsWith('-')) {
      return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    return { error: 'both <from> and <to> are required' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  // 3rd positional = vault path (parity with list/find/validate/backlinks/orphans).
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 2 });
  if (vaultResult.error) return vaultResult;
  return { from: positional[0], to: positional[1], vault: vaultResult.vault, json: flags.json, maxHops: flags.maxHops };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas path <from> <to> [vault] [--max-hops N] [--vault path] [--json]\n\n` +
      `found=false exits 1 so scripts can use this as a relation gate. --max-hops range 0-${MAX_HOPS_CAP}.\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  ontology-atlas path capabilities/cli-developer-entry capabilities/mcp-server\n` +
      `  ontology-atlas path project elements/sigma-graphology --max-hops 8 --json\n`,
  );
}
