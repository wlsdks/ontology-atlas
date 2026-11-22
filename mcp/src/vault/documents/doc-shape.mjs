// What the document cache computes from a file's text while it holds it, so the
// text can be let go: the frontmatter fence's shape, where the body starts, the
// body's link targets and a fingerprint find_evidence filters by.

/**
 * How the file opens, as `validateVaultDocument` reads it after stripping a BOM
 * and folding CRLF: `empty` (no bytes), `plain` (no `---` fence), `unclosed` (a
 * fence that never closes) or `framed`. Folding CRLF neither makes nor removes a
 * `\n---`, and none can start inside the opening `---`, so the text is not copied.
 */
export function rawShapeOf(raw) {
  if (raw === '') return 'empty';
  const start = raw.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (!raw.startsWith('---', start)) return 'plain';
  return raw.indexOf('\n---', start + 3) === -1 ? 'unclosed' : 'framed';
}

/**
 * Where `parseFrontmatter(raw).body` starts in `raw`, or -1 when the parser's
 * normalization (stripping a BOM, folding CRLF) moves it and the text must be
 * parsed again to find it. The body is always a suffix of the normalized text.
 */
export function bodyStartOf(raw, body) {
  if (raw.charCodeAt(0) === 0xfeff || raw.includes('\r\n')) return -1;
  return raw.length - body.length;
}

/** The longest link target the index answers for; a longer needle reads the body. */
const LINK_KEY_MAX_CHARS = 512;

/** Characters a link target the index answers for cannot hold: each ends or delimits a link form. */
const LINK_NEEDLE_STOP = /[\]#|(\n]/;

const SEPARATOR = '\n';

/**
 * What {@link bodyLinkKeys} returns for a body whose link targets cost more than its
 * work budget to list: every needle then reads the body.
 */
export const LINKS_UNINDEXED = false;

/**
 * Characters {@link bodyLinkKeys} may scan and copy per character of body, plus a
 * floor. A body of ordinary links costs about three per character, so only text
 * built to make the backward walks overlap (`/a.md` repeated) reaches it.
 */
const LINK_WORK_PER_CHAR = 8;
const LINK_WORK_FLOOR = 4096;

/** `]`, `#`, `|` or a newline: the characters that end a wiki link's target. */
function endsWikiTarget(code) {
  return code === 0x5d || code === 0x23 || code === 0x7c || code === 0x0a;
}

/**
 * Every string `needle` for which the body holds `[[needle]]`, `[[needle#`,
 * `[[needle|`, `(needle.md` or `/needle.md`, for a needle that
 * {@link isIndexedLinkNeedle} accepts, joined as `\n` + keys + `\n` (null when none).
 * For such a needle `]`, `#` and `|` can only end the wiki form, so the first of them
 * after each `[[` fixes its one possible end; walking back from each `.md`, every `/`
 * and the nearest `(` start one, and `(`, `]`, `#`, `|` or a newline cannot be inside it.
 * One string per document, copied out of the text so it keeps none of it alive.
 * Cost: linear in the body. The `[[` ends are found with one forward pointer; the
 * backward walks and the keys copied are counted, and a body that spends more than
 * {@link LINK_WORK_PER_CHAR} per character on them returns {@link LINKS_UNINDEXED}.
 * `meter.scanned`, when a meter is passed, is set to the characters the forward
 * and backward walks examined.
 */
export function bodyLinkKeys(body, meter) {
  const keys = new Set();
  let budget = LINK_WORK_FLOOR + LINK_WORK_PER_CHAR * body.length;
  let scanned = 0;
  const finish = (result) => {
    if (meter) meter.scanned = scanned;
    return result;
  };
  const add = (from, to) => {
    budget -= to - from;
    keys.add(body.slice(from, to));
  };
  // The first character at or after the current `[[` that ends a wiki target; `[[`
  // positions only grow, so it only moves forward.
  let end = -1;
  for (let open = body.indexOf('[['); open !== -1; open = body.indexOf('[[', open + 1)) {
    const from = open + 2;
    if (end < from) {
      end = from;
      while (end < body.length && !endsWikiTarget(body.charCodeAt(end))) end += 1;
      scanned += end - from;
    }
    if (end >= body.length || end - from > LINK_KEY_MAX_CHARS) continue;
    const code = body.charCodeAt(end);
    // A key never holds the separator, so no key can read as two.
    if (code === 0x0a) continue;
    if (code !== 0x5d || body.charCodeAt(end + 1) === 0x5d) add(from, end);
    if (budget < 0) return finish(LINKS_UNINDEXED);
  }
  for (let ext = body.indexOf('.md'); ext !== -1; ext = body.indexOf('.md', ext + 1)) {
    const floor = Math.max(0, ext - LINK_KEY_MAX_CHARS - 1);
    let at = ext - 1;
    for (; at >= floor; at -= 1) {
      const code = body.charCodeAt(at);
      if (code === 0x2f || code === 0x28) add(at + 1, ext);
      if (code === 0x28 || endsWikiTarget(code)) break;
    }
    budget -= ext - at;
    scanned += ext - at;
    if (budget < 0) return finish(LINKS_UNINDEXED);
  }
  if (keys.size === 0) return finish(null);
  // Each key is a slice of the body, and a join or concatenation may keep the slice
  // (and so the whole text) inside the result; the round trip copies it out.
  return finish(JSON.parse(JSON.stringify(`${SEPARATOR}${[...keys].join(SEPARATOR)}${SEPARATOR}`)));
}

