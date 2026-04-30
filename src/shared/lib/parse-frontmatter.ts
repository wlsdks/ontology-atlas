// 가벼운 frontmatter 파서 — `---\n...\n---\n` 블록만 지원.
// gray-matter 의존 없이 key:value 만. tags: [a, b] 형태 인라인 배열도 지원.
// scripts/build-docs-vault.mjs 와 같은 규칙이지만 TS/브라우저 호환.

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter: Record<string, unknown> = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { frontmatter, body };
}

export function firstHeading(body: string): string | null {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

export interface HeadingInfo {
  depth: number;
  text: string;
  slug: string;
}

export function extractHeadings(body: string): HeadingInfo[] {
  const lines = body.split('\n');
  const out: HeadingInfo[] = [];
  const seen = new Map<string, number>();
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].trim();
    const slug = text
      .toLowerCase()
      .replace(/[^\w가-힣\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const occurrence = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, occurrence);
    out.push({
      depth,
      text,
      slug: occurrence === 1 ? slug : `${slug}-${occurrence}`,
    });
  }
  return out;
}

export function buildExcerpt(body: string, max = 320): string {
  const stripped = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, max);
}

export interface LinkContext {
  /** vault 내부 다른 문서의 slug (이 함수가 resolve) */
  target: string;
  /** 링크 앞뒤 120자 컨텍스트. **[linkText]** 로 위치 마킹. */
  context: string;
  linkText: string;
}

/**
 * 마크다운 본문에서 상대 경로 md 참조를 추출해 target slug + 주변 context
 * 로 반환. http(s)/앵커/이미지는 무시. fromSlug 는 현재 문서의 vault slug
 * (디렉터리 포함, 확장자 제외).
 */
export function extractOutLinksWithContext(
  body: string,
  fromSlug: string,
): { slugs: string[]; contexts: LinkContext[] } {
  const slugs = new Set<string>();
  const contexts: LinkContext[] = [];
  // 표준 markdown 링크 [text](path.md)
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const target = m[2];
    const linkText = m[1];
    if (!target || target.startsWith('#')) continue;
    if (/^https?:\/\//i.test(target)) continue;
    if (!target.endsWith('.md') && !target.includes('.md#')) continue;
    const [mdPart] = target.split('#');
    const rel = mdPart.replace(/^\.\//, '');
    const fromDir = fromSlug.includes('/')
      ? fromSlug.slice(0, fromSlug.lastIndexOf('/'))
      : '';
    const joined = fromDir ? `${fromDir}/${rel}` : rel;
    const parts = joined.split('/');
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') {
        stack.pop();
        continue;
      }
      stack.push(p);
    }
    const targetSlug = stack.join('/').replace(/\.md$/, '');
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  // Wikilinks [[slug]] / [[slug|text]] / [[slug#anchor]] — vault 루트 기준 slug.
  const wre = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  while ((m = wre.exec(body)) !== null) {
    const targetSpec = m[1].trim();
    const [targetSlug] = targetSpec.split('#');
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const linkText = (m[2] ?? targetSlug).trim();
    const matchStart = m.index;
    const matchEnd = m.index + m[0].length;
    const before = body.slice(Math.max(0, matchStart - 120), matchStart);
    const after = body.slice(matchEnd, matchEnd + 120);
    const raw = `${before}**[${linkText}]**${after}`;
    const context = raw.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    contexts.push({ target: targetSlug, context, linkText });
  }
  return { slugs: [...slugs], contexts };
}

export function classifyMode(slug: string): 'planner' | 'engineer' | 'both' {
  if (
    slug === 'DESIGN-SYSTEM' ||
    slug === 'ADMIN-GUIDE' ||
    slug === 'CHANGELOG'
  ) {
    return 'both';
  }
  if (
    slug.startsWith('superpowers/specs/') ||
    slug.startsWith('superpowers/plans/') ||
    slug.startsWith('superpowers/notes/') ||
    slug.startsWith('charters/')
  ) {
    return 'planner';
  }
  if (
    slug === 'ARCHITECTURE' ||
    slug === 'DATA-MODEL' ||
    slug === 'DEPLOYMENT' ||
    slug === 'SEED-DATA' ||
    slug.startsWith('rules/')
  ) {
    return 'engineer';
  }
  return 'both';
}
