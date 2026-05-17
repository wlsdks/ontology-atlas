// `oh-my-ontology hubs [vault]` — centrality 기반 hub 노드 ranking.
// MCP `query_ontology({operation: 'centrality'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;

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

export async function runHubs(args) {
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
      operation: 'centrality',
      limit,
    });
    assertQueryOperation(result, 'centrality');
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

function render(result) {
  const r = result?.rankings ?? {};
  const sections = [
    ['PageRank (영향력)', r.pageRank, 'pageRank'],
    ['Bridges (도메인 사이 잇는 노드)', r.bridges, 'bridgeScore'],
    ['Authorities (많이 referenced)', r.authorities, 'inDegree'],
    ['Hubs (많이 reference)', r.hubs, 'outDegree'],
  ];
  for (const [title, rows, scoreKey] of sections) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    process.stdout.write(`${COLORS.dim}${title}${COLORS.reset}\n`);
    for (let i = 0; i < rows.length; i += 1) {
      const h = rows[i];
      const kc = KIND_COLORS[h.kind] || COLORS.dim;
      const rank = String(i + 1).padStart(2);
      const slug = h.slug.padEnd(50);
      const score =
        typeof h[scoreKey] === 'number' ? h[scoreKey].toFixed(scoreKey === 'pageRank' ? 4 : 0) : '-';
      const deg = `${COLORS.dim}${scoreKey} ${score}${COLORS.reset} ${COLORS.dim}(deg ${h.degree})${COLORS.reset}`;
      process.stdout.write(`  ${COLORS.bold}${rank}${COLORS.reset} ${kc}${slug}${COLORS.reset} ${deg}\n`);
    }
    process.stdout.write('\n');
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 10 };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
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
      `  oh-my-ontology hubs [vault] [--limit N] [--json]\n\n` +
      `--limit range 1-${LIMIT_CAP}.\n` +
      `4 rankings: PageRank (영향력) · Bridges (도메인 잇는) · Authorities (referenced) · Hubs (referencing).\n`,
  );
}
