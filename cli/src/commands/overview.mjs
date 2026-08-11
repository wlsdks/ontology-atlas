// `ontology-atlas overview [vault]`
// Vault 의 first-contact dashboard — counts + relation distribution + 허브 노드.
// MCP `query_ontology({operation: 'overview'})` thin wrapper.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertOverviewShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--limit', '--json'];



export async function runOverview(args) {
  const { vault, json, hubsLimit, error, help } = parseArgs(args);
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
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'overview' });
    assertOverviewShape(result);
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

  renderOverview(result, hubsLimit);
  return 0;
}

function renderOverview(result, hubsLimit) {
  const graph = result?.graph ?? {};
  const byKind = result?.byKind ?? {};
  const byDomain = result?.byDomain ?? {};
  const byRelation = result?.byRelation ?? {};
  const hubs = Array.isArray(result?.hubs) ? result.hubs : [];

  // Header — 그래프 한 줄 요약.
  const nodes = graph.nodes ?? 0;
  const edges = graph.edges ?? 0;
  const resolved = graph.resolvedEdges ?? 0;
  const external = graph.externalEdges ?? 0;
  const unresolved = graph.unresolvedEdges ?? 0;
  const referencedOnly = graph.referencedOnly ?? 0;
  process.stdout.write(
    `${COLORS.bold}vault overview${COLORS.reset}` +
      ` ${COLORS.dim}· ${nodes} 노드 · ${edges} 관계 (resolved ${resolved} · external ${external}${unresolved ? ` · unresolved ${unresolved}` : ''})${COLORS.reset}\n`,
  );
  // 화면(지도·인사이트)은 문서 없이 이름만 적힌 개념까지 세므로 총계가 더
  // 크다. 그 차이를 여기서 밝히지 않으면 두 입구가 같은 볼트에 다른 수를
  // 답하는데 어느 쪽도 이유를 말하지 않는 상태가 된다.
  if (referencedOnly > 0) {
    process.stdout.write(
      `${COLORS.dim}  문서 있는 개념 ${nodes} + 이름만 적힌 개념 ${referencedOnly} = 지도가 세는 ${nodes + referencedOnly}${COLORS.reset}\n`,
    );
  }
  // 관계 수도 같은 이유로 스코프를 밝힌다 (2026-07-27 실측: 웹 448 vs 여기 542).
  // 여기는 frontmatter 에 **적힌 참조 하나당 한 관계**를 센다 — 도메인이
  // `capabilities:` 로, 역량이 `domain:` 으로 같은 담기 관계를 양쪽에서 적으면
  // 2로 센다. 지도·인사이트는 같은 사실을 서로 다른 관계 하나로 접어 센다.
  if (edges > 0) {
    process.stdout.write(
      `${COLORS.dim}  관계 ${edges} 는 적힌 참조 기준: 양쪽 문서가 같은 관계를 적으면 2로 셉니다 (지도는 접어서 1)${COLORS.reset}\n`,
    );
  }
  process.stdout.write('\n');

  // Kind 분포 — kind 별 count + 색깔 bar.
  if (Object.keys(byKind).length > 0) {
    process.stdout.write(`${COLORS.dim}KIND 분포${COLORS.reset}\n`);
    const total = Object.values(byKind).reduce((sum, n) => sum + n, 0) || 1;
    for (const [kind, count] of sortByCount(byKind)) {
      const pct = Math.round((count / total) * 100);
      const bar = '█'.repeat(Math.max(1, Math.round((count / total) * 20)));
      const kc = KIND_COLORS[kind] || COLORS.dim;
      process.stdout.write(
        `  ${kc}${kind.padEnd(14)}${COLORS.reset} ${String(count).padStart(3)} ${COLORS.dim}${pct}%${COLORS.reset}  ${kc}${bar}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // 관계 종류 분포.
  if (Object.keys(byRelation).length > 0) {
    process.stdout.write(`${COLORS.dim}관계 종류 분포${COLORS.reset}\n`);
    const total = Object.values(byRelation).reduce((sum, n) => sum + n, 0) || 1;
    for (const [rel, count] of sortByCount(byRelation)) {
      const pct = Math.round((count / total) * 100);
      const bar = '─'.repeat(Math.max(1, Math.round((count / total) * 20)));
      process.stdout.write(
        `  ${COLORS.yellow}${rel.padEnd(14)}${COLORS.reset} ${String(count).padStart(3)} ${COLORS.dim}${pct}%${COLORS.reset}  ${COLORS.dim}${bar}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // 도메인 분포 (있을 때만).
  if (Object.keys(byDomain).length > 0) {
    process.stdout.write(`${COLORS.dim}도메인 분포${COLORS.reset}\n`);
    for (const [dom, count] of sortByCount(byDomain)) {
      process.stdout.write(
        `  ${COLORS.blue}${dom.padEnd(28)}${COLORS.reset} ${String(count).padStart(3)} 노드\n`,
      );
    }
    process.stdout.write('\n');
  }

  // 허브 노드 — degree 상위. document / vault-readme 제외.
  if (hubs.length > 0) {
    const cap = Math.min(hubs.length, hubsLimit);
    process.stdout.write(`${COLORS.dim}허브 노드${COLORS.reset} ${COLORS.dim}(degree 상위 ${cap}, document/project 제외)${COLORS.reset}\n`);
    for (let i = 0; i < cap; i += 1) {
      const h = hubs[i];
      const kc = KIND_COLORS[h.kind] || COLORS.dim;
      const rank = String(i + 1).padStart(2);
      const slug = h.slug.padEnd(50);
      const deg = `${COLORS.dim}deg ${h.degree}${COLORS.reset}` +
        ` ${COLORS.dim}(in ${h.inDegree} · out ${h.outDegree})${COLORS.reset}`;
      const titleText = h.title && h.title !== h.slug ? ` ${COLORS.dim}· ${h.title}${COLORS.reset}` : '';
      process.stdout.write(`  ${COLORS.bold}${rank}${COLORS.reset} ${kc}${slug}${COLORS.reset}${titleText} ${deg}\n`);
    }
  }
}

function sortByCount(obj) {
  return Object.entries(obj).sort(([, a], [, b]) => b - a);
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, hubsLimit: 10 };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.hubsLimit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit='))
      flags.hubsLimit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    hubsLimit: flags.hubsLimit,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas overview [vault] [--vault path] [--limit N] [--json]\n\n` +
      `--limit range 1-${LIMIT_CAP}.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  ontology-atlas overview\n` +
      `  ontology-atlas overview ./docs/ontology\n` +
      `  ontology-atlas overview --limit 20\n` +
      `  ontology-atlas overview --json\n`,
  );
}
