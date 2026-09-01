// Lightweight frontmatter parser — handles only a `---\n...\n---\n` block.
// Recognises all of these without a gray-matter dependency:
//   key: value                          (scalar)
//   key: [a, b]                         (inline list)
//   key: { x: 1, y: 2 }                 (inline object)
//   key:\n  - item1\n  - item2          (block list)
//   key:\n  child: 1\n  other: 2        (block object)
// Same rules as scripts/build-docs-vault.mjs, but TS/browser compatible.

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

// These frontmatter keys are graph edges, not arbitrary metadata (same set as
// mcp/src/parser.mjs). A scalar at one of these keys parses fine and then
// silently draws no edge — the mcp parser has diagnosed it since 2026-08 while
// this parser stayed silent, a 3-way divergence the 4-way contract fixtures
// did not cover (bug sweep 2026-09-01).
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

export function parseFrontmatter(input: string): ParsedFrontmatter {
  // Normalise line endings and encoding — **on the read path only**
  // (measured 2026-07-28).
  //
  // CRLF: splitting on `\n` leaves a trailing `\r` on every line. The block-list
  // regex's `.` does not match `\r` and `$` only sees the end of the string, so
  // the match fails and the list comes back empty. Scalars survive because
  // `.trim()` rescues them, so the symptom is **"the nodes are there but every
  // relation vanished"** — with zero warnings.
  //
  // BOM: `raw.startsWith('---')` is false for `\uFEFF---`, so the whole
  // frontmatter block falls through into the body and `kind:` disappears —
  // **the document vanishes from the graph as a node**.
  //
  // Both are produced by the default editor of the population
  // `.claude/rules/surfaces.md` names as explicitly supported (Windows
  // Chromium). The 4-way contract test only guarantees the four parsers *agree*,
  // and it was passing because **all four were wrong the same way**.
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
        const obj: Record<string, ParsedScalar> = {};
        let j = i + 1;
        while (j < lines.length) {
          const m = lines[j].match(/^(\s+)([^\s:][^:]*):\s*(.*)$/);
          if (!m) break;
          const childKey = m[2].trim();
          const childValue = m[3].trim();
          if (!childKey) break;
          assignParsedKey(obj, childKey, parseScalar(childValue), diagnostics, j + 2);
          j += 1;
        }
        assignParsedKey(frontmatter, key, obj, diagnostics, i + 2);
        pushGraphArrayDiagnostic(diagnostics, key, i + 2, obj);
        i = j - 1;
        continue;
      }
      assignParsedKey(frontmatter, key, '', diagnostics, i + 2);
      pushGraphArrayDiagnostic(diagnostics, key, i + 2, '');
      continue;
    }

    // Inline forms
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
    const topLevelScalar = parseTopLevelScalar(value);
    assignParsedKey(frontmatter, key, topLevelScalar, diagnostics, i + 2);
    pushGraphArrayDiagnostic(diagnostics, key, i + 2, topLevelScalar);
  }
  const result: ParsedFrontmatter = { frontmatter, body };
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
}

/**
 * Reports a scalar that **opens a quote the value never closes as its last
 * character** — `display_ko: "Agents" destination`, found in this repository's own
 * vault on 2026-08-31.
 *
 * `unquote` strips a wrapping pair only when the first and last characters are
 * the same quote, so a value that opens a quote it never closes falls through to
 * its lenient tail
 * (`replace(/^["']|["']$/g, '')`), which removes the opening quote and keeps the
 * rest verbatim, so every reader renders `Agents" destination`. Nothing else noticed:
 * the key parses, the node loads, and `validate` answered `0 issues` while the
 * map, the lists and the app title all showed the broken text.
 *
 * Top-level scalars only. Inline list and object members reach `unquote` through
 * the quote-aware `splitTopLevel`, and a block scalar carries no quoting at all.
 */
