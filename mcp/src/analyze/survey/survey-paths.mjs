// Every path the repository survey reads or names comes from the repository:
// manifest fields, README names, doc folders. Each one is resolved here, so a
// symlink, a `..` segment, an absolute or drive path, a hidden name such as
// `.env`, or a credential-named file never reaches a read or a map row.

import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, posix } from 'node:path';

import { pathResolvesInsideRoot } from '../../infer-imports/path-confinement.mjs';
import { namesHiddenOrCredentialFile } from '../../evidence-search/source-evidence.mjs';

const KEY_FILE = /\.(?:pem|key|p12|pfx|jks|keystore)$/i;

/**
 * The repository-relative `/` form of `path`, or null when it could point
 * outside the root or at a private file. Backslashes count as separators so a
 * Windows manifest path gets the same checks.
 */
export function surveyRelativePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) return null;
  const slashed = path.replace(/\\/g, '/');
  if (slashed.startsWith('/') || /^[A-Za-z]:/.test(slashed) || isAbsolute(path)) return null;
  if (slashed.split('/').includes('..')) return null;
  const normal = posix.normalize(slashed).replace(/^\.\//, '').replace(/\/$/, '');
  if (!normal || normal === '.') return null;
  if (namesHiddenOrCredentialFile(normal) || normal.split('/').some((part) => KEY_FILE.test(part))) return null;
  return normal;
}

/** Whether `path` names a file or folder inside the root: no symlink on the way, and the real path stays inside. */
export function surveyEntry(rootPath, path, kind = 'file') {
  const normal = surveyRelativePath(path);
  if (!normal) return null;
  let cursor = rootPath;
  try {
    let stat;
    for (const part of normal.split('/')) {
      cursor = join(cursor, part);
      stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) return null;
    }
    if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) return null;
  } catch {
    return null;
  }
  return pathResolvesInsideRoot(rootPath, cursor) ? normal : null;
}

/** The text of a confined file, cut to `limit` characters; '' when the path is refused or unreadable. */
export function readSurveyText(rootPath, path, limit) {
  const normal = surveyEntry(rootPath, path);
  if (!normal) return '';
  try {
    const text = readFileSync(join(rootPath, normal), 'utf8');
    return text.length > limit ? text.slice(0, limit) : text;
  } catch {
    return '';
  }
}
