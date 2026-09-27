// Vault → code path drift: `path:` (a source file) and path-shaped `elements:`
// entries that no longer exist once code moves. The shared pure core behind
// scripts/audit-vault-paths.mjs and validate_vault; read-only,
// and `fileExists` is injectable.

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const ONTOLOGY_SLUG_PREFIXES = ['capabilities/', 'domains/', 'elements/', 'documents/'];

// Only entries that look like a source path (a `/` or a code extension) and are
// not ontology slugs, so "capabilities/x" never reads as a missing file.
function looksLikePath(s) {
  return (
    s.includes('/') ||
    s.endsWith('.ts') ||
    s.endsWith('.js') ||
    s.endsWith('.mjs') ||
    s.endsWith('.tsx') ||
    s.endsWith('.json')
  );
}
function isOntologySlug(s) {
  return ONTOLOGY_SLUG_PREFIXES.some((prefix) => s.startsWith(prefix));
}

/**
 * @param {object} args
 * @param {Array<{slug?:string, frontmatter?:object}>} [args.docs]  parsed vault docs (e.g. loadVaultDocs())
 * @param {string} [args.repoRoot]  root the paths resolve against (default cwd)
 * @param {(absPath:string)=>boolean} [args.fileExists]  default existsSync
 * @returns {{repoRoot:string, nodesScanned:number, pathsChecked:number, drifts:Array<{slug:string,kind:string,key:string,missingPath:string}>}}
 */
export function detectVaultPathDrift({ docs = [], repoRoot = process.cwd(), fileExists = existsSync } = {}) {
  const drifts = [];
  let nodesScanned = 0;
  let pathsChecked = 0;

  for (const doc of docs) {
    const fm = doc?.frontmatter ?? {};
    const kind = String(fm.kind ?? '').trim();
    if (!kind) continue;
    const slug = String(fm.slug ?? '').trim() || String(doc?.slug ?? '').trim() || '';
    nodesScanned += 1;

    if (typeof fm.path === 'string' && fm.path.trim()) {
      pathsChecked += 1;
      if (!fileExists(resolve(repoRoot, fm.path.trim()))) {
        drifts.push({ slug, kind, key: 'path', missingPath: fm.path });
      }
    }

    if (Array.isArray(fm.elements)) {
      for (const el of fm.elements) {
        if (typeof el !== 'string') continue;
        if (!looksLikePath(el) || isOntologySlug(el)) continue;
        pathsChecked += 1;
        if (!fileExists(resolve(repoRoot, el))) {
          drifts.push({ slug, kind, key: 'elements[]', missingPath: el });
        }
      }
    }
  }

  // Field by field in the order a NUL-joined key would sort, without a NUL: one NUL
  // makes git treat the file as binary and hides its diff.
  drifts.sort(
    (a, b) =>
      a.slug.localeCompare(b.slug) ||
      a.key.localeCompare(b.key) ||
      a.missingPath.localeCompare(b.missingPath),
  );
  return { repoRoot, nodesScanned, pathsChecked, drifts };
}

/**
 * A drifted path is usually a move: when exactly one existing source file shares
 * its basename, it is offered as `suggestedPath`. Zero or several matches
 * (`index.ts`) suggest nothing, since a misleading suggestion is the failure.
 * Pure: `repoFiles` are the caller's repo-relative existing paths.
 *
 * @param {Array<{slug:string,kind:string,key:string,missingPath:string}>} drifts
 * @param {string[]} repoFiles  repo-relative source paths that exist on disk
 * @returns {Array} the same drifts, each optionally annotated with { suggestedPath }
 */
export function suggestPathReconciliations(drifts = [], repoFiles = []) {
  if (!Array.isArray(drifts) || drifts.length === 0) return drifts;
  if (!Array.isArray(repoFiles) || repoFiles.length === 0) return drifts;

  const byBase = new Map();
  for (const f of repoFiles) {
    if (typeof f !== 'string' || !f) continue;
    const base = basename(f);
    const arr = byBase.get(base);
    if (arr) arr.push(f);
    else byBase.set(base, [f]);
  }

  return drifts.map((d) => {
    const missing = typeof d?.missingPath === 'string' ? d.missingPath : '';
    if (!missing) return d;
    const matches = byBase.get(basename(missing));
    // Unique match only, and never the missing path itself.
    if (matches && matches.length === 1 && matches[0] !== missing) {
      return { ...d, suggestedPath: matches[0] };
    }
    return d;
  });
}
