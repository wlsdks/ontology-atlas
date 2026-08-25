// `ontology-atlas remove-relation <from> <to> <type> [vault]`
//
// ⚠️ The half of relation editing the CLI never had (measured 2026-08-25, owner:
// *"make every feature usable from the CLI alone"*). `relate` could **create** a
// relation and nothing could remove one, so a person working only in the terminal
// had to open the Markdown and hand-edit frontmatter to undo their own typo —
// which is exactly the hand-editing every other write command exists to avoid,
// and the one place where "the CLI can do everything" was simply false.
//
// Same argument shape as `relate` on purpose, so undoing reads as the mirror of
// doing: identical positional order, identical flags, dry-run by default off but
// available. It writes with the same `write-vault.mjs` primitives and the same
// `expectedRevision` guard, so a relation removed here cannot silently clobber a
// change somebody else made to that file since it was read.
//
// It deliberately does **not** call `relation-check`: that command answers "may
// this relation exist", which is a question about creating one. Removing needs a
// different fact — does this relation exist right now — and that is read straight
// from the document's own frontmatter.

import { COLORS } from '../lib/colors.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { normalizeRelationRefs, readDocFrontmatter, writeFrontmatterKey, writeFrontmatterKeys } from '../lib/write-vault.mjs';
import { validateRelationTypeList } from '../lib/relation-types.mjs';
import {
  formatUnknownFlagError,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';
import { recordCliWrite } from '../lib/activity-log.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--dry-run'];

// Mirrors `relate.mjs`'s copy, for the same reason it keeps one: the CLI does not
// import across the mcp/cli package boundary.
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

const DEFAULT_RUNTIME = Object.freeze({
  readDocFrontmatter,
  writeFrontmatterKey,
  writeFrontmatterKeys,
  recordCliWrite,
});

/**
 * Finds the relation on the document, or explains precisely why it is not there.
 *
 * The two failures are different and a person can act on only one of them: a slug that is not in the
 * list at all versus a list that does not exist on this document. Saying "not found" for both would
 * hide a mistyped relation type behind a mistyped slug.
 */
export function planRemoval(frontmatter, relation, to) {
  const key = RELATION_KEY[relation] ?? relation;
  if (key === 'domain') {
    const current = typeof frontmatter.domain === 'string' ? frontmatter.domain : null;
    if (current !== to) {
      return { key, found: false, reason: current ? `domain is ${current}, not ${to}` : 'no domain is set' };
    }
    return { key, found: true, next: null };
  }
  const existing = Array.isArray(frontmatter[key]) ? frontmatter[key] : null;
  if (existing === null) return { key, found: false, reason: `this document has no ${key}` };
  const normalized = normalizeRelationRefs(existing);
  if (!normalized.includes(to)) {
    return { key, found: false, reason: `${to} is not in ${key} (${normalized.length} entr${normalized.length === 1 ? 'y' : 'ies'})` };
  }
  return { key, found: true, next: normalized.filter((ref) => ref !== to) };
}

function removeRelation(rootPath, { from, to, relation }, runtime) {
  const { frontmatter, revision } = runtime.readDocFrontmatter(rootPath, from);
  const plan = planRemoval(frontmatter, relation, to);
  if (!plan.found) throw new Error(`nothing to remove: ${plan.reason}`);

  // The rationale goes with the relation it explained. Leaving `relation_notes[to]`
  // behind would keep a sentence about an edge that no longer exists — the kind of
  // orphan a later reader trusts because it is written down.
  const notes =
    frontmatter.relation_notes && typeof frontmatter.relation_notes === 'object'
      ? { ...frontmatter.relation_notes }
      : null;
  const hadNote = notes !== null && Object.prototype.hasOwnProperty.call(notes, to);
  if (hadNote) delete notes[to];

  if (plan.key === 'domain') {
    const patch = hadNote ? { domain: null, relation_notes: notes } : { domain: null };
    return { ...runtime.writeFrontmatterKeys(rootPath, from, patch, { expectedRevision: revision }), plan };
  }
  const patch = hadNote ? { [plan.key]: plan.next, relation_notes: notes } : { [plan.key]: plan.next };
  return { ...runtime.writeFrontmatterKeys(rootPath, from, patch, { expectedRevision: revision }), plan };
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, dryRun: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length < 3) return { error: '<from>, <to>, and <type> are required' };
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
    relation: positional[2],
    vault: vaultResult.vault,
    json: flags.json,
    dryRun: flags.dryRun,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `${COLORS.bold}remove-relation${COLORS.reset} — take one relation off a node\n\n` +
      `${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas remove-relation <from> <to> <type> [vault] [--vault path] [--json] [--dry-run]\n\n` +
      `The mirror of ${COLORS.bold}relate${COLORS.reset}: same arguments, opposite direction.\n` +
      `--dry-run reports what would be removed without writing.\n\n` +
      `  ontology-atlas remove-relation capabilities/foo capabilities/bar depends_on --dry-run\n`,
  );
}

export async function runRemoveRelation(args, runtimeOverrides = {}) {
  const runtime = { ...DEFAULT_RUNTIME, ...runtimeOverrides };
  const { from, to, relation, vault, json, dryRun, error, help } = parseArgs(args);
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

  if (dryRun) {
    const { frontmatter } = runtime.readDocFrontmatter(vaultRoot, from);
    const plan = planRemoval(frontmatter, relation, to);
    if (json) {
      process.stdout.write(JSON.stringify({ from, to, relation, ...plan, dryRun: true }, null, 2) + '\n');
    } else if (plan.found) {
      process.stdout.write(`would remove ${to} from ${from}.${plan.key}\n`);
    } else {
      process.stdout.write(`nothing to remove: ${plan.reason}\n`);
    }
    return plan.found ? 0 : 1;
  }

  let result;
  try {
    result = removeRelation(vaultRoot, { from, to, relation }, runtime);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  await runtime.recordCliWrite(vaultRoot, {
    tool: 'cli:remove-relation',
    target: from,
    summary: `${from} --${relation}--x ${to}`,
  });

  if (json) {
    process.stdout.write(
      JSON.stringify({ from, to, relation, key: result.plan.key, removed: true, dryRun: false }, null, 2) + '\n',
    );
  } else {
    process.stdout.write(`removed ${to} from ${from}.${result.plan.key}\n`);
  }
  return 0;
}
