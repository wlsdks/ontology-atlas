// 가벼운 frontmatter 파서 — `---\n...\n---\n` 블록만 지원.
// gray-matter 의존 없이도 다음 형태 모두 인식:
//   key: value                          (scalar)
//   key: [a, b]                         (inline list)
//   key: { x: 1, y: 2 }                 (inline object — T16)
//   key:\n  - item1\n  - item2          (block list)
//   key:\n  child: 1\n  other: 2        (block object — T16)
// scripts/build-docs-vault.mjs 와 같은 규칙이지만 TS/브라우저 호환.

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

type ParsedScalar = string | number | boolean;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter: Record<string, unknown> = {};
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;

    if (value === '') {
      // block 모드 — 다음 줄이 `  -` 면 list, `  childKey:` 면 object.
      const lookahead = peekIndentedKind(lines, i + 1);
      if (lookahead === 'list') {
        const items: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const dashMatch = lines[j].match(/^\s+-\s+(.+)$/);
          if (!dashMatch) break;
          items.push(unquote(dashMatch[1].trim()));
          j += 1;
        }
        frontmatter[key] = items;
        i = j - 1;
        continue;
      }
      if (lookahead === 'object') {
        const obj: Record<string, ParsedScalar> = {};
        let j = i + 1;
        while (j < lines.length) {
          const m = lines[j].match(/^(\s+)([^\s:][^:]*):\s*(.*)$/);
          if (!m) break;
          const childKey = m[2].trim();
          const childValue = m[3].trim();
          if (!childKey) break;
          obj[childKey] = parseScalar(childValue);
          j += 1;
        }
        frontmatter[key] = obj;
        i = j - 1;
        continue;
      }
      frontmatter[key] = '';
      continue;
    }

    // inline 형태들
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = parseInlineList(value);
      continue;
    }
    if (value.startsWith('{') && value.endsWith('}')) {
      frontmatter[key] = parseInlineObject(value);
      continue;
    }
    frontmatter[key] = unquote(value);
  }
  return { frontmatter, body };
}

function peekIndentedKind(
  lines: string[],
  start: number,
): 'list' | 'object' | null {
  if (start >= lines.length) return null;
  const next = lines[start];
  if (/^\s+-\s+/.test(next)) return 'list';
  if (/^\s+[^\s:][^:]*:\s*\S?/.test(next)) return 'object';
  return null;
}

function parseInlineList(raw: string): string[] {
  return raw
    .slice(1, -1)
    .split(',')
    .map((s) => unquote(s.trim()))
    .filter(Boolean);
}

function parseInlineObject(raw: string): Record<string, ParsedScalar> {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return {};
  const out: Record<string, ParsedScalar> = {};
  // 단순 split — value 안 콤마/콜론은 지원하지 않는다 (충분히 자주 쓰는
  // x:1, y:2 같은 케이스만 인식).
  for (const part of inner.split(',')) {
    const cIdx = part.indexOf(':');
    if (cIdx === -1) continue;
    const k = part.slice(0, cIdx).trim();
    const v = part.slice(cIdx + 1).trim();
    if (!k) continue;
    out[k] = parseScalar(v);
  }
  return out;
}

function parseScalar(value: string): ParsedScalar {
  const v = unquote(value);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
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
  // Produce a readable prose preview. Markdown tables are the main hazard: a
  // raw excerpt of a table renders as a wall of `|` pipes (e.g.
  // "| 도구 | 동작 | --- | listconcepts |"), which is unreadable in the
  // node-detail panel. Strip table separator/hr rows and turn cell pipes into
  // middot separators so a table reads as "도구 · 동작 · listconcepts · …".
  const stripped = body
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/^#+\s.*$/gm, '') // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → link text
    .replace(/^[\s|:-]*-{2,}[\s|:-]*$/gm, '') // table separator / hr rows (| --- |, ---)
    .replace(/\s*\|\s*/g, ' · ') // table cell pipes → readable middot separators
    .replace(/^\s*[-•]\s+/gm, '') // list bullets
    .replace(/[*_`>#]/g, '') // residual emphasis / quote / heading marks
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/(?:·\s*){2,}/g, '· ') // collapse middot runs left by empty cells
    .replace(/^[\s·]+|[\s·]+$/g, '') // trim leading/trailing middots
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

