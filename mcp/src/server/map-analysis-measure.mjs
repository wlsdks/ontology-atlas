/**
 * The counts one map analysis line carries: the share of abilities on the map as
 * validate_vault measures it, and the code's HEAD and whether it had uncommitted
 * changes at that count. Counts only: no path, name or code leaves this module.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

import { repositorySurvey } from '../construction/build-depth.mjs';
import { areaCoverage } from '../construction/build-depth/unmapped-areas.mjs';
import { sessionReads } from '../construction/session-reads.mjs';
import { gitEnv, hardenedGitArgv } from '../git/hardened-git.mjs';
import { filterStatus, vaultFolderInside } from '../project-source/project-source-inspection.mjs';
import { loadVaultDocs } from '../vault/documents/document-cache.mjs';
import { REPO_ROOT, REPO_ROOT_IS_GROUNDED, VAULT_ROOT } from './runtime.mjs';

const NO_SOURCE = Object.freeze({ sourceCommit: null, sourceDirty: null, abilities: null, areas: null });
const STATUS_MAX_BUFFER = 16 * 1024 * 1024;
/** A git call that takes longer leaves the commit or the dirty flag unknown rather than hold the write. */
const GIT_TIMEOUT_MS = 5_000;
/**
 * Writes this close together reuse one walk of the code and one HEAD read: an
 * agent patches concepts seconds apart, and code edited inside the window is
 * counted by the next write after it.
 */
export const MEASURE_REUSE_MS = 30_000;

function runGit(root, args) {
  let argv;
  try {
    argv = hardenedGitArgv(root, ['--no-optional-locks', ...args]);
  } catch {
    return null;
  }
  const result = spawnSync('git', argv, {
    env: gitEnv(),
    maxBuffer: STATUS_MAX_BUFFER,
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout : null;
}

/** A write tool that already measured the share hands it over here, so the write walks the code once. */
export const MEASURED_COVERAGE = Symbol('measuredCoverage');

/**
 * The share's counts in the record's shape; null coverage (no surveyed units)
 * gives null counts.
 */
function shareCounts(coverage) {
  if (!coverage) return { abilities: null, areas: null };
  return {
    abilities: { total: coverage.abilities, offMap: coverage.uncovered },
    areas: { total: coverage.counted, notMapped: coverage.notMapped.length },
  };
}

function stampsOf(collection) {
  const hash = createHash('sha256');
  for (const file of collection?.files ?? []) hash.update(`${file.path}\0${file.size}\0${file.mtimeMs}\n`);
  return hash.digest('hex');
}

/**
 * The counts for a line now, measured against the grounded repository exactly as
 * validate_vault measures them; `measured` (`{ coverage, collection }`) is what the
 * write itself took, when it took one. Null counts when no repository is grounded.
 * The code is walked, HEAD read and `git status` run at most once per
 * `MEASURE_REUSE_MS`, status sooner when HEAD or a walked file changed; status
 * covers the connected folder only, the vault's own folder left out.
 */
export function createMapAnalysisMeasure({
  repoRoot = REPO_ROOT,
  vaultRoot = VAULT_ROOT,
  grounded = REPO_ROOT_IS_GROUNDED,
  survey = repositorySurvey,
  git = runGit,
  now = () => Date.now(),
} = {}) {
  let walked = null;
  let head = null;
  let status = null;

  function surveyNow(atMs) {
    if (walked && atMs - walked.atMs < MEASURE_REUSE_MS) return walked.repo;
    walked = { atMs, repo: survey(repoRoot, vaultRoot) };
    return walked.repo;
  }

  function headNow(atMs) {
    if (head && atMs - head.atMs < MEASURE_REUSE_MS) return head.value;
    const output = git(repoRoot, ['rev-parse', '--show-toplevel', 'HEAD']);
    const [topLevel, commit] = output === null ? [] : output.toString('utf8').trim().split('\n');
    const value = /^[0-9a-f]{40,64}$/i.test(commit ?? '') ? { topLevel, commit: commit.toLowerCase() } : null;
    head = { atMs, value };
    return value;
  }

  function sourceState(atMs, stamps) {
    const current = headNow(atMs);
    if (!current) return { sourceCommit: null, sourceDirty: null };
    const key = `${current.commit}\0${stamps}`;
    // Files the walk never collects (a README, a config, an untracked file) change no stamp.
    if (status?.key === key && atMs - status.atMs < MEASURE_REUSE_MS) return status.state;
    let excluded = null;
    try {
      excluded = vaultFolderInside(realpathSync.native(current.topLevel), realpathSync.native(vaultRoot));
    } catch {
      excluded = null;
    }
    const output = git(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--', '.']);
    const state = { sourceCommit: current.commit, sourceDirty: output === null ? null : filterStatus(output, excluded).length > 0 };
    status = { key, state, atMs };
    return state;
  }

  return function measure(measured) {
    if (!grounded) return NO_SOURCE;
    const atMs = now();
    if (measured) return { ...sourceState(atMs, stampsOf(measured.collection)), ...shareCounts(measured.coverage) };
    const repo = surveyNow(atMs);
    const coverage = repo
      ? areaCoverage(loadVaultDocs(vaultRoot), repo.survey, { collection: repo.collection, repoRoot: repo.repoRoot, reads: sessionReads(repoRoot) })
      : null;
    return { ...sourceState(atMs, stampsOf(repo?.collection)), ...shareCounts(coverage) };
  };
}
