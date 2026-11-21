// Lightweight parser for a `---\n...\n---\n` block, with no gray-matter dependency: scalars, inline
// lists and objects, block lists and objects. Same rules as scripts/docs-vault/build-docs-vault.mjs,
// but TS/browser compatible.

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
  diagnostics?: FrontmatterDiagnostic[];
}

interface FrontmatterDiagnostic {
  code: "malformed-frontmatter-line" | "malformed-quoted-scalar";
  line: number;
  message: string;
}

type ParsedScalar = string | number | boolean;

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Graph edge keys, same set as `mcp/src/parser.mjs`: a scalar here parses but silently draws no
// edge.
const GRAPH_ARRAY_KEYS = new Set([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
  'broader',
]);

function pushGraphArrayDiagnostic(
  diagnostics: FrontmatterDiagnostic[],
  key: string,
  line: number,
  value: unknown,
): void {
  if (!GRAPH_ARRAY_KEYS.has(key) || Array.isArray(value)) return;
  diagnostics.push({
    code: 'malformed-frontmatter-line',
    line,
    message: `Frontmatter line ${line} graph relation \`${key}:\` must be an array.`,
  });
}

function assignParsedKey(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  diagnostics: FrontmatterDiagnostic[],
  line: number,
): boolean {
  if (UNSAFE_OBJECT_KEYS.has(key)) {
    diagnostics.push({
      code: 'malformed-frontmatter-line',
      line,
      message: `Frontmatter line ${line} uses unsafe object key \`${key}\`.`,
    });
    return false;
  }
  target[key] = value;
  return true;
}

export function readFrontmatterEntry(input: string): { key: string; value: string } | null {
  const text = input.trim();
  let key: string;
  let end: number;
  if (text.startsWith('"') || text.startsWith("'")) {
    const match = text.startsWith('"')
      ? /^"((?:[^"\\]|\\["\\nt])*)"\s*:/.exec(text)
      : /^'((?:[^']|'')*)'\s*:/.exec(text);
    if (!match) return null;
    key = text[0] === "'" ? match[1].replace(/''/g, "'") : decodeDoubleQuoted(match[1]);
    end = match[0].length;
  } else {
    const colon = text.indexOf(':');
    if (colon < 0 || text.startsWith('#')) return null;
    key = text.slice(0, colon).trim();
    end = colon + 1;
  }
  return key ? { key, value: text.slice(end).trim() } : null;
}

function readMappingMember(input: string, diagnostics: FrontmatterDiagnostic[], line: number): { key: string; value: string } | null {
  const entry = readFrontmatterEntry(input);
  if (!entry && input.trim() && !input.trim().startsWith('#')) {
    diagnostics.push({
      code: 'malformed-frontmatter-line', line,
      message: `Frontmatter line ${line} must use key: value syntax.`,
    });
  }
  return entry;
}

