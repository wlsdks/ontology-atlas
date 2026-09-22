// Turn a node's `## Uncertainty` prose into the next reads it asks for.
//
// The construction rules make every node record what its author did not read.
// That record is the most honest thing in a vault and, until now, the most
// inert: it is prose, so nothing could queue it. This module is the one place
// that reads those lines as work — which file, which lines, and what kind of
// gap — so `growth_plan` can hand the next agent a read instead of a feeling.
//
// Pure and deterministic: no file system, no clock, no network. It is handed a
// body that somebody else loaded and returns rows. Everything it claims is in
// the statement it quotes, so a wrong classification is visible next to its
// evidence rather than hidden behind it.

import { uncertaintySectionLines } from './meaning-findings.mjs';

/**
 * The kinds, in the order a reader should work them.
 *
 * A named range is first because it is the cheapest complete answer: the author
 * already found the file and stopped partway, so the remaining read is bounded.
 * A whole unread file is next, then an area nobody opened, then something that
 * was never run, then a claim taken on somebody else's word. `other` is last
 * and deliberately kept: a line under this heading that matches no phrasing is
 * still the author saying something is unsettled, and dropping it would teach
 * the vault that only recognised wording counts.
 *
 * Module-private on purpose: `cli/src/lib/query-result-contract.mjs` keeps its
 * own copy because the CLI ships without this package, and that copy is a
 * contract against the response rather than an import of the producer.
 */
const UNCERTAINTY_READ_KINDS = Object.freeze([
  'unread-range',
  'unread-file',
  'unopened-area',
  'not-executed',
  'unverified-claim',
  'other',
]);

const KIND_ORDER = new Map(UNCERTAINTY_READ_KINDS.map((kind, index) => [kind, index]));

/** "was not read", "still unread", "not traced", "not scanned", "not inspected". */
const UNREAD_PHRASE =
  /\bnot\s+(?:re-?)?read\b|\bunread\b|\bnot\s+traced\b|\bnot\s+scanned\b|\bnot\s+inspected\b|\bwithout\s+re-?reading\b/i;
/**
 * "Read from the module header", "by name", "by layout", "the feature's file
 * layout only": the author saw the outside of the file and not its body. On
 * this repository's own vault (2026-09-23) 22 of 107 Uncertainty lines were
 * written this way and every one fell to `other`, so the body each of them
 * names as unread was never queued.
 */
const SURFACE_ONLY_PHRASE =
  /\bread\s+from\s+(?:the|its)\s+(?:module\s+)?header\b|\bread\s+from\b[^.;]*\bheaders\b|\bheaders?\s+only\b|\bonly\s+from\s+their\s+headers\b|\bby\s+(?:name|layout)\b(?!\s+only)|\b(?:file|folder)\s+layout\b|\bgrammar\s+comment\b/i;
/** "was not opened", "never opened" — an area the author did not enter at all. */
const UNOPENED_PHRASE = /\bnot\s+opened\b|\bnever\s+opened\b/i;
/**
 * "was not run", "never run", "not executed", "no code was executed".
 *
 * `never` sits beside `not` for the same reason it does in the unread family
 * above: this vault's authors write both, and reading only one of them would
 * file "it was never run in this session" under `other` while filing "it was
 * not run" under the kind that names the work.
 */
const NOT_EXECUTED_PHRASE =
  /\b(?:not|never)\s+(?:run|executed|exercised|rendered|tested)\b|\bno\s+code\s+was\s+executed\b|\bnothing\b[^.;]{0,40}\bwas\s+(?:run|rendered|exercised)\b|\bno\s+\w+\s+was\s+(?:run|rendered|exercised|taken)\b/i;
/** Corroboration that never touched the thing it corroborates. */
const UNVERIFIED_PHRASE =
  /\bheading\s+name\s+only\b|\bby\s+name\s+only\b|\basserted\s+by\b|\bnot\s+verified\b|\bunverified\b|\bnot\s+(?:checked|confirmed|reproduced|observed|measured|enumerated)\b/i;

/**
 * `lines 1–110`, `lines 45-74`, `line 42`, `lines 10 to 20`, `lines 10 through 20`.
 * En dash, em dash and hyphen all read the same.
 */
const RANGE_PATTERN = /\blines?\s+(\d[\d,]*)(?:\s*[–—-]\s*|\s+(?:to|through)\s+)?(\d[\d,]*)?/gi;
/**
 * `from line 276 to line 470`: the shape a builder writes for a function's
 * extent. Read before RANGE_PATTERN so the two `line N` inside it are not
 * counted as two one-line ranges (measured on a Rust trial vault, 2026-09-23,
 * where this sentence was the one that held the missed answer).
 */
