// R+ — commit preflight (`ontology-atlas preflight`) 매칭 로직.
//
// vault 노드 frontmatter 는 두 field 로 source 파일을 가리킨다:
//   - `path:` (element) — 단일 source-file path
//   - `elements:` (capability) — source path 목록 (OR ontology slug 참조)
// `mcp/src/detect-drift.mjs` 가 이 규약을 정방향(노드→경로가 fs 에 존재하는지)
// 으로 쓰는 반면, 여기서는 반대 방향 — git 이 바꾼 파일 목록을 받아 그 경로를
// 참조하는 vault 노드를 찾는다. cli 는 별도 publish package라 mcp/src 를
// 직접 import 하지 않고(모노레포 dev 상대 경로가 항상 있는 게 아님) 같은
// looksLikePath/isOntologySlug 판정만 소규모로 mirror한다 — 값을 바꾸면
// mcp/src/detect-drift.mjs 쪽도 함께 확인할 것.

const ONTOLOGY_SLUG_PREFIXES = ['capabilities/', 'domains/', 'elements/', 'documents/'];

function looksLikePath(value) {
  return (
    value.includes('/') ||
    value.endsWith('.ts') ||
    value.endsWith('.js') ||
    value.endsWith('.mjs') ||
    value.endsWith('.tsx') ||
    value.endsWith('.json')
  );
}

function isOntologySlug(value) {
  return ONTOLOGY_SLUG_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function normalizePath(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

// changed 파일이 entry 파일과 정확히 같거나, entry 가 changed 를 담는
// 디렉터리 경로일 때 매칭 (entry 가 디렉터리를 frontmatter 에 적어둔 경우).
function pathMatches(changedFile, entryPath) {
  const changed = normalizePath(changedFile);
  const entry = normalizePath(entryPath);
  if (!changed || !entry) return false;
  return changed === entry || changed.startsWith(`${entry}/`);
}

/**
 * @param {Array<{slug: string, frontmatter: Record<string, unknown>}>} docs
 * @param {string[]} changedFiles  repo-relative changed file paths
 * @returns {Array<{slug: string, kind: string, title: string, domain: string, matchedFiles: string[]}>}
 *   sorted by slug, each with the deduped/sorted list of changed files it references.
 */
export function matchChangedFilesToVaultNodes(docs, changedFiles) {
  const changed = Array.isArray(changedFiles)
    ? changedFiles.map(normalizePath).filter(Boolean)
    : [];
  if (changed.length === 0 || !Array.isArray(docs)) return [];

  const matches = [];
  for (const doc of docs) {
    const fm = doc?.frontmatter ?? {};
    const kind = typeof fm.kind === 'string' ? fm.kind.trim() : '';
    if (!kind) continue;

    const matchedFiles = new Set();

    if (typeof fm.path === 'string' && fm.path.trim()) {
      for (const cf of changed) {
        if (pathMatches(cf, fm.path)) matchedFiles.add(cf);
      }
    }

    if (Array.isArray(fm.elements)) {
      for (const el of fm.elements) {
        if (typeof el !== 'string') continue;
        const entry = el.trim();
        if (!entry || !looksLikePath(entry) || isOntologySlug(entry)) continue;
        for (const cf of changed) {
          if (pathMatches(cf, entry)) matchedFiles.add(cf);
        }
      }
    }

    if (matchedFiles.size > 0) {
      matches.push({
        slug: String(doc.slug ?? '').trim(),
        kind,
        title:
          (typeof fm.title === 'string' && fm.title.trim()) ||
          (typeof fm.name === 'string' && fm.name.trim()) ||
          String(doc.slug ?? ''),
        domain: typeof fm.domain === 'string' ? fm.domain : '',
        matchedFiles: [...matchedFiles].sort(),
      });
    }
  }

  matches.sort((a, b) => a.slug.localeCompare(b.slug));
  return matches;
}
