/**
 * The parts the server listed for a node's evidence and never served. A symbol
 * read lists more than it serves: the callees it found by import, the parts its
 * budget left out, and where a declaration it was cut inside goes on. When a
 * capability or element cites lines of such a read, what that read listed and
 * no read this process made has served is code the node leans on unread. The
 * record of reads decides this, not the node's wording: saying less, or saying
 * "None", changes nothing; reading the part does.
 *
 * A part the server refuses to read for a reason that lasts while the file is
 * unchanged (an encoding, a size, a path it never opens) is the one exception:
 * an `## Uncertainty` line on the node that names the part and gives the
 * server's reason answers it, and the message offers that line word for word.
 *
 * Every string a message prints that came from the repository or the vault
 * passes through `repoText`, and the read call is JSON with format characters
 * escaped, so a file name cannot start a line of its own. The cost is one pass
 * over each node's cites and the ranges of the files they name.
 */

import { oneLineJson, repoText } from '../analyze/repo-text.mjs';

const NODE_KINDS = new Set(['capability', 'element']);
const LINE_CHARS = 2000;
// Unserved parts kept per node and reads offered in one call; the rest are counted.
const PER_NODE = 64;
const LISTED = 16;

const lastSegment = (name) => String(name).split('.').pop();
const kindOf = (doc) => (typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '');

/** The non-blank lines under `## Uncertainty`, in one pass; lines past the cap are skipped. */
function uncertaintyLines(body) {
  const lines = [];
  let inside = false;
  for (const line of String(body ?? '').split('\n')) {
    if (line.length > LINE_CHARS) continue;
    if (line.startsWith('## ') || line.startsWith('##\t')) {
      inside = /^uncertainty$/i.test(line.slice(3).trim());
      continue;
    }
    if (inside && line.trim()) lines.push(line);
  }
  return lines;
}

/** "None", "Nothing" or no line at all: the node says nothing is missing. */
const saysComplete = (lines) => lines.every((line) => /^\s*(?:[-*]\s*)?(?:none|nothing|n\/a)\b/i.test(line));

const wordChar = (char) => char !== undefined && /[\w$]/.test(char);

/** Whether `word` stands in `text` as a whole identifier; one indexOf walk. */
function namesWord(text, word) {
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
    if (!wordChar(text[at - 1]) && !wordChar(text[at + word.length])) return true;
  }
  return false;
}

/** Letters and digits only, so `invalid_utf8` and "invalid UTF-8" compare equal. */
const bare = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Whether a read served the listed part: a range covers its line and goes past
 * it, or is a read of that very symbol; for the rest of a cut declaration, any
 * range from where it goes on.
 */
function served(reads, item) {
  return (reads.get(item.path) ?? []).some((range) => range.startLine <= item.line && item.line <= range.endLine
    && (Boolean(item.next) || range.endLine > item.line || (typeof range.symbol === 'string' && lastSegment(range.symbol) === lastSegment(item.name))));
}

/** The lasting reason this server refused a symbol read of the part, or null. */
function refusedBecause(reads, item) {
  const symbols = reads.refused?.get(item.path);
  if (!symbols) return null;
  if (item.next) return symbols.get(`L${item.line}`) ?? null;
  if (symbols.has(item.name)) return symbols.get(item.name);
  for (const [symbol, reason] of symbols) if (lastSegment(symbol) === lastSegment(item.name)) return reason;
  return null;
}

/**
 * Per capability or element whose cites name lines of a recorded symbol read:
 * the parts that read listed and no read served, split into those still to
 * read and those the server refused.
 *
 * @param {object[]} docs vault documents
 * @param {Map<string, object[]> | null} reads `sessionReads(root)`
 * @param {(text: string) => { path: string, startLine: number, endLine: number }[]} citesOf the line cites in a text
 * @returns {{ nodes: object[] } | null} null without this session's reads
 */
