import { writeFileSync, mkdirSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { buildMarkdown, parseFrontmatter } from './parse-frontmatter.mjs';
import { flatSlugIssue, inspectMergedUids, nodeUidIssue } from './schema.mjs';
import { walkMd, pathToSlug } from './walk-vault.mjs';

/**
 * vault-relative slug → file path. AI agent / prompt injection 으로 악의적인
 * slug ('../../etc/passwd' 등) 가 들어와도 vault root 바깥의 파일을 가리키지
 * 못하도록 normalize 후 root 포함 검사. mcp/src/vault.mjs 의 slugToPath 와
 * 같은 contract.
 */
export function slugToPath(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error('slug must be a non-empty string');
  }
  if (slug.includes('\0')) {
    throw new Error('slug must not contain a null byte');
  }
  const candidate = resolve(rootPath, `${slug}.md`);
  const normalizedRoot = resolve(rootPath);
  if (
    candidate !== normalizedRoot &&
    !candidate.startsWith(normalizedRoot + sep)
  ) {
    throw new Error(`slug points outside the vault root: "${slug}"`);
  }
  // 문자열 검사만으로는 심볼릭 링크를 못 막는다 — `mcp/src/vault.mjs` 와 같은
  // 계약. 실측(2026-07-29): vault 안 `escape.md` 가 밖을 가리키면 문자열은
  // 완벽히 root 안인데 `writeFileSync` 가 링크를 따라 **밖에 썼고**, 성공 줄은
  // vault 안 경로를 보고했다.
  assertRealPathInside(candidate, normalizedRoot, slug);
  return candidate;
}

/** 링크 해소 후에도 vault 안인지. 아직 없는 경로는 가장 가까운 존재 조상 기준. */
function assertRealPathInside(candidate, normalizedRoot, slug) {
  let realRoot;
  try {
    realRoot = realpathSync(normalizedRoot);
  } catch {
    return;
  }
  let probe = candidate;
  for (;;) {
    try {
      const real = realpathSync(probe);
      if (real !== realRoot && !real.startsWith(realRoot + sep)) {
        throw new Error(
          `slug resolves outside the vault root through a symlink: "${slug}"`,
        );
      }
      return;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('slug resolves outside')) throw error;
      const parent = dirname(probe);
      if (parent === probe) return;
      probe = parent;
    }
  }
}

/**
 * 새 doc 작성. 디렉토리 자동 생성. 기존 파일 있으면 throw (덮어쓰기 절대
 * 안 함 — 사용자 작업 보호). mcp/src/vault.mjs 의 writeDoc 와 같은 contract.
 */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = preflightWriteDoc(rootPath, slug, frontmatter);
  mkdirSync(dirname(filePath), { recursive: true });
  const md = buildMarkdown({ frontmatter, body });
  writeFileSync(filePath, md, 'utf-8');
  return filePath;
}

/** dry-run과 실제 write가 동일한 slug·UID 계약을 검사하는 단일 preflight. */
export function preflightWriteDoc(rootPath, slug, frontmatter) {
  const filePath = slugToPath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(`Doc already exists: ${slug}`);
  }
  const slugIssue = flatSlugIssue(frontmatter?.kind, slug);
  if (slugIssue) throw new Error(slugIssue);
  assertNodeIdentity(rootPath, slug, frontmatter);
  return filePath;
}

function identityClaims(frontmatter) {
  const primary = typeof frontmatter?.uid === 'string' ? frontmatter.uid : '';
  const merged = Array.isArray(frontmatter?.merged_uids) ? frontmatter.merged_uids : [];
  return [...new Set([primary, ...merged].filter(Boolean))];
}

function assertNodeIdentity(rootPath, slug, frontmatter) {
  const kind = frontmatter?.kind;
  if (typeof kind !== 'string' || !kind.trim()) return;
  const uidIssue = nodeUidIssue(frontmatter.uid);
  if (uidIssue) throw new Error(uidIssue);
  const merged = inspectMergedUids(frontmatter.uid, frontmatter.merged_uids);
  if (merged.invalidIssue) throw new Error(merged.invalidIssue);
  if (merged.nonCanonical) {
    throw new Error('`merged_uids:` must be a deduplicated, ascending canonical UUIDv4 set.');
  }
  const claims = new Set(identityClaims(frontmatter));
  for (const file of walkMd(rootPath)) {
    const existingSlug = pathToSlug(rootPath, file);
    if (existingSlug === slug) continue;
    const { frontmatter: existing } = parseFrontmatter(readFileSync(file, 'utf-8'));
    for (const claimed of identityClaims(existing)) {
      if (!claims.has(claimed)) continue;
      throw new Error(
        `UID collision: ${claimed} already belongs to "${existingSlug}". ` +
          'Create a new node with a fresh UID instead of copying an identity.',
      );
    }
  }
}

/**
 * 기존 doc 을 읽어 { filePath, frontmatter, body } 반환. 파일 없으면 throw.
 * patch 전 현재 상태 확인용 (R+ `relate` 커맨드).
 */
export function readDocFrontmatter(rootPath, slug) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}".`);
  }
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return { filePath, frontmatter, body };
}

/**
 * 기존 doc 의 frontmatter 한 key 만 교체 저장 (나머지 frontmatter + body 보존).
 * mcp/src/vault.mjs 의 patchFrontmatter 와 같은 "read → merge → rewrite" 계약
 * — CLI 는 mcp add_relation 을 spawn 하지 않고 자체 fs 로 직접 쓴다 (기존
 * `add`/`import` 커맨드와 같은 관례). R+ `relate` 커맨드가 사용.
 */
export function writeFrontmatterKey(rootPath, slug, key, value) {
  return writeFrontmatterKeys(rootPath, slug, { [key]: value });
}

/** 복수 키를 한 번의 파일 쓰기로: 관계+relation_notes 원자성 (P6 게이트 ③ CLI 측). */
export function writeFrontmatterKeys(rootPath, slug, patch) {
  const { filePath, frontmatter, body } = readDocFrontmatter(rootPath, slug);
  if ('uid' in patch && patch.uid !== frontmatter.uid) {
    throw new Error('`uid:` is immutable and cannot be changed by a generic frontmatter writer.');
  }
  if ('merged_uids' in patch) {
    throw new Error('`merged_uids:` is merge_concepts-owned identity history.');
  }
  const next = { ...frontmatter, ...patch };
  assertNodeIdentity(rootPath, slug, next);
  const md = buildMarkdown({ frontmatter: next, body });
  writeFileSync(filePath, md, 'utf-8');
  return filePath;
}

/**
 * relation array 값 정규화 — string 중복 제거 + locale 정렬, non-string 값
 * (레거시 object 항목 등) 은 그대로 뒤에 붙인다. mcp/src/vault.mjs 의
 * normalizeRelationRefs 와 같은 contract — `relate` 로 쓴 배열이 MCP
 * `add_relation` 이 쓴 배열과 같은 모양(정렬·중복제거)이 되도록.
 */
export function normalizeRelationRefs(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const refs = [];
  const passthrough = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      passthrough.push(value);
      continue;
    }
    const ref = value.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  refs.sort((a, b) => a.localeCompare(b, 'en'));
  return [...refs, ...passthrough];
}
