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

function runGit(root, args) {
  const result = spawnSync('git', hardenedGitArgv(root, args), {
    env: gitEnv(),
    maxBuffer: STATUS_MAX_BUFFER,
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
export function shareCounts(coverage) {
  if (!coverage) return { abilities: null, areas: null };
  return {
    abilities: { total: coverage.abilities, offMap: coverage.uncovered },
    areas: { total: coverage.counted, notMapped: coverage.notMapped.length },
  };
}

/**
 * Reads HEAD with one `git rev-parse` per count and `git status` only when HEAD
 * or a source file's size or time changed since the last count, since a status
 * walks the whole work tree. The vault's own folder never counts as a change.
 */
function createSourceStateReader() {
  let last = null;
  return function sourceState(root, stamps) {
    const head = runGit(root, ['rev-parse', '--show-toplevel', 'HEAD']);
    if (head === null) return { sourceCommit: null, sourceDirty: null };
    const [topLevel, commit] = head.toString('utf8').trim().split('\n');
    if (!/^[0-9a-f]{40,64}$/i.test(commit ?? '')) return { sourceCommit: null, sourceDirty: null };
    const key = `${commit}\0${stamps}`;
    if (last?.key === key) return last.state;
    let excluded = null;
    try {
      excluded = vaultFolderInside(realpathSync.native(topLevel), realpathSync.native(VAULT_ROOT));
    } catch {
      excluded = null;
    }
    const status = runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
    const state = { sourceCommit: commit.toLowerCase(), sourceDirty: status === null ? null : filterStatus(status, excluded).length > 0 };
    last = { key, state };
    return state;
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
 */
export function createMapAnalysisMeasure() {
  const sourceState = createSourceStateReader();
  return function measure(measured) {
    if (!REPO_ROOT_IS_GROUNDED) return NO_SOURCE;
    if (measured) return { ...sourceState(REPO_ROOT, stampsOf(measured.collection)), ...shareCounts(measured.coverage) };
    const repo = repositorySurvey(REPO_ROOT, VAULT_ROOT);
    const coverage = repo
      ? areaCoverage(loadVaultDocs(VAULT_ROOT), repo.survey, { collection: repo.collection, repoRoot: repo.repoRoot, reads: sessionReads(REPO_ROOT) })
      : null;
    return { ...sourceState(REPO_ROOT, stampsOf(repo?.collection)), ...shareCounts(coverage) };
  };
}