function quotedScalarFault(value: string): 'trailing' | 'unterminated' | null {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (quote !== '"' && quote !== "'") return null;
  // **Match the renderer, not YAML.** `unquote` strips a wrapping pair whenever
  // the last character is the same quote, so `'Owner's guide'` and
  // `"He said "hi" today"` render exactly as written. Only a value that never
  // closes is a fault; anything else would fail a vault that reads correctly.
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

/** Whether the last character closes the opening quote rather than being escaped. */
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
  if (/^\s+[^\s:][^:]*:\s*\S?/.test(next)) return 'object';
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
  for (const part of splitTopLevel(inner, ',')) {
    const cIdx = part.indexOf(':');
    if (cIdx === -1) continue;
    const k = part.slice(0, cIdx).trim();
    const v = part.slice(cIdx + 1).trim();
    if (!k) continue;
    assignParsedKey(out, k, parseScalar(v), diagnostics, line);
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

/*
 * Top-level scalars are typed like nested ones (2026-09-01 review). The
 * serializer writes booleans and numbers unquoted, so reading them back as
 * strings inverted any consumer branching on the field after one round trip —
 * `draft: false` came back as the truthy string 'false', with the type
 * depending on nesting depth in the same file. A quoted scalar stays a string:
 * quoting is how an author forces text.
 */
function parseTopLevelScalar(value: string): ParsedScalar {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === '"' || quote === "'") &&
    trimmed.length >= 2 &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return unquote(value);
  }
  return parseScalar(value);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  // Unescape **only** when stripping surrounding quotes. The serializer escapes
  // `"`, so failing to reverse it here adds one more backslash layer per save
  // (measured over 3 round trips: 1 → 2 → 4). An unquoted value is literal text,
  // not escape syntax, so it is left alone.
  const quote = trimmed.length >= 2 ? trimmed[0] : '';
  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    const inner = trimmed.slice(1, -1).replace(new RegExp(`\\\\(${quote}|\\\\)`, 'g'), '$1');
    /*
     * Inside double quotes, `\n` **is a newline** (2026-08-16).
     *
     * A literal newline emitted by the writer destroys the whole frontmatter
     * block: the next line reads as a new key, or hits `---` and starts the body
     * (measured: `note⏎kind: element` **changed the node's kind**). So the writer
     * emits `\n` inside double quotes and the reader reverses it here.
     *
     * Single quotes are untouched — in YAML those are strings with no escapes.
     */
    return quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : inner;
  }
  return value.replace(/^["']|["']$/g, '');
}

/**
 * Quote-aware splitting (fixed on measurement, 2026-07-28).
 *
 * Inline lists and objects used to be split on every comma, with a comment
 * declaring that limitation "unsupported". But a comma inside a value **silently
 * truncates data** — the tail of `labels: { ko: "Map, Search" }` disappeared. A
 * separator inside quotes is data, not a separator.
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
  // Fence-aware like extractHeadings (bug sweep 2026-09-01): a titleless doc
  // whose body opens with a fenced shell block containing `# comment` used to
  // get that comment as its manifest and graph title.
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

export function buildExcerpt(body: string, max = 320): string {
  // Produce a readable prose preview. Markdown tables are the main hazard: a
  // raw excerpt of a table renders as a wall of `|` pipes (e.g.
  // "| Tool | Action | --- | listconcepts |"), which is unreadable in the
  // node-detail panel. Strip table separator/hr rows and turn cell pipes into
  // middot separators so a table reads as "Tool · Action · listconcepts · …".
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
  // Cut at the last space within max so the text never breaks mid-word.
  // (Korean spaces separate eojeol, English separates words — either way this
  // lands on a boundary.)
  const cut = stripped.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${safe.replace(/[\s·,.:;]+$/g, '')}…`;
}

export interface LinkContext {
  /** Slug of another document in the vault, resolved by this function. */
  target: string;
  /** 120 characters of context on each side, with the position marked as **[linkText]**. */
  context: string;
  linkText: string;
}

/**
 * Normalises a wikilink `[[slug]]` target against the vault the document belongs
 * to.
 *
 * `docs/ontology/` is the **nested MCP vault** this project dogfoods, and
 * wikilinks inside it use slugs relative to that vault's root, as MCP tools and
 * people write them (`capabilities/x`, `domains/y` — e.g.
 * `[[capabilities/topology-canvas-render]]` in
 * `docs/ontology/elements/sigma-graphology.md`). In the merged tree the `/docs`
 * page builds, the same document's real slug carries an `ontology/` prefix
 * (`ontology/capabilities/topology-canvas-render`), so without this correction
 * the `backlinksDetail` keys disagree and a real backlink is missing from the
 * lookup. Wikilinks in top-level documents outside `ontology/` (such as
 * `[[FEATURES]]` in `docs/CHANGELOG.md`) are already root-relative and are left
 * alone.
 */
function resolveWikilinkTargetSlug(targetSlug: string, fromSlug: string): string {
  if (fromSlug.startsWith('ontology/') && !targetSlug.startsWith('ontology/')) {
    return `ontology/${targetSlug}`;
  }
  return targetSlug;
}

/**
 * Extracts relative `.md` references from a markdown body as target slugs plus
 * surrounding context. Ignores http(s), anchors and images. `fromSlug` is the
 * current document's vault slug (directory included, extension excluded).
 */
export function extractOutLinksWithContext(
  body: string,
  fromSlug: string,
): { slugs: string[]; contexts: LinkContext[] } {
  const slugs = new Set<string>();
  const contexts: LinkContext[] = [];
  // Standard markdown links: [text](path.md)
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
  // Wikilinks [[slug]] / [[slug|text]] / [[slug#anchor]] — slugs relative to the
  // vault root (inside the nested ontology/ vault, relative to that vault's root
  // — see resolveWikilinkTargetSlug above).
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
 * The **line ending and BOM the file originally used** — normalised on read and
 * restored on write.
 *
 * The parser normalises CRLF and BOM so relations do not vanish. But **saving
 * the normalised form would silently rewrite someone else's line endings**,
 * turning the git diff into the whole file — the kind of thing this product does
 * not do. So the shape is remembered and put back.
 */
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

/** Write-side restoration — back to the shape the original file used. */
export function restoreVaultSourceShape(text: string, shape: VaultSourceShape): string {
  const withEol = shape.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
  return `${shape.bom}${withEol}`;
}

/**
 * Consumes a block scalar (`|`, `>` and their chomping variants) as the value.
 *
 * **Why it is needed** (measured while dogfooding, 2026-07-29). Without it the
 * indicator is stored as the value (`definition: "|"`) and the indented body
 * lines fall through to the top-level loop. That loop `.trim()`s keys, so the
 * indentation disappears and a line like `kind: element` inside the prose
 * **overwrote the node's kind** — a document changing its own type through its
 * own description, with zero warnings.
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
  // An explicit indentation indicator (`|2-`) fixes the base indent. Without it
  // the first non-blank line decides — the writer emits the digit whenever the
  // value's own first line carries leading whitespace, because a first-line
  // base would swallow that whitespace and eject shallower lines back into the
  // top-level key loop.
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
