// detect-drift — Atlas roadmap Track A #2 (planner team 2026-05-31).
//
// A vault node's frontmatter can point at source files:
//   - `path:` (string)       — an element's source-file path
//   - `elements:` (string[]) — a capability's owned source paths (OR ontology slugs)
// When the agent moves/renames/deletes code, those references go stale — the
// vault memory layer silently rots. scripts/audit-vault-paths.mjs already had
// this check as a build-time CLI gate; this is the SHARED pure core so the
// agent can also ask it mid-task (via validate_vault). Read-only — reports
// drift, never edits. fileExists is injectable so the logic is testable without
// touching the real filesystem (the audit script + the MCP tool pass existsSync).

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const ONTOLOGY_SLUG_PREFIXES = ['capabilities/', 'domains/', 'elements/', 'documents/'];

// Only flag `elements:` entries that LOOK like a source path (contain `/` or a
// code extension) AND aren't ontology slugs — so cross-reference slugs like
// "vault-validator" or "capabilities/x" never false-positive as missing files.
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
 * Detect vault→code path drift: frontmatter path:/elements: entries that no
 * longer exist on disk.
 *
 * @param {object} args
 * @param {Array<{slug?:string, frontmatter?:object}>} [args.docs]  parsed vault docs (e.g. loadVaultDocs())
 * @param {string} [args.repoRoot]  root the paths resolve against (default cwd)
 * @param {(absPath:string)=>boolean} [args.fileExists]  injectable existence check (default existsSync)
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

  // Compared field by field, in the **same order** as the old NUL-joined
  // comparison (NUL sorts below every character, so the earlier field decides
  // first) — but without making the file binary to git. One NUL is enough to hide
  // the diff in a PR and make grep/ripgrep skip the file entirely (review 2026-08-08).
  drifts.sort(
    (a, b) =>
      a.slug.localeCompare(b.slug) ||
      a.key.localeCompare(b.key) ||
      a.missingPath.localeCompare(b.missingPath),
  );
  return { repoRoot, nodesScanned, pathsChecked, drifts };
}

/**
 * Atlas roadmap Track A #3 — reconcile suggestion. A drifted path (file missing)
 * is usually a MOVE: the agent renamed/relocated the source file but the vault
 * node still points at the old path. When EXACTLY ONE existing repo source file
 * shares the drifted file's basename, surface it as a one-step reconcile target
 * (`suggestedPath`) so fixing the drift is "did you mean X?" instead of a hunt.
 *
 * Conservative by design — the failure mode is a *misleading* suggestion, so:
 *   - 0 matches  → no suggestion (left as plain drift)
 *   - >1 matches → no suggestion (ambiguous basenames like `index.ts` never guess)
 * Pure: `repoFiles` is the caller's enumeration (repo-relative existing source
 * paths), so the lookup is fully testable without touching the filesystem.
 *
 * @param {Array<{slug:string,kind:string,key:string,missingPath:string}>} drifts
 * @param {string[]} repoFiles  repo-relative source paths that DO exist on disk
 * @returns {Array} the same drifts, each optionally annotated with { suggestedPath }
 */
export function suggestPathReconciliations(drifts = [], repoFiles = []) {
  if (!Array.isArray(drifts) || drifts.length === 0) return drifts;
  if (!Array.isArray(repoFiles) || repoFiles.length === 0) return drifts;

  // basename → list of existing repo paths that carry it
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
    // unique match only — and never "suggest" the same path that is missing
    if (matches && matches.length === 1 && matches[0] !== missing) {
      return { ...d, suggestedPath: matches[0] };
    }
    return d;
  });
}
