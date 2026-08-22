// `ontology-atlas similar "<query>" [vault]` — finds similar nodes.
// Thin wrapper over MCP `query_ontology({operation: 'similar_nodes'})`. This is
// *duplicate avoidance* before creating a new node, and the core cross-check of
// the `/ontology-extract` skill.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { validateKindValue } from '../lib/kinds.mjs';
import { assertSimilarNodesShape } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { VAULT_KINDS } from '../lib/schema.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = ['--vault', '--json', '--limit', '--kind', '--slug'];


export async function runSimilar(args) {
  const { title, slug, vault, json, limit, kind, error, help } = parseArgs(args);
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
  // candidateSlug takes precedence (slug-similarity), title rides along
  // (title-similarity). At least one is required — parseArgs guarantees it.
  const toolArgs = { operation: 'similar_nodes', limit };
  if (slug) toolArgs.candidateSlug = slug;
  if (title) toolArgs.title = title;
  if (kind) toolArgs.kind = kind;
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', toolArgs);
    assertSimilarNodesShape(result);
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
      ` ${COLORS.dim}· ${total} match${total === 1 ? '' : 'es'}${result?.limited ? ' (limited)' : ''}${COLORS.reset}\n\n`,
  );
  if (matches.length === 0) {
    process.stdout.write(`${COLORS.green}no similar node: safe to create new${COLORS.reset}\n`);
    return;
  }
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const n = m.node ?? {};
    const kc = KIND_COLORS[n.kind] || COLORS.dim;
    const score = (m.score ?? 0).toFixed(3);
    const scoreColor = m.score >= 0.5 ? COLORS.red : m.score >= 0.25 ? COLORS.yellow : COLORS.dim;
    const rank = String(i + 1).padStart(2);
    const title = n.title ? ` ${COLORS.dim}· ${n.title}${COLORS.reset}` : '';
    process.stdout.write(
      `  ${COLORS.bold}${rank}${COLORS.reset} ${scoreColor}${score}${COLORS.reset}` +
        ` ${kc}${(n.kind || '?').padEnd(11)}${COLORS.reset} ${kc}${n.slug || '?'}${COLORS.reset}${title}\n`,
    );
    // signals — one line on where the score came from (non-zero signals only)
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
  // What to do next (one line)
  const top = matches[0];
  if (top && top.score >= 0.5) {
    process.stdout.write(
      `\n${COLORS.red}⚠${COLORS.reset} ${COLORS.dim}top score ≥ 0.5: \`patch_concept\` 가 \`add_concept\` 보다 안전${COLORS.reset}\n`,
    );
  } else if (top && top.score >= 0.25) {
    process.stdout.write(
      `\n${COLORS.yellow}~${COLORS.reset} ${COLORS.dim}top score 0.25-0.5: 새 노드 + \`relates\` edge 가 보통 더 깨끗${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, limit: 10, kind: null, slug: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit=')) flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--kind') flags.kind = parseRequiredFlagValue('--kind', args[++i]);
    else if (a.startsWith('--kind=')) flags.kind = parseRequiredFlagValue('--kind', a.slice('--kind='.length));
    else if (a === '--slug') flags.slug = parseRequiredFlagValue('--slug', args[++i]);
    else if (a.startsWith('--slug=')) flags.slug = parseRequiredFlagValue('--slug', a.slice('--slug='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0 && !flags.slug) {
    return { error: 'query is required (e.g. `similar "사용자 로그인"` or `similar --slug capabilities/foo`)' };
  }
  if (flags.vault === false) return { error: '--vault requires a path' };
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const kindError = validateKindValue('--kind', flags.kind, VAULT_KINDS);
  if (kindError) return { error: kindError };
  // **With `--slug`, the first positional is the vault, not a title** (measured 2026-07-29).
  //
  // The usage documents two forms side by side: `similar "<title>" [vault]` and
  // `similar --slug X`. Combining them (`similar --slug X /path/to/vault`) made
  // `vaultIndex: 1` unconditionally consume `positional[0]` as the title, so **the
  // vault path became the similarity query and the vault fell back to cwd.** The
  // user gets answers from **a different vault** than the folder they named.
  //
  // This command's whole job is duplicate avoidance (the `/ontology-extract`
  // counterpart), so the failure shows up as **false reassurance** — "nothing
  // similar, safe to create a new one" — the failure mode that hurts most as a
  // vault grows.
  const titleFromPositional = flags.slug ? null : positional[0] || null;
  const vaultResult = resolveTrailingVaultArg({
    vault: flags.vault,
    positional,
    vaultIndex: flags.slug ? 0 : 1,
  });
  if (vaultResult.error) return vaultResult;
  return {
    title: titleFromPositional,
    slug: flags.slug,
    vault: vaultResult.vault,
    json: flags.json,
    limit: flags.limit,
    kind: flags.kind,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas similar "<title>" [vault] [--slug X] [--kind K] [--limit N] [--json]\n\n` +
      `--limit range 1-${LIMIT_CAP}.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  ontology-atlas similar "사용자 로그인"\n` +
      `  ontology-atlas similar "auth flow" --kind capability\n` +
      `  ontology-atlas similar --slug capabilities/auth-login\n\n` +
      `${COLORS.bold}Score 가이드:${COLORS.reset}\n` +
      `  ≥ 0.5 : 같은 노드 가능성 높음 → \`patch_concept\` 권장\n` +
      `  0.25-0.5: 인접 개념 → 새 노드 + \`relates\` edge 깨끗\n` +
      `  < 0.25: 무관 → 새 노드 안전\n`,
  );
}