function decodeDoubleQuoted(value: string): string {
  return value.replace(/\\(["\\nt])/g, (_, escaped: string) =>
    escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped);
}

export function parseFrontmatter(input: string): ParsedFrontmatter {
  // Normalise BOM and CRLF on the read path only. CRLF leaves `\r` that breaks the block-list match
  // and empties lists; a BOM defeats `startsWith('---')` so `kind:` vanishes.
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
    if (line.trim().startsWith(':')) continue;
    const entry = readFrontmatterEntry(line);
    if (!entry) {
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
    const { key, value } = entry;

    // **Check for a block scalar before classifying the value.** The value of
    // `definition: |` is `"|"`, not an empty string, so putting this inside the
    // empty-value branch would make it unreachable.
    const scalarIndicator = /^[|>](?:[1-9][-+]?|[-+][1-9]?)?$/.exec(value);
    if (scalarIndicator) {
      const read = readBlockScalar(lines, i + 1, scalarIndicator[0]);
      assignParsedKey(frontmatter, key, read.value, diagnostics, i + 2);
      pushGraphArrayDiagnostic(diagnostics, key, i + 2, read.value);
      i = read.next - 1;
      continue;
    }
    if (value === '') {

      // Block mode — a following `  -` means a list, `  childKey:` an object.
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
        assignParsedKey(frontmatter, key, items, diagnostics, i + 2);
        i = j - 1;
        continue;
      }
      if (lookahead === 'object') {
        const mapping: Record<string, ParsedScalar> = {};
        let j = i + 1;
        while (j < lines.length) {
          if (!/^\s+/.test(lines[j]) || !lines[j].trim()) break;
          const child = readMappingMember(lines[j], diagnostics, j + 2);
          if (child) {
            pushQuotedScalarDiagnostic(diagnostics, child.key, j + 2, child.value);
            assignParsedKey(mapping, child.key, parseScalar(child.value), diagnostics, j + 2);
          }
          j += 1;
        }
        assignParsedKey(frontmatter, key, mapping, diagnostics, i + 2);
        pushGraphArrayDiagnostic(diagnostics, key, i + 2, mapping);
        i = j - 1;
        continue;
      }
      assignParsedKey(frontmatter, key, '', diagnostics, i + 2);
      pushGraphArrayDiagnostic(diagnostics, key, i + 2, '');
      continue;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      assignParsedKey(frontmatter, key, parseInlineList(value), diagnostics, i + 2);
      continue;
    }
    if (value.startsWith('{') && value.endsWith('}')) {
      const inlineObject = parseInlineObject(value, diagnostics, i + 2);
      assignParsedKey(frontmatter, key, inlineObject, diagnostics, i + 2);
      pushGraphArrayDiagnostic(diagnostics, key, i + 2, inlineObject);
      continue;
    }
    pushQuotedScalarDiagnostic(diagnostics, key, i + 2, value);
    const topLevelScalar = parseScalar(value);
    assignParsedKey(frontmatter, key, topLevelScalar, diagnostics, i + 2);
    pushGraphArrayDiagnostic(diagnostics, key, i + 2, topLevelScalar);
  }
  const result: ParsedFrontmatter = { frontmatter, body };
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
}

/**
 * Reports a scalar that opens a quote it never closes: `unquote` then strips only the opening
 * quote and every reader renders the stray quote. Top-level scalars only.
 */
function quotedScalarFault(value: string): 'trailing' | 'unterminated' | null {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (quote !== '"' && quote !== "'") return null;
  // Match the renderer, not YAML: `unquote` strips a wrapping pair, so only a value that never
  // closes is a fault.
  if (closesWithQuote(trimmed, quote)) return null;
  for (let i = 1; i < trimmed.length; i += 1) {
    // The same escape rule `unquote` reverses, so a `\\"` is not a closer.
    if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
      i += 1;
      continue;
    }
    if (trimmed[i] === quote) return 'trailing';
  }
  return 'unterminated';
}

function closesWithQuote(trimmed: string, quote: string): boolean {
  if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== quote) return false;
  let backslashes = 0;
  for (let i = trimmed.length - 2; i >= 0 && trimmed[i] === '\\'; i -= 1) backslashes += 1;
  return backslashes % 2 === 0;
}

function pushQuotedScalarDiagnostic(
  diagnostics: FrontmatterDiagnostic[],
  key: string,
  line: number,
  value: string,
): void {
  const fault = quotedScalarFault(value);
  if (!fault) return;
  const trimmed = value.trim();
  const suggestion = trimmed.split(trimmed[0]).join('').replace(/\s+/g, ' ').trim();
  const fix = suggestion ? `: \`${key}: ${suggestion}\`` : '';
  diagnostics.push({
    code: 'malformed-quoted-scalar',
    line,
    message:
      `Frontmatter line ${line} \`${key}:\` ` +
      (fault === 'trailing'
        ? 'closes its quote before the end of the value, so the rest is read as literal text'
        : 'opens a quote the value never closes, so the quote is read as literal text') +
      `. Close the quote or remove it${fix}`,
  });
}

function peekIndentedKind(
  lines: string[],
  start: number,
): 'list' | 'object' | null {
  if (start >= lines.length) return null;
  const next = lines[start];
  if (/^\s*-\s+/.test(next)) return 'list';
  if (/^\s+\S/.test(next) && !next.trim().startsWith('#')) return 'object';
  return null;
}

function parseInlineList(raw: string): string[] {
  return splitTopLevel(raw.slice(1, -1), ',')
    .map((s) => unquote(s.trim()))
    .filter(Boolean);
}

function parseInlineObject(
  raw: string,
  diagnostics: FrontmatterDiagnostic[],
  line: number,
): Record<string, ParsedScalar> {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return {};
  const out: Record<string, ParsedScalar> = {};
  for (const part of splitTopLevel(inner, ',', true)) {
    const member = readMappingMember(part, diagnostics, line);
    if (!member) continue;
    pushQuotedScalarDiagnostic(diagnostics, member.key, line, member.value);
    assignParsedKey(out, member.key, parseScalar(member.value), diagnostics, line);
  }
  return out;
}

