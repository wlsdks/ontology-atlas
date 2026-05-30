// `oh-my-ontology node <slug> [vault]` — 한 노드의 전체 deep dive.
// MCP `query_ontology({operation: 'node_profile'})` thin wrapper.
// header / 도메인 / containment lineage / incoming-outgoing edges (relation 별 그룹) 한 화면.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertNodeProfileShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseCsvListFlag,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--limit', '--types', '--no-external', '--no-unresolved'];


export async function runNodeProfile(args) {
  const {
    slug,
    vault,
    json,
    limit,
    types,
    includeExternal,
    includeUnresolved,
    error,
    help,
  } = parseArgs(args);
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
      operation: 'node_profile',
      slug,
      limit,
      types,
      includeExternal,
      includeUnresolved,
    });
    assertNodeProfileShape(result);
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
  render(result, { types, includeExternal, includeUnresolved });
  return 0;
}

function render(result, filters = {}) {
  const n = result?.node;
  if (!n) {
    process.stdout.write(`${COLORS.dim}node not found${COLORS.reset}\n`);
    return;
  }
  const kc = KIND_COLORS[n.kind] || COLORS.dim;
  const deg = result?.degree ?? { in: 0, out: 0, total: 0 };

  // Header
  process.stdout.write(
    `${kc}${(n.kind || '?').padEnd(11)}${COLORS.reset} ${COLORS.bold}${n.title || n.slug}${COLORS.reset}\n` +
      `  ${COLORS.dim}slug${COLORS.reset}    ${n.slug}\n` +
      (n.domain ? `  ${COLORS.dim}domain${COLORS.reset}  ${COLORS.blue}${n.domain}${COLORS.reset}\n` : '') +
      `  ${COLORS.dim}degree${COLORS.reset}  ${COLORS.bold}${deg.total}${COLORS.reset}` +
      ` ${COLORS.dim}(in ${deg.in} · out ${deg.out})${COLORS.reset}\n`,
  );

  // Aliases (slug 외 추가 alias)
  const aliases = Array.isArray(result?.aliases) ? result.aliases : [];
  const extraAliases = aliases.filter((a) => a !== n.slug);
  if (extraAliases.length > 0) {
    process.stdout.write(`  ${COLORS.dim}aliases${COLORS.reset} ${extraAliases.join(', ')}\n`);
  }
  if (hasActiveEdgeFilter(filters)) {
    process.stdout.write(`  ${COLORS.dim}filters${COLORS.reset} ${formatActiveEdgeFilters(filters)}\n`);
  }

  // Lineage (ancestor chain — project ← domain ← capability 흐름)
  const ancestors = result?.lineage?.ancestors?.nodes ?? [];
  if (ancestors.length > 0) {
    const chain = ancestors
      .slice()
      .sort((a, b) => b.distance - a.distance) // 멀리부터 (project → 가까이)
      .map((a) => {
        const ac = KIND_COLORS[a.node?.kind] || COLORS.dim;
        return `${ac}${a.node?.title || a.slug}${COLORS.reset}`;
      });
    process.stdout.write(
      `\n${COLORS.dim}LINEAGE${COLORS.reset}  ${chain.join(` ${COLORS.dim}→${COLORS.reset} `)} ${COLORS.dim}→${COLORS.reset} ${kc}${n.title || n.slug}${COLORS.reset}\n`,
    );
  }

  // Incoming edges
  const incoming = result?.edges?.incoming;
  if (incoming?.total > 0) {
    process.stdout.write(
      `\n${COLORS.dim}INCOMING${COLORS.reset} ${COLORS.bold}${incoming.total}${COLORS.reset}` +
        ` ${COLORS.dim}— 어디가 이 노드를 reference 하나${COLORS.reset}\n`,
    );
    renderEdgesByRelation(incoming.edges, 'from');
    renderLimitedHint(incoming, 'incoming');
  }

  // Outgoing edges
  const outgoing = result?.edges?.outgoing;
  if (outgoing?.total > 0) {
    process.stdout.write(
      `\n${COLORS.dim}OUTGOING${COLORS.reset} ${COLORS.bold}${outgoing.total}${COLORS.reset}` +
        ` ${COLORS.dim}— 이 노드가 무엇을 reference 하나${COLORS.reset}\n`,
    );
    renderEdgesByRelation(outgoing.edges, 'to');
    renderLimitedHint(outgoing, 'outgoing');
  }

  if ((incoming?.total ?? 0) === 0 && (outgoing?.total ?? 0) === 0) {
    if (hasActiveEdgeFilter(filters)) {
      process.stdout.write(`\n${COLORS.dim}no matching edges for current filters${COLORS.reset}\n`);
    } else {
      process.stdout.write(`\n${COLORS.dim}isolated — 어떤 노드와도 연결 안 됨${COLORS.reset}\n`);
    }
  }
}

