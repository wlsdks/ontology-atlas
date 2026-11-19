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
export const LINK_KEY_MAX_CHARS = 512;

/** Characters a link target the index answers for cannot hold: each ends or delimits a link form. */
const LINK_NEEDLE_STOP = /[\]#|(\n]/;

const SEPARATOR = '\n';

/**
 * Every string `needle` for which the body holds `[[needle]]`, `[[needle#`,
 * `[[needle|`, `(needle.md` or `/needle.md`, for a needle that
 * {@link isIndexedLinkNeedle} accepts, joined as `\n` + keys + `\n` (null when none).
 * For such a needle `]`, `#` and `|` can only end the wiki form, so the first of them
 * after each `[[` fixes its one possible end; walking back from each `.md`, every `/`
 * and the nearest `(` start one, and `(`, `]`, `#`, `|` or a newline cannot be inside it.
 * One string per document, copied out of the text so it keeps none of it alive.
 * Cost: O(body length + LINK_KEY_MAX_CHARS × links).
 */
export function bodyLinkKeys(body) {
  const keys = new Set();
  for (let open = body.indexOf('[['); open !== -1; open = body.indexOf('[[', open + 1)) {
    const from = open + 2;
    const limit = Math.min(body.length, from + LINK_KEY_MAX_CHARS + 1);
    for (let at = from; at < limit; at += 1) {
      const code = body.charCodeAt(at);
      if (code === 0x5d) {
        if (body.charCodeAt(at + 1) === 0x5d) keys.add(body.slice(from, at));
        break;
      }
      if (code === 0x23 || code === 0x7c) {
        keys.add(body.slice(from, at));
        break;
      }
      // A key never holds the separator, so no key can read as two.
      if (code === 0x0a) break;
    }
  }
  for (let ext = body.indexOf('.md'); ext !== -1; ext = body.indexOf('.md', ext + 1)) {
    const floor = Math.max(0, ext - LINK_KEY_MAX_CHARS - 1);
    for (let at = ext - 1; at >= floor; at -= 1) {
      const code = body.charCodeAt(at);
      if (code === 0x2f || code === 0x28) keys.add(body.slice(at + 1, ext));
      if (code === 0x28 || code === 0x5d || code === 0x23 || code === 0x7c || code === 0x0a) break;
    }
  }
  if (keys.size === 0) return null;
  // Each key is a slice of the body, and a join or concatenation may keep the slice
  // (and so the whole text) inside the result; the round trip copies it out.
  return JSON.parse(JSON.stringify(`${SEPARATOR}${[...keys].join(SEPARATOR)}${SEPARATOR}`));
}

/** Whether {@link bodyLinkKeys} answers for `needle` exactly. */
export function isIndexedLinkNeedle(needle) {
  return typeof needle === 'string'
    && needle.length > 0
    && needle.length <= LINK_KEY_MAX_CHARS
    && !LINK_NEEDLE_STOP.test(needle);
}

/** Whether the keys {@link bodyLinkKeys} returned hold `needle`. */
export function linkKeysHold(keys, needle) {
  return keys !== null && keys.includes(`${SEPARATOR}${needle}${SEPARATOR}`);
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
const SIGNATURE_RUNS = [3, 5];
const MIN_SIGNATURE_BITS = 256;
const MAX_SIGNATURE_BITS = 65_536;

function runBit(text, at, length, mask) {
  let hash = Math.imul(length, 0x9e3779b1);
  for (let offset = 0; offset < length; offset += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(at + offset), 0x85ebca77) + offset;
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  return hash & mask;
}

export function evidenceSignature(lowered) {
  if (lowered.length < SIGNATURE_RUNS[0]) return null;
  let bits = MIN_SIGNATURE_BITS;
  while (bits < lowered.length && bits < MAX_SIGNATURE_BITS) bits *= 2;
  const table = new Uint32Array(bits >>> 5);
  const mask = bits - 1;
  for (const length of SIGNATURE_RUNS) {
    for (let at = 0; at + length <= lowered.length; at += 1) {
      const bit = runBit(lowered, at, length, mask);
      table[bit >>> 5] |= 1 << (bit & 31);
    }
  }
  return table;
}

/**
 * Whether a body with this {@link evidenceSignature} may contain `needle` (already
 * lowercased): false only when it cannot.
 */
export function signatureMayContain(table, needle) {
  if (needle.length < SIGNATURE_RUNS[0]) return true;
  if (table === null) return false;
  const mask = table.length * 32 - 1;
  for (const length of SIGNATURE_RUNS) {
    for (let at = 0; at + length <= needle.length; at += 1) {
      const bit = runBit(needle, at, length, mask);
      if ((table[bit >>> 5] & (1 << (bit & 31))) === 0) return false;
    }
  }
  return true;
}
