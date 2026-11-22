// When each document last changed and how many commits touched it, read from
// `git log` so no date or revision is ever hand-written.
import { execSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

/** Is this a shallow (depth-limited) clone? False when git is absent or this is not a repository. */
export function isShallowRepository(rootDir) {
  try {
    return (
      execSync('git rev-parse --is-shallow-repository', {
        cwd: rootDir,
        encoding: 'utf-8',
      }).trim() === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * Per-document "last changed": the date of the commit that last touched the file (`%cs`, YYYY-MM-DD
 * in the commit's own timezone). Date, not timestamp: the value is committed alongside that commit,
 * whose timestamp is unknowable at generation time, and squash-merge, rebase and amend restamp it.
 * At date precision a restamp lands on the same day, so the value is unchanged and two PRs on one
 * day auto-merge. Every consumer works at day granularity or coarser.
 */
export function gitLastCommitDays(rootDir, scopeDir) {
  const days = new Map();
  // How many commits touched each path — a document's `revision`. Counted in the
  // same pass as the dates, so no field is ever hand-bumped.
  const commits = new Map();
  const dirty = new Set();
  try {
    const scope = path.relative(rootDir, scopeDir).replace(/\\/g, '/') || '.';
    // A depth-1 checkout treats the single commit as a parentless root, so `--name-only` attributes the
    // entire tree to it and the freshness lens goes flat. CI must use `fetch-depth: 0`.
    if (isShallowRepository(rootDir)) {
      console.warn(
        '[docs-vault] shallow git clone: every document date collapses to the same day. Check out full history (CI: fetch-depth: 0).',
      );
    }
    const log = execSync(`git log --format=%x01%cs --name-only -- "${scope}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let currentDay = null;
    for (const line of log.split('\n')) {
      if (line.startsWith('\x01')) {
        currentDay = line.slice(1).trim();
        continue;
      }
      const file = line.trim();
      if (!file || !currentDay) continue;
      if (!days.has(file)) days.set(file, currentDay);
      commits.set(file, (commits.get(file) ?? 0) + 1);
    }
    const status = execSync(`git status --porcelain -- "${scope}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of status.split('\n')) {
      // A staged rename reads `old -> new`; the document now lives at the new path.
      const file = line.slice(3).trim().split(' -> ').pop();
      if (file) dirty.add(file);
    }
  } catch {
    // No git, or not a repository (a release tarball) — fall back to the mtime date.
  }
  return { days, commits, dirty };
}

/**
 * A document's revision: the commits that touched its path, plus those that touched
 * the path it had before a move (`docs/.moved.json`), plus one while it has
 * uncommitted edits — so the number a pre-commit build writes is the number the
 * commit then makes true. Git is the counter; two branches never edit one line.
 */
export function documentRevision(relPath, { commits, dirty }, movedFrom = {}) {
  let count = commits.get(relPath) ?? 0;
  let former = movedFrom[relPath];
  const seen = new Set([relPath]);
  while (former && !seen.has(former)) {
    seen.add(former);
    count += commits.get(former) ?? 0;
    former = movedFrom[former];
  }
  return count + (dirty.has(relPath) ? 1 : 0);
}

/**
 * `YYYY-MM-DD` in the local timezone, matching `%cs` (the commit's own timezone): truncating in UTC
 * would record a KST-morning edit as "yesterday". Used only for dirty or untracked documents, so the
 * machine-timezone dependence stays in the author's working tree.
 */
export function localDayStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function latestInputDay(inputs, rootDir, gitDays) {
  const days = [];
  for (const relativePath of inputs) {
    const committedDay = gitDays.dirty.has(relativePath)
      ? null
      : gitDays.days.get(relativePath);
    if (committedDay) {
      days.push(committedDay);
      continue;
    }
    try {
      const inputStat = await stat(path.join(rootDir, relativePath));
      const day = localDayStamp(inputStat.mtime);
      if (day) days.push(day);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return days.length > 0 ? days.reduce((left, right) => left >= right ? left : right) : null;
}
