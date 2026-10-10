// Synchronous fs throughout `vault/`: MCP tool calls are infrequent, so async buys nothing.

import { closeSync, fstatSync, openSync, readFileSync, statSync } from 'node:fs';
import { parseFrontmatter } from '../parser.mjs';

import { pathToSlug, walkMd } from './slug-paths.mjs';

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

/** Reads bytes and metadata together from one open file, and confirms the current path is still that file. */
function readStableFileSnapshot(filePath) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor = null;
    try {
      descriptor = openSync(filePath, 'r');
      const before = fstatSync(descriptor);
      const raw = readFileSync(descriptor, 'utf-8');
      const after = fstatSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      const currentPath = statSync(filePath);
      if (sameFileSnapshot(before, after) && sameFileSnapshot(after, currentPath)) {
        return { raw, mtime: after.mtimeMs };
      }
    } catch (error) {
      lastError = error;
    } finally {
      if (descriptor !== null) {
        try {
          closeSync(descriptor);
        } catch {
          /* already closed */
        }
      }
    }
  }
  const reason = lastError?.message ? ` (${lastError.message})` : '';
  throw new Error(`Could not capture a stable file snapshot: ${filePath}${reason}`);
}

/**
 * The first prose paragraph, so get_concept previews a sentence a person wrote
 * rather than table or code syntax; falls back to the raw body when no prose exists.
 */
export function extractSummaryExcerpt(body, maxLen = 800) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const lines = body.split('\n');
  const isBlockStart = (line) => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (trimmed.startsWith('```')) return true;
    if (trimmed.startsWith('|')) return true;
    if (trimmed.startsWith('#')) return true;
    if (trimmed.startsWith('![')) return true;
    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) return true; // thematic break
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return true;
    if (/^\d+[.)]\s+/.test(trimmed)) return true; // ordered list
    if (trimmed.startsWith('> ')) return true;
    return false;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || isBlockStart(line)) {
      if (trimmed.startsWith('```')) {
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) i += 1;
      }
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (cur.trim() === '' || isBlockStart(cur)) break;
      para.push(cur.trim());
      i += 1;
    }
    if (para.length > 0) {
      const text = para.join(' ');
      return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
    }
  }
  const trimmedBody = body.trim();
  return trimmedBody.length > maxLen
    ? trimmedBody.slice(0, maxLen).trimEnd() + '…'
    : trimmedBody;
}

/**
 * Cap for `body: 'full'`: a vault `.md` can be a pasted log of hundreds of KB,
 * and one document must not fill an agent's context. Measured bodies run 1–3 KB;
 * anything cut is reported by {@link describeBodyDelivery}.
 */
export const FULL_BODY_MAX_CHARS = 40_000;

/**
 * Row cap for one `get_concepts({ body: "full" })`, narrower than the batch cap
 * of 50. Builders of runnable read workflows (meaning repair) must use this
 * value, or they emit a call the server rejects.
 */
export const GET_CONCEPTS_FULL_BODY_MAX = 20;

/**
 * Reports how much body was returned and what was withheld: the construction
 * rules put evidence and boundaries in the body, so a silent cut hides what an
 * agent must read. Only a cut response carries a `hint` naming the follow-up call.
 */
export function describeBodyDelivery(body, options = {}) {
  const { mode = 'excerpt', maxLen = 800, hint } = options;
  const source = typeof body === 'string' ? body : '';
  const totalChars = source.length;
  let text;
  if (mode === 'full') {
    text =
      totalChars > FULL_BODY_MAX_CHARS
        ? source.slice(0, FULL_BODY_MAX_CHARS)
        : source;
  } else {
    text = extractSummaryExcerpt(source, maxLen);
  }
  // An excerpt joins lines with spaces, so compare with whitespace normalised: a
  // one-paragraph body delivered whole must not read as truncated.
  const returnedChars = text.length;
  const flatten = (value) => value.replace(/\s+/g, ' ').trim();
  const truncated =
    mode === 'full'
      ? totalChars > FULL_BODY_MAX_CHARS
      : flatten(text) !== flatten(source);
  const info = { mode, totalChars, returnedChars, truncated };
  if (truncated) {
    info.omittedChars = Math.max(0, totalChars - returnedChars);
    if (hint) info.hint = hint;
  }
  return { text, info };
}

/** Reads one `.md`; its `mtime` passed as a later `expectedMtime` enables conflict detection. */
export function readDoc(rootPath, filePath) {
  const snapshot = readStableFileSnapshot(filePath);
  const raw = snapshot.raw;
  const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
  const result = {
    slug: pathToSlug(rootPath, filePath),
    frontmatter,
    body,
    raw,
    mtime: snapshot.mtime,
  };
  if (diagnostics?.length) result.diagnostics = diagnostics;
  return result;
}

/** Every doc in the vault; the caller filters. */
export function loadVaultDocs(rootPath) {
  const files = walkMd(rootPath);
  return files.map((path) => readDoc(rootPath, path));
}

export function docTitle(doc) {
  if (typeof doc?.frontmatter?.title === 'string' && doc.frontmatter.title.trim()) {
    return doc.frontmatter.title;
  }
  if (typeof doc?.frontmatter?.name === 'string' && doc.frontmatter.name.trim()) {
    return doc.frontmatter.name;
  }
  return doc?.slug;
}
