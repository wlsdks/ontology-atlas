// `oh-my-ontology similar "<query>" [vault]` — 비슷한 노드 검색.
// MCP `query_ontology({operation: 'similar_nodes'})` thin wrapper. 새 노드
// 만들기 전 *duplicate 회피* 와 `/ontology-extract` skill 의 핵심 cross-check.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';

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

export async function runSimilar(args) {
  const { title, slug, vault, json, limit, kind, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }
  const vaultRoot = resolveVaultRoot(vault);
  // candidateSlug 우선 (slug-similarity), title 도 같이 (title-similarity).
  // 둘 다 없으면 안 됨 (parseArgs 가 보장).
  const toolArgs = { operation: 'similar_nodes', limit };
  if (slug) toolArgs.candidateSlug = slug;
  if (title) toolArgs.title = title;
  if (kind) toolArgs.kind = kind;
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', toolArgs);
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
  render(result, title || slug);
  return 0;
}

function render(result, query) {
  const matches = Array.isArray(result?.matches) ? result.matches : [];
  const total = result?.totalMatches ?? matches.length;
  process.stdout.write(
    `${COLORS.bold}similar to:${COLORS.reset} ${COLORS.bold}${query}${COLORS.reset}` +
      ` ${COLORS.dim}— ${total} match${total === 1 ? '' : 'es'}${result?.limited ? ' (limited)' : ''}${COLORS.reset}\n\n`,
  );
  if (matches.length === 0) {
    process.stdout.write(`${COLORS.green}no similar node — safe to create new${COLORS.reset}\n`);
    return;
  }
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const n = m.node ?? {};
    const kc = KIND_COLORS[n.kind] || COLORS.dim;
    const score = (m.score ?? 0).toFixed(3);
    const scoreColor = m.score >= 0.5 ? COLORS.red : m.score >= 0.25 ? COLORS.yellow : COLORS.dim;
    const rank = String(i + 1).padStart(2);
    const title = n.title ? ` ${COLORS.dim}— ${n.title}${COLORS.reset}` : '';
    process.stdout.write(
      `  ${COLORS.bold}${rank}${COLORS.reset} ${scoreColor}${score}${COLORS.reset}` +
        ` ${kc}${(n.kind || '?').padEnd(11)}${COLORS.reset} ${kc}${n.slug || '?'}${COLORS.reset}${title}\n`,
    );
    // signals — score 가 어디서 왔는지 한 줄 (0 아닌 신호만)
    const signals = m.signals ?? {};
    const active = Object.entries(signals)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`);
    if (active.length > 0) {
      process.stdout.write(`       ${COLORS.dim}signals: ${active.join(' · ')}${COLORS.reset}\n`);
    }
    if (Array.isArray(m.sharedNeighbors) && m.sharedNeighbors.length > 0) {
      process.stdout.write(
        `       ${COLORS.dim}shared: ${m.sharedNeighbors.slice(0, 3).join(', ')}${m.sharedNeighbors.length > 3 ? ` +${m.sharedNeighbors.length - 3}` : ''}${COLORS.reset}\n`,
      );
    }
  }
  // 행동 가이드 (한 줄)
  const top = matches[0];
  if (top && top.score >= 0.5) {
    process.stdout.write(
      `\n${COLORS.red}⚠${COLORS.reset} ${COLORS.dim}top score ≥ 0.5 — \`patch_concept\` 가 \`add_concept\` 보다 안전${COLORS.reset}\n`,
    );
  } else if (top && top.score >= 0.25) {
    process.stdout.write(
      `\n${COLORS.yellow}~${COLORS.reset} ${COLORS.dim}top score 0.25-0.5 — 새 노드 + \`relates\` edge 가 보통 더 깨끗${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  const flags = { vault: '.', json: false, limit: 10, kind: null, slug: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = Number(args[++i]) || 10;
    else if (a.startsWith('--limit=')) flags.limit = Number(a.slice('--limit='.length)) || 10;
    else if (a === '--kind') flags.kind = args[++i] || null;
    else if (a.startsWith('--kind=')) flags.kind = a.slice('--kind='.length);
    else if (a === '--slug') flags.slug = args[++i] || null;
    else if (a.startsWith('--slug=')) flags.slug = a.slice('--slug='.length);
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  if (positional.length === 0 && !flags.slug) {
    return { error: 'query is required (e.g. `similar "사용자 로그인"` or `similar --slug capabilities/foo`)' };
  }
  const [title, vault] = positional;
  if (vault && flags.vault === '.') flags.vault = vault;
  return {
    title: title || null,
    slug: flags.slug,
    vault: flags.vault,
    json: flags.json,
    limit: flags.limit,
    kind: flags.kind,
  };
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology similar "<title>" [vault] [--slug X] [--kind K] [--limit N] [--json]\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology similar "사용자 로그인"\n` +
      `  oh-my-ontology similar "auth flow" --kind capability\n` +
      `  oh-my-ontology similar --slug capabilities/auth-login\n\n` +
      `${COLORS.bold}Score 가이드:${COLORS.reset}\n` +
      `  ≥ 0.5  — 같은 노드 가능성 높음 → \`patch_concept\` 권장\n` +
      `  0.25-0.5 — 인접 개념 → 새 노드 + \`relates\` edge 깨끗\n` +
      `  < 0.25 — 무관 → 새 노드 안전\n`,
  );
}
