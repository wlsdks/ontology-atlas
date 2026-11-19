/**
 * Where each declared name lives across a repository's product files, so a symbol
 * read can say which file a callee is in and the next read can follow it by name.
 * Built lazily on the first symbol read that needs it, from the same walk the
 * breadth map uses (no symlinks, no hidden or credential files). Declarations are
 * kept per file by size and mtime so a later call outlines only what changed; texts
 * are kept within a character budget.
 */

import { readFileSync } from 'node:fs';

import { collectSourceUnits } from '../analyze/source-units.mjs';
import { outlineSource } from './source-outline.mjs';

const MAX_INDEXED_BYTES = 256 * 1024;
// Declarations and a small filter of the identifiers a file names are kept for
// every file. Whole texts, which only call-site search needs, are kept up to this
// many characters, least recently used first out, and re-read from disk past it;
// the filter means only files that may name the symbol are re-read.
const TEXT_CACHE_CHARS = 4 * 1024 * 1024;
const FILE_LIMIT = 20_000;
const DECLARATIONS = new Map();
const TEXTS = new Map();
let textChars = 0;

const stampOf = (file) => `${file.size}\0${file.mtimeMs}`;

function forgetText(abs) {
  const held = TEXTS.get(abs);
  if (!held) return;
  textChars -= held.text.length;
  TEXTS.delete(abs);
}

/** One product file's text, '' past the size cap or when unreadable. */
function textOf(file) {
  const stamp = stampOf(file);
  const held = TEXTS.get(file.abs);
  if (held?.stamp === stamp) {
    TEXTS.delete(file.abs);
    TEXTS.set(file.abs, held);
    return held.text;
  }
  forgetText(file.abs);
  if (file.size > MAX_INDEXED_BYTES) return '';
  let text = '';
  try {
    text = readFileSync(file.abs, 'utf8');
  } catch {
    return '';
  }
  TEXTS.set(file.abs, { stamp, text });
  textChars += text.length;
  for (const abs of TEXTS.keys()) {
    if (textChars <= TEXT_CACHE_CHARS) break;
    forgetText(abs);
  }
  return text;
}

const isStart = (code) => (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
const isPart = (code) => isStart(code) || (code >= 48 && code <= 57);

/** Three bit positions for an identifier's two running hashes in a filter of `bits` bits. */
function positions(a, b, bits) {
  const mask = bits - 1;
  return [(a >>> 0) & mask, ((a + b) >>> 0) & mask, ((a + 2 * b) >>> 0) & mask];
}

function hashes(name) {
  let a = 2166136261;
  let b = 5381;
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    a = Math.imul(a ^ code, 16777619);
    b = (Math.imul(b, 33) + code) | 0;
  }
  return [a, b];
}

/**
 * A Bloom filter of every ASCII identifier in `text`, sized at a quarter bit per
 * character (about ten bits per distinct name in source code), built in one scan
 * that allocates no strings.
 */
function identifierFilter(text) {
  let bits = 256;
  while (bits < text.length / 4 && bits < 1 << 17) bits *= 2;
  const filter = new Uint8Array(bits >> 3);
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    const before = index > 0 ? text.charCodeAt(index - 1) : 0;
    if (!isStart(code) || isPart(before)) {
      index += 1;
      continue;
    }
    let a = 2166136261;
    let b = 5381;
    while (index < text.length && isPart(text.charCodeAt(index))) {
      const part = text.charCodeAt(index);
      a = Math.imul(a ^ part, 16777619);
      b = (Math.imul(b, 33) + part) | 0;
      index += 1;
    }
    for (const bit of positions(a, b, bits)) filter[bit >> 3] |= 1 << (bit & 7);
  }
  return filter;
}

/** One product file's declarations and identifier filter, kept by size and mtime. */
function factsOf(file) {
  const stamp = stampOf(file);
  const held = DECLARATIONS.get(file.abs);
  if (held?.stamp === stamp) return held;
  const text = textOf(file);
  const facts = {
    stamp,
    declarations: text
      ? outlineSource(text, file.path).declarations
        .filter((declaration) => declaration.kind !== 'section' && declaration.kind !== 'export')
        // A copy: a substring would keep the whole file text alive.
        .map(({ name, line, kind }) => ({ name: Buffer.from(name).toString(), line, kind }))
      : [],
    names: identifierFilter(text),
  };
  DECLARATIONS.delete(file.abs);
  DECLARATIONS.set(file.abs, facts);
  if (DECLARATIONS.size > FILE_LIMIT) DECLARATIONS.delete(DECLARATIONS.keys().next().value);
  return facts;
}