export function measureUnservedParts(docs, reads, citesOf) {
  if (!reads) return null;
  const nodes = [];
  for (const doc of docs) {
    if (!NODE_KINDS.has(kindOf(doc))) continue;
    const evidence = new Set();
    for (const cite of citesOf(doc.body)) {
      for (const range of reads.get(cite.path) ?? []) {
        if (!range.role && Array.isArray(range.listed) && range.startLine <= cite.endLine && cite.startLine <= range.endLine) evidence.add(range);
      }
    }
    const items = new Map();
    for (const range of evidence) {
      for (const item of range.listed) {
        const key = `${item.path}\0${item.line}\0${item.name}`;
        if (items.size < PER_NODE && !items.has(key) && !served(reads, item)) items.set(key, item);
      }
    }
    if (items.size === 0) continue;
    const lines = uncertaintyLines(doc.body);
    const toRead = [];
    const refused = [];
    for (const item of items.values()) {
      const reason = refusedBecause(reads, item);
      if (!reason) toRead.push(item);
      else if (!lines.some((line) => namesWord(line, lastSegment(item.name)) && bare(line).includes(bare(reason)))) refused.push({ ...item, reason });
    }
    if (toRead.length > 0 || refused.length > 0) nodes.push({ slug: doc.slug, complete: saysComplete(lines), toRead, refused });
  }
  return { nodes: nodes.sort((left, right) => (left.slug < right.slug ? -1 : 1)) };
}

const at = (item) => (item.next
  ? `the rest of ${repoText(item.name, 120)} from ${repoText(`${item.path}:L${item.line}`)}`
  : `${repoText(item.name, 120)} (${repoText(`${item.path}:L${item.line}`)})`);

function listed(rows, render, separator = ', ') {
  const shown = rows.slice(0, LISTED).map(render);
  const more = rows.length - shown.length;
  return `${shown.join(separator)}${more > 0 ? `${separator}and ${more} more` : ''}`;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** The read that serves each part: by symbol, or from the line where a cut declaration goes on. */
function readCall(items) {
  const selectors = new Map();
  for (const item of items) {
    const selector = item.next ?? { path: item.path, symbol: item.name };
    const key = oneLineJson(selector);
    if (selectors.size < LISTED && !selectors.has(key)) selectors.set(key, selector);
  }
  return `analyze_repo_structure(${oneLineJson({ sourceOnly: true, sourceReads: [...selectors.values()] })})`;
}

/** The line a refusal allows, offered word for word. */
const refusedLine = (item) => `- \`${repoText(item.name, 120)}\` cannot be read: the server refuses ${repoText(item.path)} (${repoText(item.reason, 40)}).`;

/** The coverage-line parts for the unserved parts; none when every listed part was served. */
export function unservedPartsLines(unserved) {
  if (!unserved) return [];
  const parts = [];
  const reading = unserved.nodes.filter((node) => node.toRead.length > 0);
  if (reading.length > 0) {
    const count = reading.reduce((sum, node) => sum + node.toRead.length, 0);
    parts.push(`Unserved: ${plural(count, 'part', 'parts')} the server listed for the reads ${plural(reading.length, 'node cites', 'nodes cite')} ${count === 1 ? 'was' : 'were'} never served: ${listed(reading, (node) => `${repoText(node.slug, 120)}: ${listed(node.toRead, at)}`, '; ')}. Next: ${readCall(reading.flatMap((node) => node.toRead))}, then patch_concept each node with what the reads show. Rewording the node does not lift this: the read does.`);
  }
  const complete = unserved.nodes.filter((node) => node.complete);
  if (complete.length > 0) {
    parts.push(`Said complete: ${listed(complete, (node) => repoText(node.slug, 120))} ${complete.length === 1 ? 'says' : 'say'} nothing is missing under ## Uncertainty while parts its cited reads listed were never served; that completeness claim is false until they are read.`);
  }
  const refusing = unserved.nodes.filter((node) => node.refused.length > 0);
  if (refusing.length > 0) {
    const items = refusing.flatMap((node) => node.refused);
    parts.push(`Refused by this server, so no read will come: ${listed(refusing, (node) => `${repoText(node.slug, 120)}: ${listed(node.refused, (item) => `${at(item)}: ${repoText(item.reason, 40)}`)}`, '; ')}. Next: patch_concept each node to keep one line under ## Uncertainty that names the part and gives the server's reason, such as ${listed(items, refusedLine)}`);
  }
  return parts;
}

/** The finalize refusal for unserved parts, or null when there are none. */
export function unservedPartsRefusal(unserved) {
  const parts = unservedPartsLines(unserved);
  if (parts.length === 0) return null;
  const count = unserved.nodes.reduce((sum, node) => sum + node.toRead.length + node.refused.length, 0);
  return [
    `finalize_project_meaning blocked: ${plural(count, 'part', 'parts')} the server listed for the lines ${plural(unserved.nodes.length, 'node cites', 'nodes cite')} ${count === 1 ? 'was' : 'were'} never served. A reader who asks about them gets an answer that stops where the reads stopped.`,
    ...parts.map((part) => `- ${part}`),
    'Make those calls, then call finalize_project_meaning again. Marking a competency row partial does not lift this: the read does.',
  ].join('\n');
}
