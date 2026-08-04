/**
 * Project source discovery — the filesystem half of the inference.
 *
 * Node-only. Collects the candidate roots that `project-source-inference.mjs`
 * ranks. The walk is bounded (`PROJECT_SOURCE_MAX_ANCESTOR_DEPTH`) and it never
 * nominates the filesystem root or the user's home directory: a source binding
 * that wide would make every later measurement meaningless and is far more
 * likely to be an accident than an intent.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse, resolve, sep } from 'node:path';

import {
  PROJECT_SOURCE_MANIFEST_FILES,
  PROJECT_SOURCE_MAX_ANCESTOR_DEPTH,
  inferProjectSourceProposal,
} from './project-source-inference.mjs';

function canonical(path) {
  try {
    const resolved = realpathSync(resolve(path));
    return statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function isAncestorOrSelf(ancestor, descendant) {
  return descendant === ancestor || descendant.startsWith(ancestor.endsWith(sep) ? ancestor : ancestor + sep);
}

function ancestorDepth(candidateRoot, vaultRoot) {
  if (candidateRoot === vaultRoot) return 0;
  const suffix = vaultRoot.slice(candidateRoot.endsWith(sep) ? candidateRoot.length : candidateRoot.length + 1);
  return suffix.split(sep).filter(Boolean).length;
}

/** Directories that must never become a project source root. */
function isForbiddenRoot(path) {
  let home = null;
  try {
    home = canonical(homedir());
  } catch {
    home = null;
  }
  return path === parse(path).root || (home !== null && path === home);
}

function gitRoot(vaultRoot) {
  try {
    const found = execFileSync('git', ['-C', vaultRoot, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return found ? canonical(found) : null;
  } catch {
    return null;
  }
}

function manifestsAt(path) {
  return PROJECT_SOURCE_MANIFEST_FILES.filter((name) => existsSync(join(path, name)));
}

/**
 * @param {string} vaultRootPath vault root (the folder holding the .md nodes)
 * @returns {{vaultRootPath: string|null, candidates: Array<object>}}
 */
export function collectProjectSourceCandidates(vaultRootPath) {
  const vaultRoot = canonical(vaultRootPath);
  if (!vaultRoot) return { vaultRootPath: null, candidates: [] };

  const candidates = [];
  const seen = new Set();
  const add = (path, marker, kind, evidence) => {
    if (!path || seen.has(path) || isForbiddenRoot(path)) return;
    if (!isAncestorOrSelf(path, vaultRoot)) return;
    seen.add(path);
    candidates.push({
      rootPath: path,
      kind,
      marker,
      ancestorDepth: ancestorDepth(path, vaultRoot),
      evidence,
    });
  };

  add(gitRoot(vaultRoot), 'enclosing_git_repository', 'git', ['.git']);

  let cursor = vaultRoot;
  for (let depth = 0; depth <= PROJECT_SOURCE_MAX_ANCESTOR_DEPTH; depth += 1) {
    const manifests = manifestsAt(cursor);
    if (manifests.length > 0) add(cursor, 'ancestor_project_manifest', 'folder', manifests);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return { vaultRootPath: vaultRoot, candidates };
}

/**
 * One call for "which folder is this vault's code?", with no write and no
 * side effect. `witnessSummary` is optional — pass it after probing the
 * candidate to upgrade the confidence from a marker claim to measured support.
 */
export function inferProjectSourceRoot(vaultRootPath, witnessSummary = null) {
  const { vaultRootPath: vaultRoot, candidates } = collectProjectSourceCandidates(vaultRootPath);
  return inferProjectSourceProposal({ vaultRootPath: vaultRoot, candidates, witnessSummary });
}
