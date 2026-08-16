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
  diagnostics?: FrontmatterDiagnostic[];
}

export interface FrontmatterDiagnostic {
  code: "malformed-frontmatter-line";
  line: number;
  message: string;
}

type ParsedScalar = string | number | boolean;

export function parseFrontmatter(input: string): ParsedFrontmatter {
  // 줄바꿈·인코딩 정규화 — **읽기 경로에서만** (2026-07-28 실측).
  //
  // CRLF: 줄을 `\n` 으로 쪼개면 각 줄 끝에 `\r` 이 남는데, 블록 리스트
  // 정규식의 `.` 는 `\r` 을 안 먹고 `$` 는 문자열 끝만 본다 → 매치 실패 →
  // 리스트가 빈 배열. 스칼라는 `.trim()` 이 구제해서 살아남으므로, 증상이
  // **"노드는 보이는데 관계만 전부 사라진다"** 는 형태로 나타난다. 경고 0.
  //
  // BOM: `raw.startsWith('---')` 가 `\uFEFF---` 에서 false → frontmatter 블록
  // 전체가 본문으로 넘어가고 `kind:` 가 사라진다. 즉 **그 문서가 그래프에서
  // 노드 자체로 사라진다**.
  //
  // 둘 다 `surfaces.md` 가 명시 지원한다고 적은 인구(Windows Chromium)의
  // 기본 편집기가 만드는 것이다. 4-way 계약 테스트는 네 파서의 *일치*만
  // 보장하는데 **넷이 똑같이 틀려서** 통과하고 있었다.
  const raw = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter: Record<string, unknown> = {};
  const diagnostics: FrontmatterDiagnostic[] = [];
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) {
      const trimmed = line.trim();
      if (/^\s+-\s+/.test(line)) {
        diagnostics.push({
          code: 'malformed-frontmatter-line',
          line: i + 2,
          message: `Frontmatter list item on line ${i + 2} has no parent key.`,
        });
      } else if (trimmed && !trimmed.startsWith('#')) {
        diagnostics.push({
          code: 'malformed-frontmatter-line',
          line: i + 2,
          message: `Frontmatter line ${i + 2} must use key: value syntax.`,
        });
      }
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;

    // **블록 스칼라를 값 판정보다 먼저 본다.** `definition: |` 의 값은 빈
    // 문자열이 아니라 `"|"` 라, 빈 값 분기 안에 두면 절대 도달하지 않는다.
    const scalarIndicator = /^[|>][-+]?$/.exec(value);
    if (scalarIndicator) {
      const read = readBlockScalar(lines, i + 1, scalarIndicator[0]);
      frontmatter[key] = read.value;
      i = read.next - 1;
      continue;
    }
    if (value === '') {

      // block 모드 — 다음 줄이 `  -` 면 list, `  childKey:` 면 object.
      const lookahead = peekIndentedKind(lines, i + 1);
      if (lookahead === 'list') {
        const items: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const dashMatch = lines[j].match(/^\s*-\s+(.+)$/);
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
  const result: ParsedFrontmatter = { frontmatter, body };
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
}

function peekIndentedKind(
  lines: string[],
  start: number,
): 'list' | 'object' | null {
  if (start >= lines.length) return null;
  const next = lines[start];
  if (/^\s*-\s+/.test(next)) return 'list';
  if (/^\s+[^\s:][^:]*:\s*\S?/.test(next)) return 'object';
  return null;
}

function parseInlineList(raw: string): string[] {
  return splitTopLevel(raw.slice(1, -1), ',')
    .map((s) => unquote(s.trim()))
    .filter(Boolean);
}

function parseInlineObject(raw: string): Record<string, ParsedScalar> {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return {};
  const out: Record<string, ParsedScalar> = {};
  for (const part of splitTopLevel(inner, ',')) {
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
  const trimmed = value.trim();
  // 감싼 따옴표를 벗길 때만 **언이스케이프도 함께** 한다. serializer 가
  // `"` 를 이스케이프해 쓰는데 여기서 되돌리지 않으면, 저장할 때마다
  // 백슬래시가 한 겹씩 더 붙는다(실측 3회 왕복: 1개 → 2개 → 4개).
  // 인용부호 없는 값은 이스케이프 문법이 아니라 원문이므로 건드리지 않는다.
  const quote = trimmed.length >= 2 ? trimmed[0] : '';
  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    const inner = trimmed.slice(1, -1).replace(new RegExp(`\\\\(${quote}|\\\\)`, 'g'), '$1');
    /*
     * 큰따옴표 안의 `\n` 은 **줄바꿈이다** (2026-08-16).
     *
     * 쓰는 쪽이 줄바꿈을 그대로 내보내면 그 한 글자가 frontmatter 블록을
     * 통째로 부순다 — 다음 줄이 새 키로 읽히거나 `---` 를 만나 본문이 시작된다
     * (실측: `note⏎kind: element` 가 **노드의 종류를 바꿨다**). 그래서 쓰는
     * 쪽은 큰따옴표 안에 `\n` 으로 적고, 읽는 쪽인 여기서 되돌린다.
     *
     * 작은따옴표는 손대지 않는다 — YAML 에서 그건 이스케이프가 없는 문자열이다.
     */
    return quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : inner;
  }
  return value.replace(/^["']|["']$/g, '');
}

/**
 * 따옴표를 아는 구분자 분리 (2026-07-28 실측 수정).
 *
 * 종전에는 인라인 리스트/객체를 무조건 콤마로 쪼갰고, 주석이 그 한계를
 * "지원하지 않는다" 고 적어 두고 있었다. 그런데 값 안의 콤마는 **조용히
 * 데이터를 자른다** — `labels: { ko: "지도, 검색" }` 의 뒷조각이 사라진다.
 * 따옴표 안의 구분자는 데이터이지 구분자가 아니다.
 */
function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === '\\' && i + 1 < input.length) {
        current += ch + input[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === separator) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
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
  if (stripped.length <= max) return stripped;
  // 단어 중간에서 뚝 끊기지 않게: max 이내 마지막 공백에서 자르고 말줄임표.
  // (한국어는 공백 단위 어절이라 어절 경계, 영문은 단어 경계가 된다.)
  const cut = stripped.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${safe.replace(/[\s·,.:;]+$/g, '')}…`;
}

export interface LinkContext {
  /** vault 내부 다른 문서의 slug (이 함수가 resolve) */
  target: string;
  /** 링크 앞뒤 120자 컨텍스트. **[linkText]** 로 위치 마킹. */
  context: string;
  linkText: string;
}

/**
 * 위키링크 `[[slug]]` 의 target 을 문서가 속한 vault 기준으로 정규화한다.
 *
 * `docs/ontology/` 는 이 프로젝트가 dogfood 하는 **중첩 MCP vault** —
 * 그 안의 위키링크는 MCP 툴/사람이 쓰는 `capabilities/x`, `domains/y` 같은
 * ontology-vault-루트 기준 slug 를 그대로 쓴다(예:
 * `docs/ontology/elements/sigma-graphology.md` 의
 * `[[capabilities/topology-canvas-render]]`). 하지만 `/docs` 페이지가
 * 만드는 통합 트리에서 그 문서의 실제 slug 는 `ontology/` 접두사가 붙은
 * `ontology/capabilities/topology-canvas-render` 라, 접두사 보정 없이는
 * `backlinksDetail` 키가 서로 어긋나 실제 역참조가 있어도 조회에서
 * 누락된다 (persona QA fix/persona-findings ③). `ontology/` 바깥의
 * 최상위 문서가 쓰는 위키링크(예: `docs/CHANGELOG.md` 의 `[[FEATURES]]`)
 * 는 이미 루트 기준이라 그대로 둔다.
 */
function resolveWikilinkTargetSlug(targetSlug: string, fromSlug: string): string {
  if (fromSlug.startsWith('ontology/') && !targetSlug.startsWith('ontology/')) {
    return `ontology/${targetSlug}`;
  }
  return targetSlug;
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
  // Wikilinks [[slug]] / [[slug|text]] / [[slug#anchor]] — vault 루트 기준 slug
  // (중첩된 ontology/ vault 안에서는 그 vault 의 루트 기준 — 위
  // resolveWikilinkTargetSlug 참고).
  const wre = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  while ((m = wre.exec(body)) !== null) {
    const targetSpec = m[1].trim();
    const [rawTargetSlug] = targetSpec.split('#');
    if (!rawTargetSlug) continue;
    const targetSlug = resolveWikilinkTargetSlug(rawTargetSlug, fromSlug);
    if (!targetSlug || targetSlug === fromSlug) continue;
    slugs.add(targetSlug);
    const linkText = (m[2] ?? rawTargetSlug).trim();
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

/**
 * 파일이 원래 쓰던 **줄바꿈과 BOM** — 읽을 때 정규화하고 쓸 때 되돌리기 위한 값.
 *
 * 파서는 CRLF·BOM 을 정규화해서 읽는다(그래야 관계가 안 사라진다). 그런데
 * **쓰는 쪽이 정규화된 모양 그대로 저장하면 남의 파일의 줄바꿈을 말없이
 * 바꾸는 것**이 된다 — git diff 가 파일 전체로 뜨고, 그건 이 제품이 하지
 * 않기로 한 종류의 일이다. 그래서 모양을 기억했다가 되돌린다.
 */
export interface VaultSourceShape {
  bom: string;
  eol: "\n" | "\r\n";
}

export function readVaultSourceShape(raw: string): VaultSourceShape {
  return {
    bom: raw.startsWith("\uFEFF") ? "\uFEFF" : "",
    // 하나라도 CRLF 면 그 파일은 CRLF 파일이다 — 섞여 있으면 다수가 아니라
    // 존재로 판정한다(Windows 편집기가 이어서 쓰면 CRLF 로 붙기 때문).
    eol: raw.includes("\r\n") ? "\r\n" : "\n",
  };
}

/** 읽기용 정규화 — BOM 제거 + LF 통일. 파서가 진입부에서 하는 것과 같다. */
export function normalizeVaultSource(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

/** 쓰기용 복원 — 원래 파일이 쓰던 모양으로 되돌린다. */
export function restoreVaultSourceShape(text: string, shape: VaultSourceShape): string {
  const withEol = shape.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
  return `${shape.bom}${withEol}`;
}

/**
 * 블록 스칼라(`|`, `>` 와 그 chomping 변형)를 값으로 삼킨다.
 *
 * **왜 필요한가 (2026-07-29 도그푸딩 실측).** 이걸 모르면 지시자가 값으로
 * 저장되고(`definition: "|"`), 이어지는 들여쓴 본문 줄들이 최상위 루프로
 * 흘러간다. 그 루프는 키를 `.trim()` 하므로 들여쓰기가 지워지고, 설명문 안의
 * `kind: element` 같은 한 줄이 **그 노드의 종류를 덮어썼다.** 문서가 자기
 * 설명으로 자기 타입을 바꾸는 것이다. 경고는 0이었다.
 */
function readBlockScalar(
  lines: string[],
  start: number,
  indicator: string,
): { value: string; next: number } {
  const fold = indicator.startsWith('>');
  const chomp = indicator.includes('-') ? 'strip' : indicator.includes('+') ? 'keep' : 'clip';
  const collected: string[] = [];
  let j = start;
  let baseIndent: number | null = null;
  while (j < lines.length) {
    const line = lines[j];
    if (line.trim() === '') {
      collected.push('');
      j += 1;
      continue;
    }
    const indent = line.length - line.replace(/^\s+/, '').length;
    if (indent === 0) break;
    if (baseIndent === null) baseIndent = indent;
    if (indent < baseIndent) break;
    collected.push(line.slice(baseIndent));
    j += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop();
  let text: string;
  if (fold) {
    // 접힌 스칼라: 빈 줄은 줄바꿈, 이어지는 줄은 공백 하나로 합친다.
    text = collected
      .reduce<string[]>((acc, cur) => {
        if (cur === '') return acc.concat('');
        const last = acc[acc.length - 1];
        if (acc.length === 0 || last === '') return acc.concat(cur);
        acc[acc.length - 1] = `${last} ${cur}`;
        return acc;
      }, [])
      .join('\n');
  } else {
    text = collected.join('\n');
  }
  if (chomp === 'keep') text += '\n';
  return { value: text, next: j };
}
