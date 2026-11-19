/**
 * The symbols a node says were not read, held to the read. A line such as
 * "`Config.loadConfig` body not read" names code that is one call away; when
 * the name resolves to a declaration in this repository, finalize asks for that
 * read by `{ path, symbol }` before it accepts the map, and afterwards for the
 * node to say what the read shows, or to keep one `## Uncertainty` line for that
 * symbol alone saying why it still cannot be read.
 *
 * The same honesty rules as the floors: only a symbol read this process served
 * counts (a context part, a line read or the sentence going away does not), a
 * line that names two symbols answers for neither, and a word in passing
 * ("Redis broadcaster") is no symbol. A line deleted before the read still owes
 * it: the claims seen this session are kept beside the reads.
 *
 * Every scan is one pass over each body line, lines over LINE_CHARS are
 * skipped, and the names looked up are capped, so the cost is linear in the
 * vault's text plus one pass over the cached declarations.
 */

import { declarationsNamed, productFiles } from '../evidence-search/declaration-index.mjs';
import { noteOwedReads, owedReads } from './session-reads.mjs';

const LINE_CHARS = 2000;
const TOKENS_PER_LINE = 16;
// Distinct names looked up in one measure; a vault naming more is listed in turns.
const NAMES = 128;
const LISTED = 16;
const REASON_WORDS = 3;

/** Wording that says code was not read: "not read", "never opened", "unread", "outlined only". */
const UNREAD = /(?:\bnot|\bnever|n't)\s+(?:yet\s+)?(?:been\s+)?(?:read|opened|traced|followed|inspected|examined)\b|\bunread\b|\boutlined\s+only\b|\bonly\s+outlined\b|\boutline\s+only\b/i;
/** "Members other than `Keep` not read": the symbol after these words is the one that was read. */
const EXCEPT = /\b(?:other\s+than|except(?:\s+for)?|besides|apart\s+from|aside\s+from)\b/gi;
const SPAN = /`([^`\n]{1,200})`/g;
const CHAIN = /^[A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*(?:\(\))?$/;
const WORD = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;
const SOURCE_EXTENSIONS = 'go|ts|tsx|js|jsx|mjs|cjs|py|pyi|rs|java|kt|rb|swift|cs|cpp|cc|c|h|hpp|php|scala';
// A run of path characters: one pass, each run tested once for a slash or a source extension.
const RUN = /[^\s`'"()<>,;]+/g;
const FILE_NAME = new RegExp(`\\.(?:${SOURCE_EXTENSIONS})(?:[:#]L?\\d+(?:[-–]L?\\d+)?)?$`);
// At most this many "other than" phrases are honoured in one clause.
const EXCEPTIONS = 8;
const REASON = /\b(?:because|since)\b(.*)$/i;

function kindOf(doc) {
  return typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
}

