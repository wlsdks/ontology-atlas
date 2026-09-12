/**
 * `absorb_document` — pulling an external markdown file into the vault as a
 * node, backing up the source before rewriting it in place.
 */
import {
  buildAbsorptionPlan,
  buildSlimPointer,
} from '../absorb.mjs';
import { parseFrontmatter } from '../parser.mjs';
import {
  CREATED_BY_KEY,
  REVIEW_NOTE_KEY,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
  buildFrontmatter,
} from '../schema.mjs';
import {
  REPO_ROOT,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import {
  requireNonBlankString,
  requireOptionalBoolean,
} from '../server/validate.mjs';
import {
  slugToPath,
  writeDoc,
  writeFileAtomically,
} from '../vault.mjs';
import { compactPostWriteMaintenance } from './maintenance.mjs';
import {
  agentProvenance,
  destructivePreviewState,
} from './vault-nodes.mjs';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import {
  basename,
  relative,
  resolve,
  sep,
} from 'node:path';

const ABSORB_BACKUP_SUFFIX = '.pre-absorb.bak';

// Slice 0 — absorb_document. Mirror of cli/src/commands/absorb.mjs's write
// path; core plan logic lives in ./absorb.mjs (mirrored at
// cli/src/lib/absorb.mjs, kept in lock-step by
// tests/contract/absorb.contract.test.ts).
/**
 * `review_state: human_decides` on the file `absorb_document` was pointed at.
 *
 * Absorption is the one write path whose target is named by absolute path rather
 * than by slug, so it never reaches the slug-based guard or the plan guard. A
 * file that is not a reserved node returns null and absorption proceeds.
 */
function reservedSourceIssue(absolutePath) {
  let frontmatter;
  try {
    frontmatter = parseFrontmatter(readFileSync(absolutePath, 'utf-8')).frontmatter ?? {};
  } catch {
    return null;
  }
  if (frontmatter[REVIEW_STATE_KEY] !== REVIEW_STATE_HUMAN_DECIDES) return null;
  const note = frontmatter[REVIEW_NOTE_KEY];
  const slug = typeof frontmatter.slug === 'string' ? frontmatter.slug : absolutePath;
  return (
    `${slug} carries ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES}, so it is reserved for a person and absorbing it would rewrite it` +
    (note ? ` — what they have to decide: ${note}` : '') +
    '. Report it and let the person decide.'
  );
}

function absorbDocumentTool({ filePath, confirm = false, allowOutsideRepo = false }) {
  requireNonBlankString(filePath, 'filePath');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(allowOutsideRepo, 'allowOutsideRepo');
  const requestedPath = resolve(filePath);
  if (!existsSync(requestedPath) || !statSync(requestedPath).isFile()) {
    throw new Error(`file not found: ${requestedPath}`);
  }
  // Resolve symlinks before enforcing the boundary. Otherwise a path that
  // appears to live inside repoRoot could rewrite a target outside it.
  const abs = realpathSync(requestedPath);
  const canonicalRepoRoot = realpathSync(REPO_ROOT);
  const repoRelative = relative(canonicalRepoRoot, abs);
  const outsideRepo = repoRelative === '..' || repoRelative.startsWith(`..${sep}`);
  const backupPath = `${abs}${ABSORB_BACKUP_SUFFIX}`;
  const blockedReasons = [
    ...(outsideRepo && !allowOutsideRepo
      ? [
          `source file is outside repoRoot (${canonicalRepoRoot}); repeat with allowOutsideRepo:true only after reviewing the absolute path`,
        ]
      : []),
    ...(existsSync(backupPath)
      ? [`backup already exists and would be overwritten: ${backupPath}`]
      : []),
    // **Absorption rewrites its source**, and a source can be a vault node a
    // person reserved (Codex review, 2026-09-02). It does not go through the
    // multi-file plan guard, so the refusal has to be stated here. A backup
    // makes the rewrite recoverable; it does not make it permitted.
    ...(reservedSourceIssue(abs) ? [reservedSourceIssue(abs)] : []),
  ];
  const raw = readFileSync(abs, 'utf-8');
  const sourceLabel = basename(abs).replace(/\.md$/i, '');
  const plan = buildAbsorptionPlan(raw, {
    sourceLabel,
    isSlugTaken: (slug) => existsSync(slugToPath(VAULT_ROOT, slug)),
  });

  const sectionsOut = plan.sections.map((section) => ({
    heading: section.heading,
    category: section.category,
    kind: section.kind,
    role: section.role,
    confidence: section.confidence,
    action: section.action,
    targetSlug: section.targetSlug,
    injectionSuspect: section.injection.suspect,
    injectionMatches: section.injection.matches.map((m) => m.pattern),
  }));

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({
        dryRun: true,
        wouldChange: true,
        blockedReasons,
      }),
      filePath: abs,
      outsideRepo,
      sourceLabel,
      title: plan.title,
      summary: plan.summary,
      sections: sectionsOut,
      message:
        `dry-run — ${plan.summary.absorbed} section(s) would be absorbed as document/policy nodes, ` +
        `${plan.summary.suggested} suggested (not written), ${plan.summary.injectionSuspect} injection-suspect ` +
        `(excluded from absorption). ` +
        (blockedReasons.length > 0
          ? `Confirmation is blocked: ${blockedReasons.join('; ')}.`
          : 'Pass confirm:true to write.'),
    };
  }

  // **The dry-run branch reports; this branch blocks.** `blockedReasons` is
  // assembled above for the preview and never consulted here — each condition is
  // re-thrown on the write path individually. A refusal added to the list alone
  // would read as enforced and write anyway, which is how this one was found
  // (Codex review, 2026-09-02: the first fix landed in the list and the test
  // still recorded `ok: true, dryRun: false`).
  const reservedSource = reservedSourceIssue(abs);
  if (reservedSource) {
    throw new Error(`absorb_document blocked: ${reservedSource}`);
  }
  if (outsideRepo && !allowOutsideRepo) {
    throw new Error(
      `absorb_document blocked: source file is outside repoRoot (${canonicalRepoRoot}): ${abs}. ` +
        'Run a dry-run, review the absolute path, then pass allowOutsideRepo:true only if this rewrite is intended.',
    );
  }
  if (existsSync(backupPath)) {
    throw new Error(
      `backup already exists, refusing to overwrite: ${backupPath} — remove or rename it first.`,
    );
  }

  /*
   * All-or-nothing (2026-09-01 review): rename/merge/reclassify apply their
   * multi-file writes as one unit, and absorption has the same shape — N new
   * node files plus one source rewrite. Writing sections in a bare loop meant a
   * mid-loop failure (a slug created concurrently, EACCES, ENOSPC) left a
   * half-absorbed vault, and the retry re-planned around the already-landed
   * files into `-2`-suffixed duplicates. writeDoc still performs each write
   * (slug/identity validation, uid minting, the growth gate); the pre-check
   * refuses before anything lands and the rollback removes what this call
   * created — every written file is new, so unlink restores the vault.
   */
  const absorbSections = plan.sections.filter((section) => section.action === 'absorb');
  for (const section of absorbSections) {
    if (existsSync(slugToPath(VAULT_ROOT, section.targetSlug))) {
      throw new Error(
        `absorb_document refused before writing anything: "${section.targetSlug}" already exists ` +
          '(created since the dry-run). The vault is unchanged — run the dry-run again and re-confirm.',
      );
    }
  }
  const written = [];
  try {
    for (const section of absorbSections) {
      const fm = buildFrontmatter({
        slug: section.targetSlug,
        kind: 'document',
        title: section.targetTitle,
        role: 'policy',
        source: relative(VAULT_ROOT, abs),
        // Absorption is a write through this server too — same stamp, same identity source.
        [CREATED_BY_KEY]: agentProvenance(),
      });
      const body = `# ${section.targetTitle}\n\n${section.body}\n`;
      const writtenPath = writeDoc(VAULT_ROOT, section.targetSlug, { frontmatter: fm, body });
      written.push({ slug: section.targetSlug, filePath: writtenPath });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rollbackFailures = [];
    for (const entry of written) {
      try {
        unlinkSync(entry.filePath);
      } catch (rollbackError) {
        rollbackFailures.push(`${entry.filePath} (${rollbackError?.code ?? rollbackError})`);
      }
    }
    if (rollbackFailures.length > 0) {
      // Saying "I do not know" beats saying "it is fine" — name what was left behind.
      throw new Error(
        `absorb_document failed mid-write AND rollback could not remove ${rollbackFailures.length} file(s):\n  ` +
          `${rollbackFailures.join('\n  ')}\nRemove them by hand before retrying. Original error: ${message}`,
      );
    }
    throw new Error(
      `absorb_document failed before completing; every section written by this call was rolled back ` +
        `and the vault is unchanged. Original error: ${message}`,
    );
  }

  // Backup *after* the vault writes succeed — if a write throws above, the
  // original source file is left untouched and the caller can retry safely.
  copyFileSync(abs, backupPath);
  const pointer = buildSlimPointer(plan);
  // Atomic replace: a bare writeFileSync truncates the user's document first,
  // so a death between truncate and write destroyed the very file being absorbed.
  writeFileAtomically(abs, pointer);

  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    filePath: abs,
    outsideRepo,
    sourceLabel,
    title: plan.title,
    summary: plan.summary,
    sections: sectionsOut,
    written,
    backupPath,
    changed: true,
    message: `absorbed ${written.length} section(s) into the vault; source rewritten as a slim pointer (backup at ${backupPath}).`,
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

export {
  ABSORB_BACKUP_SUFFIX,
  reservedSourceIssue,
  absorbDocumentTool,
};