function parseScalar(value: string): ParsedScalar {
  const trimmed = value.trim();
  if ((trimmed[0] === '"' || trimmed[0] === "'") && trimmed.length >= 2 && trimmed[trimmed.length - 1] === trimmed[0]) return unquote(value);
  const v = unquote(value);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  // Unescape only when stripping surrounding quotes: the serializer escapes `"`, so skipping this
  // adds a backslash layer per save. An unquoted value is literal text.
  const quote = trimmed.length >= 2 ? trimmed[0] : '';
  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    const inner = trimmed.slice(1, -1);
    return quote === '"' ? decodeDoubleQuoted(inner) : inner.replace(/\\(['\\])/g, '$1');
  }
  return value.replace(/^["']|["']$/g, '');
}

/** Quote-aware splitting: a separator inside quotes is data, not a separator. */
function splitTopLevel(input: string, separator: string, mapping = false): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote: string | null = null;
  let key = mapping;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === '\\' && !(key && quote === "'") && i + 1 < input.length) {
        i += 1;
        continue;
      }
      if (ch === quote) {
        if (key && quote === "'" && input[i + 1] === "'") i += 1;
        else quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ':' && mapping) key = false;
    else if (ch === separator) {
      parts.push(input.slice(start, i));
      start = i + 1;
      key = mapping;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

function* bodyLines(body: string, stripCr = false): Generator<string> {
  let start = 0;
  while (start <= body.length) {
    const newline = body.indexOf('\n', start);
    if (newline < 0) {
      yield body.slice(start);
      return;
    }
    const end = stripCr && newline > start && body.charCodeAt(newline - 1) === 13 ? newline - 1 : newline;
    yield body.slice(start, end);
    start = newline + 1;
  }
}

export function firstHeading(body: string): string | null {
  // Fence-aware like `extractHeadings`: a `# comment` inside a fenced block is not a title.
  let inCode = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^#\s+(.+)$/);
    if (m) return m[1].trim();
  }
  return null;
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

export function buildDefinitionPreview(
  body: string,
  frontmatter: Record<string, unknown>,
  max = 320,
): string | undefined {
  const titles = Object.entries(frontmatter)
    .filter(([key, value]) => (key === 'title' || key.startsWith('display_')) && typeof value === 'string')
    .map(([, value]) => (value as string).trim());
  const lines = bodyLines(body, true);
  let current = lines.next();
  while (!current.done && !current.value.trim()) current = lines.next();
  const heading = current.value?.match(/^ {0,3}#\s+(.+?)(?:\s+#+)?\s*$/);
  if (heading && titles.includes(heading[1].trim())) {
    current = lines.next();
    while (!current.done && !current.value.trim()) current = lines.next();
  }
  if (current.value && /^ {0,3}##[ \t]+Definition(?:[ \t]+#+)?[ \t]*$/.test(current.value)) {
    current = lines.next();
    while (!current.done && !current.value.trim()) current = lines.next();
  }
  const paragraph: string[] = [];
  for (; !current.done; current = lines.next()) {
    const line = current.value;
    const trimmed = line.trim();
    if (!trimmed) break;
    if (/^(?:=+|-+)\s*$/.test(trimmed) || /^\|?\s*:?-{3,}/.test(trimmed)) return undefined;
    if (/^(?: {4}|\t)/.test(line)) {
      if (!paragraph.length) return undefined;
      paragraph.push(trimmed);
      continue;
    }
    if (/^(?:\||<|!\[|\[[^\]]+\]:)/.test(trimmed)) return undefined;
    if (/^(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|[-+*]\s|\d+[.)]\s|(?:\*\s*){3,}$|(?:_\s*){3,}$)/.test(trimmed)) break;
    paragraph.push(trimmed);
  }
  const preview = paragraph.join(' ').replace(/\s+/g, ' ').trim();
  return preview && preview.length <= max ? preview : undefined;
}

export function buildExcerpt(body: string, max = 320): string {
  // A raw table excerpt renders as a wall of pipes, so separator rows go and cell pipes become middots.
  const stripped = body
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks
    .replace(/^#+\s.*$/gm, '') // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → link text
    .replace(/^[\s|:-]*-{2,}[\s|:-]*$/gm, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/^\s*[-•]\s+/gm, '') // `#` is deliberately not in this class: `path.tsx#Symbol` is content and must keep its separator.
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/(?:·\s*){2,}/g, '· ')
    .replace(/^[\s·]+|[\s·]+$/g, '')
    .trim();
  if (stripped.length <= max) return stripped;
  // Cut at the last space within max so the text never breaks mid-word.
  const cut = stripped.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${safe.replace(/[\s·,.:;]+$/g, '')}…`;
}

/** Here, not in `wiki-page-schema.ts`, which imports this module: the dependency runs one way. */
export const WIKI_DIR = 'wiki';

/**
 * Normalises a wikilink target. Slugs inside the nested `docs/ontology/` vault get an `ontology/`
 * prefix to match the merged tree; a bare slug inside `wiki/` names a page in `wiki/`. Keep in
 * step with `normalizeWikiLinkTarget` in `wiki-page-schema.ts`.
 */
export function resolveWikilinkTargetSlug(targetSlug: string, fromSlug: string): string {
  if (fromSlug.startsWith('ontology/') && !targetSlug.startsWith('ontology/')) {
    return `ontology/${targetSlug}`;
  }
  if (fromSlug.startsWith(`${WIKI_DIR}/`) && !targetSlug.includes('/')) {
    return `${WIKI_DIR}/${targetSlug}`;
  }
  return targetSlug;
}

/** A relative `.md` link target as a slug from `fromDir`, or null for a web, anchor or non-Markdown target. */
function markdownLinkSlug(target: string, fromDir: string): string | null {
  if (!target || target.startsWith('#') || /^https?:\/\//i.test(target)) return null;
  if (!target.endsWith('.md') && !target.includes('.md#')) return null;
  const rel = target.split('#')[0].replace(/^\.\//, '');
  const stack: string[] = [];
  for (const part of (fromDir ? `${fromDir}/${rel}` : rel).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/').replace(/\.md$/, '') || null;
}

/**
 * The slugs a body links to, by relative `.md` link and by wikilink, each once in first-link
 * order, never `fromSlug` itself. O(body): one scan per link syntax.
 */
export function extractOutLinkTargets(body: string, fromSlug: string): string[] {
  const targets = new Set<string>();
  const fromDir = fromSlug.includes('/') ? fromSlug.slice(0, fromSlug.lastIndexOf('/')) : '';
  for (const match of body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const target = markdownLinkSlug(match[2], fromDir);
    if (target && target !== fromSlug) targets.add(target);
  }
  for (const match of body.matchAll(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g)) {
    const spec = match[1].trim();
    // `[[src:sources/<path>#<anchor>]]` cites a source (`docs/ONTOLOGY-ATLAS-SPEC.md` §11.3).
    if (spec.startsWith('src:')) continue;
    const [bare] = spec.split('#');
    const target = bare ? resolveWikilinkTargetSlug(bare, fromSlug) : '';
    if (target && target !== fromSlug) targets.add(target);
  }
  return [...targets];
}

/** Restored on write: saving the normalised form would rewrite the line endings of the whole file. */
export interface VaultSourceShape {
  bom: string;
  eol: "\n" | "\r\n";
}

export function readVaultSourceShape(raw: string): VaultSourceShape {
  return {
    bom: raw.startsWith("\uFEFF") ? "\uFEFF" : "",
    // One CRLF makes it a CRLF file — for mixed endings the test is presence,
    // not majority, because a Windows editor appends CRLF from there on.
    eol: raw.includes("\r\n") ? "\r\n" : "\n",
  };
}

/** Read-side normalisation — drop the BOM, unify on LF. Same as the parser's entry. */
export function normalizeVaultSource(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

export function restoreVaultSourceShape(text: string, shape: VaultSourceShape): string {
  const withEol = shape.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
  return `${shape.bom}${withEol}`;
}

/**
 * Consumes a block scalar (`|`, `>` and chomping variants); otherwise indented lines such as
 * `kind: element` fall through to the top-level loop and overwrite the node's kind.
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
  // An explicit indicator (`|2-`) fixes the base indent; otherwise the first non-blank line
  // decides. The writer emits the digit when that line starts with whitespace.
  const explicitIndent = /[1-9]/.exec(indicator);
  let baseIndent: number | null = explicitIndent ? Number(explicitIndent[0]) : null;
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
    // Folded scalar: a blank line is a newline, consecutive lines join with one space.
    text = collected
      .reduce<string[]>((acc, current) => {
        if (current === '') return acc.concat('');
        const last = acc[acc.length - 1];
        if (acc.length === 0 || last === '') return acc.concat(current);
        acc[acc.length - 1] = `${last} ${current}`;
        return acc;
      }, [])
      .join('\n');
  } else {
    text = collected.join('\n');
  }
  if (chomp === 'keep') text += '\n';
  return { value: text, next: j };
}