const isLower = (code) => (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
const isUpper = (code) => code >= 65 && code <= 90;

/** A bare word that is code by its shape: `camelCase`, `snake_case`, `_private`, `Owner.member`; one pass over its characters. */
function codeShaped(word) {
  if (word.length < 2) return false;
  if (word.includes('.')) return word.split('.').every((part) => part.length >= 2);
  if (word.charCodeAt(0) === 95) return true;
  for (let at = 1; at < word.length; at += 1) {
    const code = word.charCodeAt(at);
    const before = word.charCodeAt(at - 1);
    if (isUpper(code) && isLower(before)) return true;
    if (code === 95 && at + 1 < word.length && word.charCodeAt(at + 1) !== 95) return true;
  }
  return false;
}

/** `text` without its trailing dots and colons, in one backward pass. */
function trimmed(text) {
  let end = text.length;
  while (end > 0 && (text[end - 1] === '.' || text[end - 1] === ':')) end -= 1;
  return text.slice(0, end);
}

/** A cited path without its line (`api/auth.go:L12` -> `api/auth.go`). */
function withoutLine(path) {
  return trimmed(trimmed(path).replace(/[:#]L?\d+(?:[-–]L?\d+)?$/, '').replace(/^\.\//, ''));
}

/**
 * The symbol names and paths one clause gives as unread: every code span that
 * is one name (`Owner.member`, `fn()`), and every code-shaped bare word, except
 * what follows "other than" and its kin.
 */
function clauseNames(clause) {
  const excepted = [];
  for (const match of clause.matchAll(EXCEPT)) {
    if (excepted.length >= EXCEPTIONS) break;
    const rest = clause.slice(match.index);
    const stop = rest.search(/,|(?:\bnot|\bnever|n't)\s|\bunread\b/i);
    excepted.push([match.index, match.index + (stop > 0 ? stop : rest.length)]);
  }
  const kept = (at) => !excepted.some(([from, to]) => at >= from && at < to);
  const names = [];
  const paths = [];
  // Code spans and paths are blanked as they are taken, so what is left is prose.
  const prose = clause.replace(SPAN, (span, inner, offset) => {
    const code = inner.trim();
    if (code.includes('/') || FILE_NAME.test(code)) paths.push(withoutLine(code));
    else if (CHAIN.test(code) && kept(offset)) names.push(code.replace(/\(\)$/, '').replace(/::/g, '.'));
    return ' '.repeat(span.length);
  }).replace(RUN, (run) => {
    if (!run.includes('/') && !FILE_NAME.test(trimmed(run))) return run;
    paths.push(withoutLine(run));
    return ' '.repeat(run.length);
  });
  for (const match of prose.matchAll(WORD)) {
    if (codeShaped(match[0]) && kept(match.index)) names.push(match[0]);
  }
  return { names: [...new Set(names)].slice(0, TOKENS_PER_LINE), paths };
}

/**
 * Every body line that says code was not read, with the names it gives: the
 * line, the node, whether it sits under `## Uncertainty`, and its names and
 * paths. Fenced code is not prose.
 */
function claimLines(docs) {
  const lines = [];
  for (const doc of docs) {
    const kind = kindOf(doc);
    if (!kind || kind === 'vault-readme') continue;
    let section = '';
    let fenced = false;
    for (const line of String(doc.body ?? '').split('\n')) {
      if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) continue;
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      if (heading) section = heading[1];
      if (line.length > LINE_CHARS || !UNREAD.test(line)) continue;
      const names = [];
      const paths = [];
      for (const clause of line.split(/;|\.(?=\s|$)/)) {
        if (!UNREAD.test(clause)) continue;
        const found = clauseNames(clause);
        names.push(...found.names);
        paths.push(...found.paths);
      }
      if (names.length === 0) continue;
      const own = typeof doc.frontmatter?.path === 'string' ? withoutLine(doc.frontmatter.path.trim()) : null;
      lines.push({ slug: doc.slug, text: line, uncertainty: /^uncertainty$/i.test(section), names: [...new Set(names)].slice(0, TOKENS_PER_LINE), paths, own });
    }
  }
  return lines;
}

/**
 * The one declaration a written name resolves to: narrowed to a path its
 * clause gives, else to the node's own `path:` file when it declares the name.
 * A name still declared in two places names no one read, and resolves to none.
 */
function resolveName(name, paths, own, found) {
  let rows;
  if (name.includes('.')) {
    const parts = name.split('.');
    const owner = parts.at(-2);
    const member = parts.at(-1);
    // A Go method is declared as `Type.method`; a class method under its bare name, inside its class.
    rows = [...(found.get(name) ?? []), ...(found.get(member) ?? []).filter((row) => row.owner === owner)];
  } else {
    rows = found.get(name) ?? [];
  }
  const seen = new Set();
  rows = rows.filter((row) => !seen.has(`${row.path}\0${row.line}`) && seen.add(`${row.path}\0${row.line}`));
  const at = (path) => (row) => row.path === path || row.path.endsWith(`/${path}`);
  const named = rows.filter((row) => paths.some((path) => at(path)(row)));
  if (named.length > 0) rows = named;
  else if (own && rows.some(at(own))) rows = rows.filter(at(own));
  if (rows.length !== 1) return [];
  return rows.map((row) => ({
    path: row.path,
    line: row.line,
    name,
    symbol: row.name.includes('.') || !name.includes('.') ? row.name : name.split('.').slice(-2).join('.'),
  }));
}

/** Whether a symbol read (not a line read, not a part another read served) covers the declaration. */
function symbolRead(reads, row) {
  return (reads.get(row.path) ?? []).some((range) => !range.role && typeof range.symbol === 'string'
    && range.startLine <= row.line && row.line <= range.endLine);
}

/** A line that keeps a symbol as unread after its read: under `## Uncertainty`, that symbol alone, and why. */
function keptWithReason(line) {
  if (!line.uncertainty || line.rows.length !== 1) return false;
  const reason = REASON.exec(line.text);
  return Boolean(reason) && reason[1].split(/[^\p{L}\p{N}']+/u).filter((word) => word.length >= 2).length >= REASON_WORDS;
}

/**
 * The symbols nodes name as unread that resolve in this repository: which still
 * need their read, and which were read but are still said to be unread without
 * one line of their own that says why. Null without a grounded repository or
 * this process's reads.
 */
export function measureUnreadClaims(docs, repo, reads) {
  if (!repo?.repoRoot || !reads) return null;
  const lines = claimLines(docs);
  const owed = owedReads(repo.repoRoot);
  const wanted = new Set();
  const want = (name) => {
    if (wanted.size < NAMES) wanted.add(name);
  };
  for (const line of lines) {
    for (const name of line.names) {
      want(name);
      if (name.includes('.')) want(name.split('.').pop());
    }
  }
  for (const row of owed) want(row.symbol.split('.').pop());
  const files = repo.collection?.files?.filter((file) => file.class === 'product') ?? productFiles(repo.repoRoot);
  const found = declarationsNamed(repo.repoRoot, wanted, { files });

  const byKey = new Map();
  const add = (row, slug) => {
    const key = `${row.path}\0${row.line}`;
    const held = byKey.get(key) ?? { ...row, slugs: new Set(), lines: [] };
    if (slug) held.slugs.add(slug);
    byKey.set(key, held);
    return held;
  };
  // One resolution per name and the paths it is read against: a vault repeating a name pays once.
  const resolved = new Map();
  for (const line of lines) {
    const rows = new Map();
    for (const name of line.names) {
      if (!wanted.has(name)) continue;
      const key = `${name}\0${line.paths.join('\0')}\0${line.own ?? ''}`;
      if (!resolved.has(key)) resolved.set(key, resolveName(name, line.paths, line.own, found));
      for (const row of resolved.get(key)) rows.set(`${row.path}\0${row.line}`, row);
    }
    line.rows = [...rows.values()];
    for (const row of line.rows) add(row, line.slug).lines.push(line);
  }
  noteOwedReads(repo.repoRoot, [...byKey.values()]);
  // A claim seen earlier this session still owes its read while its declaration stands.
  for (const row of owed) {
    const key = `${row.path}\0${row.line}`;
    if (byKey.has(key)) continue;
    const stands = (found.get(row.symbol.split('.').pop()) ?? []).some((held) => held.path === row.path && held.line === row.line);
    if (stands) add(row, null);
  }

  const toRead = [];
  const toPatch = [];
  for (const row of byKey.values()) {
    const slugs = [...row.slugs].sort();
    if (!symbolRead(reads, row)) {
      toRead.push({ name: row.name, path: row.path, line: row.line, symbol: row.symbol, slugs });
      continue;
    }
    const open = row.lines.filter((line) => !keptWithReason(line));
    if (open.length > 0) toPatch.push({ name: row.name, path: row.path, line: row.line, symbol: row.symbol, slugs: [...new Set(open.map((line) => line.slug))].sort() });
  }
  const order = (a, b) => a.path.localeCompare(b.path) || a.line - b.line;
  return { claims: byKey.size, toRead: toRead.sort(order), toPatch: toPatch.sort(order) };
}

function listed(rows, render) {
  const shown = rows.slice(0, LISTED).map(render);
  return `${shown.join('; ')}${rows.length > shown.length ? `; and ${rows.length - shown.length} more` : ''}`;
}

const at = (row) => `${row.name} (${row.path}:L${row.line}${row.slugs.length > 0 ? `, said unread in ${row.slugs.join(', ')}` : ', said unread earlier this session'})`;

/** The read that answers each listed symbol, by the exact `{ path, symbol }` the check accepts. */
function readCall(rows) {
  const selectors = rows.slice(0, LISTED).map((row) => ({ path: row.path, symbol: row.symbol }));
  return `analyze_repo_structure(${JSON.stringify({ sourceOnly: true, sourceReads: selectors })})`;
}

/** What the node must say once the read is made; the check accepts exactly this. */
const KEEP_OR_WRITE = 'patch_concept each node it names: write what the read shows and drop the line that says it was not read, or keep one line under ## Uncertainty for that symbol alone that names it and says why it still cannot be read after "because"';

/** The sentences the coverage line and finalize's refusal give, or [] when nothing is owed. */
export function unreadClaimParts(unread) {
  if (!unread) return [];
  const parts = [];
  if (unread.toRead.length > 0) {
    const one = unread.toRead.length === 1;
    parts.push(`Unread: ${unread.toRead.length} ${one ? 'symbol a node says was not read is' : 'symbols a node says were not read are'} declared in this repository, one read away: ${listed(unread.toRead, at)}. Next: ${readCall(unread.toRead)}, then ${KEEP_OR_WRITE}.`);
  }
  if (unread.toPatch.length > 0) {
    parts.push(`Read, still said unread: ${listed(unread.toPatch, at)}. Next: ${KEEP_OR_WRITE}.`);
  }
  return parts;
}

/** finalize_project_meaning's refusal while a node names a symbol it could have read, or null. */
export function unreadClaimRefusal(unread) {
  const parts = unreadClaimParts(unread);
  if (parts.length === 0) return null;
  const count = unread.toRead.length + unread.toPatch.length;
  return [
    `finalize_project_meaning blocked: ${count} ${count === 1 ? 'symbol the vault says was not read is' : 'symbols the vault says were not read are'} in this repository. A reader who asks about them gets "not read" where one read gives the answer.`,
    ...parts.map((part) => `- ${part}`),
    'Make those calls, then call finalize_project_meaning again. Marking a competency row partial does not lift this: the read does.',
  ].join('\n');
}