const FROM_TO_PATTERN = /\bfrom\s+line\s+(\d[\d,]*)\s+(?:to|through|until)\s+line\s+(\d[\d,]*)/gi;
/** `through line 414`, `up to line 414`: the end of whatever the author read before it. */
const THROUGH_LINE = /\b(?:through|up\s+to|until)\s+$/i;
/** `lines 1–110 of 2790`: the file's length, which bounds the part left unread. */
const DENOMINATOR_AFTER = /^\s+of\s+(\d[\d,]*)\b/;
/** `lines 138–414 of src/cli.rs`: the file named right after the span owns it. */
const PATH_AFTER = /^\s+of\s+(?:the\s+)?(`?)([^\s`,;]+)\1/;

/**
 * Which way a span points: the lines the author read, or the lines they did not.
 *
 * "Only lines 141–220 were read" names what was read, and the next read is
 * everything else; queueing 141–220 sends the reader back over ground already
 * covered. The first polarity phrase after the span decides, then the nearest
 * before it; with neither, a span in an Uncertainty line is taken as unread,
 * which is what the heading means.
 */
const READ_POLARITY = /\b(?:was|were)\s+read\b(?!\s+(?:only\s+)?(?:in|as)\s+(?:an?\s+)?outline)|\bread\s+(?:directly|in\s+full|line\s+by\s+line)\b/gi;
/**
 * "read only in outline", "seen as an outline", "outline only": the author saw
 * the declarations and not the bodies, so the lines themselves are unread. A
 * Rust trial builder wrote six of nineteen Uncertainty lines this way and every
 * one fell to `other`, including the one holding the answer a reader then missed.
 */
const OUTLINE_ONLY_PHRASE = /\b(?:read|seen)\s+(?:only\s+)?(?:in|as)\s+(?:an?\s+)?outline\b|\boutline\s+only\b|\bonly\s+in\s+outline\b/i;
const UNREAD_POLARITY = new RegExp(
  [
    /\bnot\s+read\b|\bunread\b|\bnot\s+traced\b|\bnot\s+scanned\b|\bnot\s+inspected\b/.source,
    /\bnot\s+opened\b|\bnever\s+opened\b/.source,
    OUTLINE_ONLY_PHRASE.source,
  ].join('|'),
  'gi',
);

/** A backtick span, which is how this vault's authors usually write a path. */
const BACKTICK_PATTERN = /`([^`\n]+)`/g;

/** A list marker or blockquote arrow in front of the sentence itself. */
const LEADING_MARKER = /^\s*(?:[-*+]|\d+[.)]|>)\s+/;

/** Punctuation an English sentence leaves stuck to a path. */
const TRIM_EDGES = /^[([{"'“‘]+|[)\]}"'”’.,;:!?]+$/g;

/** `x.mjs:42`, `x.mjs:640-748`: an editor-style citation, which names the file first. */
const LINE_SUFFIX = /:\d+(?:[–—-]\d+)?$/;

/** `.ts`, `.mjs`, `.md`, `.rs` — enough of an extension to call a token a file. */
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,9}$/;

function toInteger(value) {
  return Number.parseInt(String(value).replace(/,/g, ''), 10);
}

function stripEdges(token) {
  let text = String(token ?? '');
  let previous = null;
  while (text !== previous) {
    previous = text;
    text = text.replace(TRIM_EDGES, '');
  }
  return text;
}

/**
 * Is this token an address in the repository?
 *
 * Two bars, because the two ways a path is written carry different risk. Inside
 * backticks the author already marked it as code, so a bare file name such as
 * `schema.mjs` counts. Outside them a token needs both a separator and an
 * extension, otherwise every sentence ending in a word with a dot becomes a
 * file and the queue fills with prose.
 */
function looksLikePath(token, { backticked }) {
  if (!token || /\s/.test(token)) return false;
  if (token.startsWith('http://') || token.startsWith('https://')) return false;
  const hasSeparator = token.includes('/');
  const hasExtension = EXTENSION.test(token);
  if (backticked) return hasSeparator || hasExtension;
  return hasSeparator && hasExtension;
}

/**
 * Every path in one statement, with where it was written.
 *
 * The position is what lets a range find its file: `lines 1–110 of
 * \`mcp/src/query.mjs\`` and `\`mcp/src/query.mjs\`, lines 1–110` both mean the
 * same thing, and only the offsets tell them apart from a sentence that names
 * two files and one range.
 */