/** False only when the file certainly never names `name` as a whole identifier. */
function mayName(facts, name) {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return true;
  const [a, b] = hashes(name);
  return positions(a, b, facts.names.length * 8).every((bit) => (facts.names[bit >> 3] & (1 << (bit & 7))) !== 0);
}

/** Product source files under `rootPath`, from the same walk as the breadth map. */
export function productFiles(rootPath, ignore = []) {
  try {
    return collectSourceUnits(rootPath, { ignore }).files.filter((file) => file.class === 'product');
  } catch {
    return [];
  }
}

/**
 * name -> [{ path, line, kind, name }] over every product source file under
 * `rootPath`; a `Receiver.method` declaration is also listed under `*.method`.
 *
 * @param {string} rootPath absolute repository root
 * @param {{ ignore?: string[], files?: object[] }} [options] `files` reuses one walk across a call
 */
export function declarationIndex(rootPath, { ignore = [], files } = {}) {
  const index = new Map();
  for (const file of files ?? productFiles(rootPath, ignore)) {
    for (const { name, line, kind } of factsOf(file).declarations) {
      // A Go method `Node.Subscribe` is also found by the bare name its callers write.
      const keys = name.includes('.') ? [name, `*.${name.split('.').pop()}`] : [name];
      for (const key of keys) {
        const rows = index.get(key);
        if (rows) rows.push({ path: file.path, line, kind, name });
        else index.set(key, [{ path: file.path, line, kind, name }]);
      }
    }
  }
  return index;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Where product code calls `name(`: each call line outside a declaration line, a
 * comment, a doctest (`>>> f(x)`) or a Python docstring, at most `limit` (the
 * rest only counted), so a symbol read can show the guard its caller puts around
 * it. An example in a docstring is no caller, and showing it as one hides the
 * docstring's own rule behind it.
 *
 * @returns {{ sites: { path: string, line: number }[], total: number }}
 */
export function callSitesOf(rootPath, name, { ignore = [], limit = 8, files } = {}) {
  const pattern = new RegExp(`(?:^|[^\\w$])${escapeRegExp(name)}\\s*\\(`, 'u');
  const sites = [];
  let total = 0;
  for (const file of files ?? productFiles(rootPath, ignore)) {
    const facts = factsOf(file);
    if (!mayName(facts, name)) continue;
    const text = textOf(file);
    if (!text.includes(name)) continue;
    const declared = new Set(facts.declarations.map((declaration) => declaration.line));
    const lines = text.split(/\r?\n/);
    const python = file.path.endsWith('.py') || file.path.endsWith('.pyi');
    let quote = null;
    for (let index = 0; index < lines.length; index += 1) {
      let line = lines[index];
      if (python) {
        const code = codeOutsideDocstring(line, quote);
        quote = code.quote;
        line = code.text;
      }
      if (declared.has(index + 1) || !pattern.test(line)) continue;
      if (/^\s*(?:\/\/|#|\*|\/\*|>>>|\.\.\.\s)/.test(line)) continue;
      total += 1;
      if (sites.length < limit) sites.push({ path: file.path, line: index + 1 });
    }
  }
  return { sites, total };
}

/**
 * The part of a Python line outside a triple-quoted string, and the quote still
 * open after it. One pass over the line: each opener is looked for once.
 */
function codeOutsideDocstring(line, open) {
  let text = '';
  let quote = open;
  let at = 0;
  while (at < line.length) {
    if (quote) {
      const close = line.indexOf(quote, at);
      if (close < 0) return { text, quote };
      at = close + 3;
      quote = null;
      continue;
    }
    const double = line.indexOf('"""', at);
    const single = line.indexOf("'''", at);
    const next = double < 0 ? single : single < 0 ? double : Math.min(double, single);
    if (next < 0) return { text: text + line.slice(at), quote: null };
    text += line.slice(at, next);
    quote = line.slice(next, next + 3);
    at = next + 3;
  }
  return { text, quote };
}
