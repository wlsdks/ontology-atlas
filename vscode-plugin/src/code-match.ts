import * as path from 'path';
import { VaultNode } from './walk-vault';

/**
 * Find the best vault node match for a given file path.
 *
 * Match sources, in priority order:
 *   0. **Self-match (R13 #54)** — if the active file IS the ontology
 *      `.md` itself (e.g. `docs/ontology/elements/sigma-graphology.md`),
 *      return that node directly. Highest priority — when the user is
 *      reading the ontology directly, that's exactly what the plugin
 *      should surface (and the Backlinks panel can show who points to it).
 *   1. Element nodes whose `path:` frontmatter exactly equals the file's
 *      workspace-relative path (e.g. `path: package.json` matches
 *      `<workspace>/package.json`).
 *   2. Element nodes whose `path:` is a directory ancestor of the file
 *      (e.g. `path: src/features/docs-vault-local` matches anything
 *      under that directory).
 *   3. Capability nodes whose `elements: [...]` array contains the
 *      workspace-relative path (e.g. `elements: [src/views/foo/bar.tsx]`).
 *
 * Returns the longest-matching node so that more-specific node wins when
 * multiple match (e.g. file `src/features/docs-vault-local/lib/foo.ts`
 * picks the element with `path: src/features/docs-vault-local` over a
 * capability that lists the whole feature folder).
 *
 * Returns `null` when no node owns the file. That's fine — most files in
 * a real codebase are unlabeled.
 */
export function findOntologyMatch(
  workspaceRoot: string,
  absoluteFilePath: string,
  nodes: ReadonlyArray<VaultNode>,
): VaultNode | null {
  // R13 #54 — self-match: the active file IS an ontology node's .md.
  // Highest priority because the user is literally looking at the node.
  for (const node of nodes) {
    if (samePath(node.filePath, absoluteFilePath)) {
      return node;
    }
  }

  const rel = relativeForwardSlash(workspaceRoot, absoluteFilePath);
  if (!rel || rel.startsWith('..')) return null;

  const candidates: Array<{ node: VaultNode; score: number }> = [];

  for (const node of nodes) {
    if (node.path) {
      if (rel === node.path) {
        candidates.push({ node, score: 1_000_000 });
        continue;
      }
      if (isInside(rel, node.path)) {
        candidates.push({ node, score: node.path.length });
      }
    }
    if (node.elements && Array.isArray(node.elements)) {
      for (const el of node.elements) {
        if (typeof el !== 'string') continue;
        if (el === rel) {
          candidates.push({ node, score: 999_999 });
        } else if (isInside(rel, el)) {
          // capability.elements[] can list a folder too
          candidates.push({ node, score: el.length });
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].node;
}

function samePath(a: string, b: string): boolean {
  // Defensive: VSCode sometimes hands paths with mixed separators or
  // resolved symlinks. Normalize both before comparison.
  return path.resolve(a) === path.resolve(b);
}

function relativeForwardSlash(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

function isInside(filePath: string, dirPath: string): boolean {
  if (!dirPath) return false;
  const normalized = dirPath.endsWith('/') ? dirPath : dirPath + '/';
  return filePath.startsWith(normalized);
}