/**
 * Whether the keys {@link bodyLinkKeys} returned answer for `needle` exactly; when
 * not, the caller reads the body.
 */
export function linkIndexAnswers(keys, needle) {
  return keys !== LINKS_UNINDEXED && isIndexedLinkNeedle(needle);
}

function isIndexedLinkNeedle(needle) {
  return typeof needle === 'string'
    && needle.length > 0
    && needle.length <= LINK_KEY_MAX_CHARS
    && !LINK_NEEDLE_STOP.test(needle);
}

export function linkKeysHold(keys, needle) {
  return typeof keys === 'string' && keys.includes(`${SEPARATOR}${needle}${SEPARATOR}`);
}

/**
 * A fingerprint of the lowercased body for find_evidence: every run of three and of
 * five characters sets one bit in a table of about one bit per character (256 to
 * 65,536 bits). A body holding a needle holds each of the needle's runs, so a bit
 * the needle needs and the table lacks proves the needle absent and the body is
 * not read. Runs of five carry which words follow which, so a phrase of common
 * words is still ruled out. A body past 65,536 characters fills its table and is
 * always read; a needle under three characters filters nothing. Null when the
 * body is too short to hold any needle the table answers for.
 */
const SHORT_RUN = 3;
const LONG_RUN = 5;
const MIN_SIGNATURE_BITS = 256;
const MAX_SIGNATURE_BITS = 65_536;

/** The multiplier of the polynomial run hash, and its powers that drop a run's first character. */
const RUN_BASE = 0x01000193;
const SHORT_DROP = Math.imul(RUN_BASE, RUN_BASE);
const LONG_DROP = Math.imul(SHORT_DROP, SHORT_DROP);

function mixChar(code) {
  const hash = Math.imul(code ^ 0x9e3779b9, 0x85ebca77);
  return hash ^ (hash >>> 13);
}

function runBit(hash, length, mask) {
  let bit = hash ^ Math.imul(length, 0x9e3779b1);
  bit ^= bit >>> 15;
  bit = Math.imul(bit, 0x2c1b3c6d);
  bit ^= bit >>> 12;
  bit = Math.imul(bit, 0x297a2d39);
  bit ^= bit >>> 15;
  return bit & mask;
}

/**
 * Calls `visit(bit)` for every run of three and of five characters in `text`. Each
 * character is mixed once and enters both runs' rolling hashes, which drop the
 * character leaving the run with one multiply each.
 */
function forEachRunBit(text, mask, visit) {
  const mixed = new Int32Array(LONG_RUN);
  let short = 0;
  let long = 0;
  for (let at = 0; at < text.length; at += 1) {
    const value = mixChar(text.charCodeAt(at));
    const slot = at % LONG_RUN;
    if (at >= SHORT_RUN) short = (short - Math.imul(mixed[(at - SHORT_RUN) % LONG_RUN], SHORT_DROP)) | 0;
    if (at >= LONG_RUN) long = (long - Math.imul(mixed[slot], LONG_DROP)) | 0;
    mixed[slot] = value;
    short = (Math.imul(short, RUN_BASE) + value) | 0;
    long = (Math.imul(long, RUN_BASE) + value) | 0;
    if (at >= SHORT_RUN - 1) visit(runBit(short, SHORT_RUN, mask));
    if (at >= LONG_RUN - 1) visit(runBit(long, LONG_RUN, mask));
  }
}

/** `body.toLowerCase()`, but without the copy when the body is ASCII with no capital. */
function lowered(body) {
  for (let at = 0; at < body.length; at += 1) {
    const code = body.charCodeAt(at);
    if (code >= 0x80 || (code >= 0x41 && code <= 0x5a)) return body.toLowerCase();
  }
  return body;
}

/** The fingerprint of `body` as find_evidence matches it, lowercased. */
export function evidenceSignature(body) {
  if (body.length < SHORT_RUN) return null;
  const text = lowered(body);
  let bits = MIN_SIGNATURE_BITS;
  while (bits < text.length && bits < MAX_SIGNATURE_BITS) bits *= 2;
  const table = new Uint32Array(bits >>> 5);
  forEachRunBit(text, bits - 1, (bit) => {
    table[bit >>> 5] |= 1 << (bit & 31);
  });
  return table;
}

/**
 * Whether a body with this {@link evidenceSignature} may contain `needle` (already
 * lowercased): false only when it cannot.
 */
export function signatureMayContain(table, needle) {
  if (needle.length < SHORT_RUN) return true;
  if (table === null) return false;
  let present = true;
  forEachRunBit(needle, table.length * 32 - 1, (bit) => {
    if ((table[bit >>> 5] & (1 << (bit & 31))) === 0) present = false;
  });
  return present;
}
