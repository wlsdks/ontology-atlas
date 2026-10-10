import {
  accessSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from '../parser.mjs';
import { REVIEW_NOTE_KEY, REVIEW_STATE_HUMAN_DECIDES, REVIEW_STATE_KEY } from '../schema.mjs';

import { noteGateRemoval } from './eligibility-gate.mjs';

/**
 * Thrown when a write passed `expectedMtime` and the file changed on disk since
 * that read (a GUI, an outside editor or another agent). Omitting the option
 * skips the check. mtime is integer ms; 1s-granularity filesystems suffice.
 */
export class VaultConflictError extends Error {
  constructor(slug, expectedMtime, currentMtime) {
    super(
      `Vault conflict: "${slug}" was modified externally (changed on disk) between read and write. ` +
        `expectedMtime=${expectedMtime} currentMtime=${currentMtime}. ` +
        // Name only a recovery that works: seven of the eight write tools that raise
        // this do not accept `force`, and delete_concept's `force` means "despite
        // backlinks", not "ignore mtime".
        `Re-read the doc with get_concept to get the current expected_mtime, then retry the write.`,
    );
    this.name = 'VaultConflictError';
    this.code = 'VAULT_CONFLICT';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

/** File mtime in ms, or null when absent; capture it right after a read to pass as `expectedMtime`. */
export function getFileMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

export function assertSnapshotMtime(slug, expectedMtime, currentMtime) {
  if (expectedMtime === null || expectedMtime === undefined) return;
  if (currentMtime === null || Math.abs(currentMtime - expectedMtime) >= 1) {
    throw new VaultConflictError(slug, expectedMtime, currentMtime);
  }
}

export function assertCurrentDocSnapshot(slug, filePath, expectedRaw, expectedMtime) {
  if (!fileMatchesExpectedRaw(filePath, expectedRaw)) {
    throw new VaultConflictError(slug, expectedMtime, getFileMtime(filePath));
  }
}

function existingRegularFileMode(filePath) {
  try {
    const metadata = statSync(filePath);
    return metadata.isFile() ? metadata.mode & 0o777 : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function fileMatchesExpectedRaw(filePath, expectedRaw) {
  if (expectedRaw === undefined) return true;
  try {
    return readFileSync(filePath, 'utf-8') === expectedRaw;
  } catch {
    return false;
  }
}

function entryChangedOnDisk(entry) {
  if (entry.expectedAbsent === true) return existsSync(entry.path);
  if (entry.expectedRaw !== undefined && !fileMatchesExpectedRaw(entry.path, entry.expectedRaw)) {
    return true;
  }
  if (entry.expectedMtime === null || entry.expectedMtime === undefined) return false;
  const current = getFileMtime(entry.path);
  return current === null || Math.abs(current - entry.expectedMtime) >= 1;
}

function changedOnDiskError(paths) {
  return new Error(
    `Refused before writing anything: ${paths.length} file(s) changed on disk or were deleted since they `
      + `were read, so this operation would overwrite someone else's edit:\n  `
      + `${paths.join('\n  ')}\n`
      + 'The vault is unchanged. Re-read those documents and run this again.',
  );
}

/**
 * Writes one file without a torn state: temp file, fsync, rename. A rename is
 * atomic within one filesystem, so a crash leaves either the old contents or the
 * new, never a truncated user file.
 */
export function writeFileAtomically(filePath, text, options = {}) {
  const temporaryPath = `${filePath}.oatlas-tmp-${process.pid}`;
  const existingMode = existingRegularFileMode(filePath);
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    // Before the contents, so the temp file never widens a private original's mode.
    if (existingMode !== null) fchmodSync(descriptor, existingMode);
    writeFileSync(descriptor, text, 'utf-8');
  // Flush before the rename, or power loss can leave the new name with the
  // contents still in cache.
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    options.beforeCommit?.();
    if (entryChangedOnDisk({
      path: filePath,
      expectedRaw: options.expectedRaw,
      expectedAbsent: options.expectedAbsent,
    })) {
      if (options.conflictSlug) {
        throw new VaultConflictError(
          options.conflictSlug,
          options.expectedMtime,
          getFileMtime(filePath),
        );
      }
      throw changedOnDiskError([filePath]);
    }
    renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        /* already closed */
      }
    }
    try {
      // Only a failed write leaves the temp file; removing it never touches the original.
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      /* even if it cannot be cleared, the original is intact */
    }
  }
}

/**
 * Key for "do these paths name the same file": the real path when it exists,
 * else the string, lowercased for case-insensitive filesystems. On a
 * case-sensitive one, a false match costs one skipped delete, never data.
 */
function sameFileKey(path) {
  try {
    if (existsSync(path)) return realpathSync(path).toLowerCase();
  } catch {
    /* unresolvable real path: the string is still a verdict */
  }
  return resolve(path).toLowerCase();
}

/** Nearest existing parent of a write target that does not exist yet. The pre-check never creates anything. */
function nearestExistingParent(path) {
  let probe = dirname(path);
  for (;;) {
    if (existsSync(probe)) return probe;
    const parent = dirname(probe);
    if (parent === probe) return probe;
    probe = parent;
  }
}

/**
 * Creates parents one level at a time, only during the real apply: a per-level
 * EEXIST tells a directory another process raced in from one we own, so
 * rollback removes only ours.
 */
function createMissingParents(path, createdDirectories) {
  const missing = [];
  let probe = dirname(path);
  while (!existsSync(probe)) {
    missing.push(probe);
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  for (const dir of missing.reverse()) {
    try {
      mkdirSync(dir);
      createdDirectories.push(dir);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
}

/**
 * The refusal sentence when the file carries `review_state: human_decides`, or
 * null when absent, unparseable or unreserved: a created file steps on no
 * reservation, and an unreadable one must not invent one.
 */
function reservedForHumanIssue(filePath) {
  if (typeof filePath !== 'string' || !existsSync(filePath)) return null;
  let frontmatter;
  try {
    frontmatter = parseFrontmatter(readFileSync(filePath, 'utf8')).frontmatter ?? {};
  } catch {
    return null;
  }
  if (frontmatter[REVIEW_STATE_KEY] !== REVIEW_STATE_HUMAN_DECIDES) return null;
  const note = frontmatter[REVIEW_NOTE_KEY];
  const slug = typeof frontmatter.slug === 'string' ? frontmatter.slug : filePath;
  return (
    `Refused: ${slug} carries ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES}, so it is reserved for a person` +
    ' and this change would rewrite it.' +
    (note ? ` What they have to decide: ${note}` : '') +
    ' Report it and let the person decide; only they release the reservation.'
  );
}

/**
 * Any I/O failure while the process lives leaves the vault as it started: every
 * target's permission is pre-checked and a later failure restores the original
 * bytes. Not crash-safe, hence not "atomic": that needs a journal, and the vault is git.
 */
export function applyAllOrNothing(plan, options = {}) {
  if (!Array.isArray(plan) || plan.length === 0) return { applied: 0 };

  /*
   * ⓿ Every touched file must be unreserved, not only the named one: rename,
   * reclassify and merge rewrite backlinks nobody named. Checked here, where every
   * multi-file plan passes, so a new tool inherits it.
   */
  if (options.allowReservedTargets !== true) {
    for (const entry of plan) {
      const reserved = reservedForHumanIssue(entry.path);
      if (reserved) throw new Error(reserved);
    }
  }

  /*
   * ⓪ A plan that writes then deletes the same file drops the delete: a case-only
   * rename (write `auth.md`, delete `Auth.md`) names one file on macOS and Windows,
   * so the delete would erase what was just written.
   */
  const writeTargets = new Set();
  for (const entry of plan) {
    if (entry.op !== 'write') continue;
    writeTargets.add(sameFileKey(entry.path));
  }
  const safePlan = plan.filter(
    (entry) => entry.op !== 'delete' || !writeTargets.has(sameFileKey(entry.path)),
  );
  if (safePlan.length !== plan.length) plan = safePlan;

  if (options.requireRevisions === true) {
    const missingRevisions = plan
      .filter((entry) => {
        if (existsSync(entry.path)) return entry.expectedRaw === undefined;
        if (entry.op === 'write') return entry.expectedAbsent !== true;
        return entry.expectedRaw === undefined;
      })
      .map((entry) => entry.path);
    if (missingRevisions.length > 0) {
      throw new Error(
        `Refused before writing anything: ${missingRevisions.length} plan item(s) are missing snapshot revision data:\n  `
          + `${missingRevisions.join('\n  ')}\nThe vault is unchanged. Rebuild the plan from fresh reads.`,
      );
    }
  }

  /*
   * ⓪-b If someone edited a target since the planner's snapshot, write nothing.
   * Rename, merge and reclassify rewrite N documents read minutes earlier; an
   * entry without `expectedMtime` is not checked.
   */
  const conflicts = [];
  for (const entry of plan) {
    if (entryChangedOnDisk(entry)) conflicts.push(entry.path);
  }
  if (conflicts.length > 0) {
    throw changedOnDiskError(conflicts);
  }

  // ① Pre-check before writing anything, so the common failures (read-only or
  //    locked file, read-only vault) need no rollback.
  const blocked = [];
  for (const entry of plan) {
    const dir = dirname(entry.path);
    try {
      if (existsSync(entry.path)) {
        accessSync(entry.path, fsConstants.W_OK);
      } else if (entry.op === 'write') {
        accessSync(nearestExistingParent(entry.path), fsConstants.W_OK);
      }
      if (entry.op === 'delete' && existsSync(entry.path)) {
        // Deleting needs write permission on the directory, not the file.
        accessSync(dir, fsConstants.W_OK);
      }
    } catch (error) {
      blocked.push(`${entry.path} (${error?.code ?? 'EACCES'})`);
    }
  }
  if (blocked.length > 0) {
    throw new Error(
      `Refused before writing anything: ${blocked.length} file(s) are not writable, `
        + `so this operation could not finish as one unit:\n  ${blocked.join('\n  ')}\n`
        + 'The vault is unchanged. Fix permissions (or close the editor/sync client '
        + 'holding them) and re-run with confirm: true.',
    );
  }

  // ② Apply, keeping each entry's prior state for rollback.
  const done = [];
  const createdDirectories = [];
  try {
    for (let index = 0; index < plan.length; index += 1) {
      const entry = plan[index];
      options.beforeApplyEntry?.(index, entry);
      if (entryChangedOnDisk(entry)) throw changedOnDiskError([entry.path]);
      const existed = existsSync(entry.path);
      const before = existed ? readFileSync(entry.path, 'utf-8') : null;
      if (entry.op === 'write') {
        createMissingParents(entry.path, createdDirectories);
        writeFileAtomically(entry.path, entry.content, {
          expectedRaw: existed ? before : undefined,
          expectedAbsent: !existed,
        });
      } else {
        if (existed) {
          if (!fileMatchesExpectedRaw(entry.path, before)) throw changedOnDiskError([entry.path]);
          unlinkSync(entry.path);
        }
      }
      done.push({
        path: entry.path,
        op: entry.op,
        existed,
        before,
        after: entry.op === 'write' ? entry.content : null,
      });
    }
    // A delete invalidates the gate index, so the removed slug stops resolving.
    if (done.some((step) => step.op === 'delete')) noteGateRemoval();
    return { applied: done.length };
  } catch (error) {
    const unrecovered = [];
    for (const step of done.reverse()) {
      try {
        if (step.op === 'write') {
          if (!fileMatchesExpectedRaw(step.path, step.after)) {
            unrecovered.push(step.path);
            continue;
          }
          if (step.existed) {
            writeFileAtomically(step.path, step.before, { expectedRaw: step.after });
          } else if (existsSync(step.path)) {
            unlinkSync(step.path);
          }
        } else if (step.existed) {
          if (existsSync(step.path)) {
            unrecovered.push(step.path);
            continue;
          }
          writeFileAtomically(step.path, step.before, { expectedAbsent: true });
        }
      } catch {
        unrecovered.push(step.path);
      }
    }
    for (const dir of createdDirectories.reverse()) {
      try {
        rmdirSync(dir);
      } catch (rollbackError) {
        if (rollbackError?.code !== 'ENOENT') unrecovered.push(dir);
      }
    }
    const reason = error?.message ?? String(error);
    if (unrecovered.length > 0) {
      throw new Error(
        `Write failed (${reason}) and the rollback could not finish. `
          + `The vault is INCONSISTENT: these files still hold rewritten content:\n  `
          + `${unrecovered.join('\n  ')}\n`
          + 'If the vault is a git repository, `git diff` shows exactly what changed '
          + 'and `git checkout -- <path>` restores it.',
      );
    }
    throw new Error(
      `Write failed (${reason}). Every change was rolled back: the vault is unchanged.`,
    );
  }
}