function hasActiveEdgeFilter({ types, includeExternal, includeUnresolved } = {}) {
  return (
    (Array.isArray(types) && types.length > 0) ||
    includeExternal === false ||
    includeUnresolved === false
  );
}

function formatActiveEdgeFilters({ types, includeExternal, includeUnresolved } = {}) {
  const parts = [];
  if (Array.isArray(types) && types.length > 0) parts.push(`types=${types.join(',')}`);
  if (includeExternal === false) parts.push('external=false');
  if (includeUnresolved === false) parts.push('unresolved=false');
  return parts.join(' · ') || 'none';
}

function renderEdgesByRelation(edges, peerField) {
  // relation 별 그룹 (via 키)
  const grouped = new Map();
  for (const e of edges) {
    const key = e.relationType || e.via || '?';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(e);
  }
  // relation count 큰 순으로
  const sorted = [...grouped.entries()].sort(([, a], [, b]) => b.length - a.length);
  for (const [via, rows] of sorted) {
    process.stdout.write(`  ${COLORS.yellow}${via}${COLORS.reset} ${COLORS.dim}× ${rows.length}${COLORS.reset}\n`);
    for (const e of rows) {
      const other = e[peerField];
      const otherKind = e.otherKind || (e.external ? 'external' : '?');
      const kc = KIND_COLORS[otherKind] || COLORS.dim;
      const title = e.otherNode?.title ? ` ${COLORS.dim}— ${e.otherNode.title}${COLORS.reset}` : '';
      const externalMark = e.external ? ` ${COLORS.dim}[external]${COLORS.reset}` : '';
      process.stdout.write(`    ${kc}${other}${COLORS.reset}${title}${externalMark}\n`);
    }
  }
}

function renderLimitedHint(group, label) {
  if (!group?.limited) return;
  const shown = Array.isArray(group.edges) ? group.edges.length : 0;
  process.stdout.write(
    `  ${COLORS.dim}${label} edges limited: showing ${shown}/${group.total}; use --limit N for more.${COLORS.reset}\n`,
  );
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    limit: undefined,
    types: undefined,
    includeExternal: undefined,
    includeUnresolved: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') {
      const limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: 500 });
      if (limit instanceof Error) return { error: limit.message };
      flags.limit = limit;
    } else if (a.startsWith('--limit=')) {
      const limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: 500 });
      if (limit instanceof Error) return { error: limit.message };
      flags.limit = limit;
    } else if (a === '--types') {
      const types = parseRelationTypes(args[++i]);
      if (types instanceof Error) return { error: types.message };
      flags.types = types;
    } else if (a.startsWith('--types=')) {
      const types = parseRelationTypes(a.slice('--types='.length));
      if (types instanceof Error) return { error: types.message };
      flags.types = types;
    } else if (a === '--no-external') {
      flags.includeExternal = false;
    } else if (a === '--no-unresolved') {
      flags.includeUnresolved = false;
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'slug is required (e.g. `node capabilities/foo`)' };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    slug: positional[0],
    vault: vaultResult.vault,
    json: flags.json,
    limit: flags.limit,
    types: flags.types,
    includeExternal: flags.includeExternal,
    includeUnresolved: flags.includeUnresolved,
  };
}

function parseRelationTypes(value) {
  const types = parseCsvListFlag('--types', value, { itemName: 'relation type' });
  if (types instanceof Error) return types;
  const invalid = validateRelationTypeList(types, '--types items');
  return invalid || types;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology node <slug> [vault] [--limit N] [--types A,B] [--no-external] [--no-unresolved] [--json]\n\n` +
      `한 노드의 전체 deep dive — header · 도메인 · lineage · incoming/outgoing edges (relation 별 그룹).\n` +
      `--limit N 은 incoming/outgoing edge, lineage, containment rows 를 1..500 범위로 조절합니다.\n` +
      `--types A,B 는 관계 타입을 먼저 필터링합니다. 예: --types dependencies,relates\n` +
      `--no-external / --no-unresolved 는 외부 파일 ref 또는 미해결 ref 를 edge 목록에서 숨깁니다.\n`,
  );
}
