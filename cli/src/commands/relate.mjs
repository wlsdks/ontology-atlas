// `ontology-atlas relate <from> <to> <type> [vault]`: the CLI writer for `relation-check`, with the same argument
// shape. Validates through relation-check's MCP call (../lib/relation-preflight.mjs), then writes the `from` doc's
// frontmatter directly like `add`/`import`, mirroring mcp/src/tools/write-relations.mjs addRelation (canonical, sorted, deduped; domain is a scalar).

import { COLORS } from '../lib/colors.mjs';
import { runRelationCheckQuery, renderRelationCheckResult } from '../lib/relation-preflight.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { normalizeRelationRefs, readDocFrontmatter, writeFrontmatterKey, writeFrontmatterKeys } from '../lib/write-vault.mjs';
import {
  formatUnknownFlagError,
  parseRawRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';
import { recordCliWrite } from '../lib/activity-log.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--dry-run', '--why'];

// Public relation type → frontmatter array key. Mirrors mcp/src/tools/relation-keys.mjs RELATION_KEY; the CLI keeps
// its own copy rather than import across the mcp/cli package boundary.
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

// Authoring aliases per canonical key (mcp/src/vault/ NEIGHBOR_KEY_ALIASES). Reading only the
// canonical key would split one edge type across two keys that MCP folds.
const LEGACY_KEYS = Object.freeze({ dependencies: ['depends_on'] });

/** Refs under the canonical key plus its authoring aliases. */
export function relationRefsFor(frontmatter, key) {
  const refs = [];
  for (const k of [key, ...(LEGACY_KEYS[key] ?? [])]) {
    const value = frontmatter[k];
    if (Array.isArray(value)) refs.push(...value);
  }
  return refs;
}

/** Writes the canonical key and deletes any alias key it consolidated. */
export function relationKeyPatch(frontmatter, key, nextRefs) {
  const patch = { [key]: nextRefs };
  for (const legacy of LEGACY_KEYS[key] ?? []) {
    if (frontmatter[legacy] !== undefined) patch[legacy] = null;
  }
  return patch;
}

const DEFAULT_RUNTIME = Object.freeze({
  runRelationCheckQuery,
  renderRelationCheckResult,
  readDocFrontmatter,
  writeFrontmatterKey,
  writeFrontmatterKeys,
  recordCliWrite,
});

/**
 * `runtime` is an internal command-test seam. The executable command always
 * uses the defaults; callers cannot supply it through CLI arguments.
 */
export async function runRelate(args, runtimeOverrides = {}) {
  const runtime = { ...DEFAULT_RUNTIME, ...runtimeOverrides };
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
    check = await runtime.runRelationCheckQuery(vaultRoot, from, to, type);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (!json) runtime.renderRelationCheckResult(check);

  if (check.exists) {
    if (json) {
      process.stdout.write(JSON.stringify({ ...check, written: false, dryRun, alreadyExists: true, filePath: null }, null, 2) + '\n');
    } else {
      process.stdout.write(`\n${COLORS.green}ok${COLORS.reset}    already exists: nothing to write\n`);
    }
    return 0;
  }

  if (dryRun) {
    // Apply the rules the real command applies, or the preview says it will write while the write refuses.
    let refusal = null;
    try {
      const { frontmatter } = runtime.readDocFrontmatter(vaultRoot, check.from);
      refusal = relationWriteRefusal({ frontmatter, relation: check.relation, to: check.to, why });
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
    if (refusal) {
      if (json) {
        process.stdout.write(JSON.stringify({ ...check, written: false, dryRun: true, alreadyExists: false, filePath: null, refusal }, null, 2) + '\n');
      } else {
        process.stderr.write(`\n${COLORS.red}error${COLORS.reset}  ${refusal}\n`);
      }
      return 1;
    }
    if (json) {
      process.stdout.write(JSON.stringify({ ...check, written: false, dryRun: true, alreadyExists: false, filePath: null, refusal: null }, null, 2) + '\n');
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
    const filePath = writeRelation(
      vaultRoot,
      { from: check.from, to: check.to, relation: check.relation, why },
      runtime,
    );
    // Only an actually written relation reaches the audit log (dry-run and already-exists return above).
    await runtime.recordCliWrite(vaultRoot, {
      tool: 'cli:relate',
      target: check.from,
      summary: `${check.from} --${type}--> ${check.to}`,
      why: why ?? null,
    });
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
 * The sentence explaining why this relation cannot be written, or `null`. Pure so that dry-run and
 * the real write call the same rule (`cli/src/commands/relate.dry-run-parity.test.mjs`).
 */
export function relationWriteRefusal({ frontmatter, relation, to, why = null }) {
  const key = RELATION_KEY[relation] ?? relation;
  if (key === 'domain') {
    const existing = frontmatter?.domain;
    if (typeof existing === 'string' && existing.trim() && existing !== to) {
      return `Source slug already has domain "${existing}". Edit the file directly, or use the MCP patch_concept tool to change it explicitly.`;
    }
    return null;
  }
  if (key === 'dependencies' && (typeof why !== 'string' || !why.trim())) {
    return (
      'why is required and must be nonblank for a new depends_on relation. ' +
      'Explain the stable semantic dependency after explicit human approval.'
    );
  }
  return null;
}

/**
 * relation_check returned canonical slugs. As in mcp/src/tools/write-relations.mjs addRelation, `domain`
 * replaces a scalar and refuses a different value; other keys append, then normalizeRelationRefs sorts and dedupes.
 */
function writeRelation(rootPath, { from, to, relation, why = null }, runtime) {
  // preflight sometimes returns the frontmatter key ('dependencies' and friends) as
  // the relation, so both the type and the key spelling are accepted.
  const key = RELATION_KEY[relation] ?? relation;
  const { frontmatter, revision } = runtime.readDocFrontmatter(rootPath, from);
  const refusal = relationWriteRefusal({ frontmatter, relation, to, why });
  if (refusal) throw new Error(refusal);
  if (key === 'domain') {
    return runtime.writeFrontmatterKey(rootPath, from, 'domain', to, { expectedRevision: revision });
  }
  const existing = relationRefsFor(frontmatter, key);
  const next = normalizeRelationRefs([...existing, to]);
  const patch = relationKeyPatch(frontmatter, key, next);
  // --why: the relation and its rationale in one write (mirrors MCP add_relation's why).
  if (typeof why === 'string' && why.trim()) {
    const notes = frontmatter.relation_notes && typeof frontmatter.relation_notes === 'object'
      ? { ...frontmatter.relation_notes }
      : {};
    notes[to] = why.trim();
    patch.relation_notes = notes;
  }
  return runtime.writeFrontmatterKeys(rootPath, from, patch, { expectedRevision: revision });
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
    // Flag-like next tokens are rejected, like every other value flag here, so `--why --dry-run`
    // cannot swallow `--dry-run` and turn a preview into a real write.
    else if (a === '--why') flags.why = parseRawRequiredFlagValue('--why', args[++i]);
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
