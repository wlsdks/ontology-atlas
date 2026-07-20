// `ontology-atlas relate <from> <to> <type> [vault]`
// R+ (agent-persona-2026-07 QA log — agent wishlist #1, friction #2). The CLI
// had a read/propose command (`relation-check`) that computes the exact
// `add_relation` payload, but no CLI writer to execute it — only hand-editing
// frontmatter or the MCP `add_relation` tool could actually land a relation.
// Every other read/propose pair in this surface (analyze/infer-imports,
// growth/maintenance) already has a CLI apply path; this closes the gap for
// the single most basic ontology-editing verb.
//
// Same argument shape as `relation-check` on purpose (drop-in — preflight
// then land). Reuses relation-check's MCP query_ontology(relation_check) call
// for slug/type validation + schema/recommendation display (see
// ../lib/relation-preflight.mjs), then writes the relation directly onto the
// `from` doc's frontmatter with the CLI's own fs primitives — mirroring
// mcp/src/vault.mjs's addRelation semantics (canonical slugs, sorted/deduped
// arrays, domain is a single scalar not an array) but following the existing
// CLI convention (see `add`/`import`) of writing vault files directly instead
// of spawning the MCP `add_relation` write tool.

import { COLORS } from '../lib/colors.mjs';
import { runRelationCheckQuery, renderRelationCheckResult } from '../lib/relation-preflight.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { normalizeRelationRefs, readDocFrontmatter, writeFrontmatterKey, writeFrontmatterKeys } from '../lib/write-vault.mjs';
import {
  formatUnknownFlagError,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--dry-run', '--why'];

// type (public, what relation-check/add_relation accept) → frontmatter array
// key. Mirrors mcp/src/index.js's RELATION_KEY — CLI keeps its own copy
// rather than importing across the mcp/cli package boundary, same as
// relation-types.mjs already does for the type enum itself.
const RELATION_KEY = Object.freeze({
  depends_on: 'dependencies',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domains: 'domains',
  capabilities: 'capabilities',
  elements: 'elements',
  domain: 'domain',
});

export async function runRelate(args) {
  const { from, to, type, vault, json, dryRun, why, error, help } = parseArgs(args);
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

  let check;
  try {
    check = await runRelationCheckQuery(vaultRoot, from, to, type);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (!json) renderRelationCheckResult(check);

  if (check.exists) {
    if (json) {
      process.stdout.write(JSON.stringify({ ...check, written: false, dryRun, alreadyExists: true, filePath: null }, null, 2) + '\n');
    } else {
      process.stdout.write(`\n${COLORS.green}ok${COLORS.reset}    already exists — nothing to write\n`);
    }
    return 0;
  }

  if (dryRun) {
    if (json) {
      process.stdout.write(JSON.stringify({ ...check, written: false, dryRun: true, alreadyExists: false, filePath: null }, null, 2) + '\n');
    } else {
      process.stdout.write(
        `\n${COLORS.cyan}dry-run${COLORS.reset} would write ${COLORS.bold}${check.relation}${COLORS.reset}` +
          ` on ${COLORS.bold}${check.from}${COLORS.reset} → ${COLORS.bold}${check.to}${COLORS.reset}` +
          ` ${COLORS.dim}(no file changed)${COLORS.reset}\n`,
      );
    }
    return 0;
  }

  try {
    const filePath = writeRelation(vaultRoot, { from: check.from, to: check.to, relation: check.relation, why });
    if (json) {
      process.stdout.write(JSON.stringify({ ...check, written: true, dryRun: false, alreadyExists: false, filePath }, null, 2) + '\n');
    } else {
      process.stdout.write(`\n${COLORS.green}ok${COLORS.reset}    wrote ${filePath}\n`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 1;
  }
}

/**
 * relation_check 이 이미 from/to/relation 을 canonical slug 로 resolve 해뒀다
 * (alias 입력도 정규 slug 로 반환) — 여기서는 그 canonical 값을 그대로 쓴다.
 * mcp/src/index.js 의 addRelation 과 같은 두 갈래:
 *  - relation === 'domain' → 단일 scalar 필드 교체. 이미 다른 값이 있으면
 *    (add_relation 과 동일하게) 거부 — patch_concept/직접 편집으로 유도.
 *  - 그 외 → 배열에 append + normalizeRelationRefs (정렬 + 중복 제거).
 */
function writeRelation(rootPath, { from, to, relation, why = null }) {
  // preflight 는 이미 frontmatter 키('dependencies' 등)를 relation 으로
  // 돌려주기도 한다 — 타입/키 양쪽 표기를 수용한다.
  const key = RELATION_KEY[relation] ?? relation;
  const { frontmatter } = readDocFrontmatter(rootPath, from);
  if (key === 'domain') {
    const existingDomain = frontmatter.domain;
    if (typeof existingDomain === 'string' && existingDomain.trim() && existingDomain !== to) {
      throw new Error(
        `Source slug already has domain "${existingDomain}". Edit the file directly, or use the MCP patch_concept tool to change it explicitly.`,
      );
    }
    return writeFrontmatterKey(rootPath, from, 'domain', to);
  }
  const existing = Array.isArray(frontmatter[key]) ? frontmatter[key] : [];
  const next = normalizeRelationRefs([...existing, to]);
  // P6 — --why: 관계와 근거를 같은 쓰기로 (MCP add_relation why 미러).
  if (typeof why === 'string' && why.trim()) {
    const notes = frontmatter.relation_notes && typeof frontmatter.relation_notes === 'object'
      ? { ...frontmatter.relation_notes }
      : {};
    notes[to] = why.trim();
    return writeFrontmatterKeys(rootPath, from, { [key]: next, relation_notes: notes });
  }
  return writeFrontmatterKey(rootPath, from, key, next);
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, dryRun: false, why: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--why') flags.why = args[++i] ?? null;
    else if (a.startsWith('--why=')) flags.why = a.slice('--why='.length);
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length < 3) {
    return { error: '<from>, <to>, and <type> are required' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const typeError = validateRelationTypeList([positional[2]], 'type');
  if (typeError) return { error: typeError.message };
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 3 });
  if (vaultResult.error) return vaultResult;
  return {
    from: positional[0],
    to: positional[1],
    type: positional[2],
    vault: vaultResult.vault,
    json: flags.json,
    dryRun: flags.dryRun,
    why: flags.why,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas relate <from> <to> <type> [vault] [--vault path] [--json] [--dry-run]\n\n` +
      `Same argument shape as relation-check. Runs the identical relation_check preflight\n` +
      `(rejects nonexistent from/to slugs or an invalid type before touching the vault),\n` +
      `then writes the relation onto <from>'s frontmatter unless it already exists.\n` +
      `--dry-run prints the preflight result without writing.\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  ontology-atlas relate capabilities/foo domains/auth domain docs/ontology\n` +
      `  ontology-atlas relate capabilities/foo capabilities/bar depends_on --dry-run\n`,
  );
}
