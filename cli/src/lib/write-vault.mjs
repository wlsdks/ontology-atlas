import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { buildMarkdown, parseFrontmatter } from './parse-frontmatter.mjs';

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
  return candidate;
}

/**
 * 새 doc 작성. 디렉토리 자동 생성. 기존 파일 있으면 throw (덮어쓰기 절대
 * 안 함 — 사용자 작업 보호). mcp/src/vault.mjs 의 writeDoc 와 같은 contract.
 */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = slugToPath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(`Doc already exists: ${slug}`);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  const md = buildMarkdown({ frontmatter, body });
  writeFileSync(filePath, md, 'utf-8');
  return filePath;
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
  const { filePath, frontmatter, body } = readDocFrontmatter(rootPath, slug);
  const next = { ...frontmatter, [key]: value };
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
