import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { findGitRoot, inspectGitState } from './project-source-git-state.mjs';
import { inspectFolderState } from './project-source-folder-state.mjs';
import { excludedVaultFolder } from './project-source-vault-exclusion.mjs';

const ZERO = Buffer.from([0]);

function sourceDigest(parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update(ZERO);
  }
  return `sha256:${hash.digest('hex')}`;
}

function inspectRepository(gitRoot, excluded) {
  const state = inspectGitState(gitRoot, excluded);
  return {
    rootPath: gitRoot,
    sourceId: sourceDigest(['git', gitRoot]),
    kind: 'git',
    revision: state.revision,
    fingerprint: state.fingerprint,
    dirty: state.dirty,
    truncated: state.truncated,
    files: state.files,
  };
}

function inspectFolder(root, excluded) {
  const state = inspectFolderState(root, excluded);
  return {
    rootPath: root,
    sourceId: sourceDigest(['folder', root]),
    kind: 'folder',
    revision: state.fingerprint,
    fingerprint: state.fingerprint,
    dirty: null,
    truncated: state.truncated,
    files: state.files,
  };
}

/**
 * The source a project's code lives in, as one fingerprint a later call can compare: a
 * repository answers from its index and its changes, any other folder from one walk of sizes
 * and times. With `excludePath` naming a vault inside the source, the probe leaves that
 * folder out and reports `vaultExcluded`. No file count bounds it.
 */
export function inspectProjectSource(rootPath, { excludePath } = {}) {
  const root = realpathSync(rootPath);
  if (!statSync(root).isDirectory()) throw new Error('project source root must be a directory');
  const gitRoot = findGitRoot(root);
  const excluded = excludedVaultFolder(gitRoot ?? root, excludePath);
  const probe = gitRoot ? inspectRepository(gitRoot, excluded) : inspectFolder(root, excluded);
  return excluded === null ? probe : { ...probe, vaultExcluded: excluded };
}