function locatePaths(statement) {
  const found = [];
  const seen = new Set();
  const covered = [];
  for (const match of statement.matchAll(BACKTICK_PATTERN)) {
    covered.push([match.index, match.index + match[0].length]);
    const token = stripEdges(match[1].trim()).replace(LINE_SUFFIX, '');
    if (!looksLikePath(token, { backticked: true })) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    found.push({ path: token, index: match.index });
  }
  const isCovered = (index) => covered.some(([from, to]) => index >= from && index < to);
  for (const match of statement.matchAll(/\S+/g)) {
    if (isCovered(match.index)) continue;
    const token = stripEdges(stripEdges(match[0]).replace(LINE_SUFFIX, ''));
    if (!looksLikePath(token, { backticked: false })) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    found.push({ path: token, index: match.index });
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * Which file a range belongs to.
 *
 * The nearest path written before it wins, because English puts the file first:
 * "lines 1–110 of X" is the exception and falls back to the first path in the
 * sentence. With no path in the sentence at all the node's own `path:` is the
 * only candidate left, and a range with no file is worse than useless.
 */
function pathForRange(index, paths, fallbackPath) {
  let chosen = null;
  for (const entry of paths) {
    if (entry.index < index) chosen = entry.path;
  }
  if (chosen) return chosen;
  if (paths.length > 0) return paths[0].path;
  return fallbackPath ?? null;
}

function polarityAt(statement, start, end) {
  const after = statement.slice(end);
  const before = statement.slice(0, start);
  const first = (text, pattern) => {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    return match ? match.index : -1;
  };
  const readAfter = first(after, READ_POLARITY);
  const unreadAfter = first(after, UNREAD_POLARITY);
  if (readAfter >= 0 || unreadAfter >= 0) {
    if (unreadAfter < 0) return 'read';
    if (readAfter < 0) return 'unread';
    return readAfter < unreadAfter ? 'read' : 'unread';
  }
  const last = (text, pattern) => {
    let index = -1;
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) index = match.index;
    return index;
  };
  return last(before, READ_POLARITY) > last(before, UNREAD_POLARITY) ? 'read' : 'unread';
}

/**
 * Every span in a statement, as the lines still to read.
 *
 * A span the author read becomes its complement when the file's end is known
 * (a denominator, or a later "through line N"); otherwise it is kept as a
 * `readRanges` entry so the action can say "beyond lines 141–220" rather than
 * send the reader back over them.
 */
function locateRanges(statement, paths, fallbackPath) {
  const spans = [];
  const masked = [];
  const push = (match, from, to, extra = {}) => {
    const tail = statement.slice(match.index + match[0].length);
    const explicit = PATH_AFTER.exec(tail);
    const explicitPath =
      explicit && looksLikePath(stripEdges(explicit[2]), { backticked: explicit[1] === '`' })
        ? stripEdges(explicit[2])
        : null;
    const path = explicitPath ?? pathForRange(match.index, paths, fallbackPath);
    if (!path) return;
    const denominator = DENOMINATOR_AFTER.exec(tail);
    spans.push({
      path,
      from,
      to: Math.max(from, to),
      polarity: polarityAt(statement, match.index, match.index + match[0].length),
      total: denominator ? toInteger(denominator[1]) : null,
      ...extra,
    });
  };
  for (const match of statement.matchAll(FROM_TO_PATTERN)) {
    masked.push([match.index, match.index + match[0].length]);
    const from = toInteger(match[1]);
    const to = toInteger(match[2]);
    if (Number.isFinite(from) && Number.isFinite(to)) push(match, from, to);
  }
  const isMasked = (index) => masked.some(([from, to]) => index >= from && index < to);
  for (const match of statement.matchAll(RANGE_PATTERN)) {
    if (isMasked(match.index)) continue;
    const from = toInteger(match[1]);
    if (!Number.isFinite(from)) continue;
    const to = match[2] === undefined ? from : toInteger(match[2]);
    if (!Number.isFinite(to)) continue;
    const boundOnly = match[2] === undefined && THROUGH_LINE.test(statement.slice(0, match.index));
    push(match, from, to, boundOnly ? { bound: true } : {});
  }

  const ranges = [];
  const readRanges = [];
  spans.sort((a, b) => a.from - b.from);
  for (const span of spans) {
    if (span.bound) continue;
    if (span.polarity === 'unread') {
      ranges.push({ path: span.path, from: span.from, to: span.to });
      continue;
    }
    readRanges.push({ path: span.path, from: span.from, to: span.to });
    const bound = spans.find(
      (other) => other.bound && other.path === span.path && other.from > span.to,
    );
    const end = span.total ?? bound?.from ?? null;
    if (span.from > 1 && span.total) ranges.push({ path: span.path, from: 1, to: span.from - 1 });
    if (end !== null && end > span.to) ranges.push({ path: span.path, from: span.to + 1, to: end });
  }
  return { ranges, readRanges };
}

/**
 * Which gap this statement records.
 *
 * Tested in the order the kinds are worked, so a sentence that says several
 * things lands on the most actionable one. A partial read beats a whole unread
 * file: the author who wrote "lines 1–110 of 2790 were read" left a bookmark,
 * and that bookmark is the cheapest thing in the queue.
 */
function classify(statement, { hasRange, hasReadRange }) {
  const unread =
    UNREAD_PHRASE.test(statement) ||
    OUTLINE_ONLY_PHRASE.test(statement) ||
    SURFACE_ONLY_PHRASE.test(statement);
  const unopened = UNOPENED_PHRASE.test(statement);
  if (hasRange) return 'unread-range';
  if (unread) return 'unread-file';
  if (unopened) return 'unopened-area';
  if (NOT_EXECUTED_PHRASE.test(statement)) return 'not-executed';
  if (UNVERIFIED_PHRASE.test(statement)) return 'unverified-claim';
  // "Only lines 141–220 were read" says the rest was not, without the words.
  if (hasReadRange) return 'unread-file';
  return 'other';
}

/** One sentence, so the row can be pasted into a plan without editing. */
function proposeAction({ slug, path, range, readRange }) {
  const tail =
    `then patch_concept ${slug} to state what it settled` +
    ' or to move the statement out of Uncertainty.';
  if (!path) return `Read the source behind ${slug}, ${tail}`;
  if (range) return `Read ${path} (lines ${range.from}–${range.to}), ${tail}`;
  if (readRange) {
    return `Read ${path} beyond lines ${readRange.from}–${readRange.to}, which were already read, ${tail}`;
  }
  return `Read ${path}, ${tail}`;
}

/**
 * The reads one node's uncertainty asks for.
 *
 * `path` is the node's own frontmatter path and is used only as an inheritance:
 * a statement that says something was not read without naming a file means the
 * file this node is about. That inheritance is deliberately narrow — an area
 * nobody opened, a command nobody ran and a claim nobody checked are not
 * automatically about the node's own entry point, so those kinds stay pathless
 * and say so rather than pointing a reader at the wrong file.
 */
export function extractUncertaintyReads({ slug, kind, path, body, title } = {}) {
  if (typeof slug !== 'string' || !slug) return [];
  const lines = uncertaintySectionLines({ kind, title, body });
  const rows = [];
  for (const line of lines) {
    const statement = String(line).replace(LEADING_MARKER, '').trim();
    if (!statement) continue;
    const located = locatePaths(statement);
    const preliminary = locateRanges(statement, located, path);
    const rowKind = classify(statement, {
      hasRange: preliminary.ranges.length > 0,
      hasReadRange: preliminary.readRanges.length > 0,
    });
    const inherits = rowKind === 'unread-file' || rowKind === 'unread-range';
    const keepSpans = located.length > 0 || inherits;
    const ranges = keepSpans ? preliminary.ranges : [];
    const readRanges = keepSpans ? preliminary.readRanges : [];
    const paths =
      located.length > 0
        ? located.map((entry) => entry.path)
        : inherits && typeof path === 'string' && path
          ? [path]
          : [];
    // A span's own file belongs in `paths` even when the sentence never wrote it.
    for (const span of [...ranges, ...readRanges]) {
      if (!paths.includes(span.path)) paths.push(span.path);
    }
    rows.push({
      slug,
      statement,
      paths,
      ranges,
      readRanges,
      kind: rowKind,
    });
  }
  return rows;
}

/**
 * The same rows, ordered and carrying the sentence that acts on them.
 *
 * Ordering lives here rather than in the caller so the CLI, the MCP response
 * and any later surface all read the same queue in the same order. Stable
 * within a kind and a slug, so a node whose uncertainty lists three things
 * keeps the order its author wrote them in.
 */
export function orderUncertaintyReads(rows) {
  return [...rows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const kindDelta =
        (KIND_ORDER.get(a.row.kind) ?? UNCERTAINTY_READ_KINDS.length) -
        (KIND_ORDER.get(b.row.kind) ?? UNCERTAINTY_READ_KINDS.length);
      if (kindDelta !== 0) return kindDelta;
      const slugDelta = String(a.row.slug).localeCompare(String(b.row.slug));
      if (slugDelta !== 0) return slugDelta;
      return a.index - b.index;
    })
    .map(({ row }) => ({
      slug: row.slug,
      kind: row.kind,
      statement: row.statement,
      paths: row.paths,
      ranges: row.ranges,
      readRanges: row.readRanges ?? [],
      proposedAction: proposeAction({
        slug: row.slug,
        // The range's own file wins over the first path named: a sentence that
        // mentions two files and bounds one of them means the bounded one.
        path: row.ranges[0]?.path ?? row.readRanges?.[0]?.path ?? row.paths[0] ?? null,
        range: row.ranges[0] ?? null,
        readRange: row.readRanges?.[0] ?? null,
      }),
    }));
}
