/**
 * Features the README and the docs name in a heading that the code also names:
 * "## Lazy custom readers" beside a `LazyReader` class, "# Telemetry" beside a
 * `telemetry/` folder. A heading alone is prose and a folder alone is layout; the
 * two together say an operator was told this exists. Each row carries the code
 * path and line it matched and the heading's own path and line. Headings that
 * describe the document (installation, license, contributing) are skipped, and a
 * word only matches a whole folder name, file name or declared type.
 */

import { basename, dirname } from 'node:path';

import { nameKey, wordsOf } from './operator-abilities.mjs';

const ROW_LIMIT = 30;
const PAGE_LIMIT = 200;
const PAGE_BYTES = 64 * 1024;

/** Headings about the document rather than the product. */
const META_HEADING = /^(?:installation|installing|install|usage|getting started|get started|quick ?start|introduction|overview|license|licensing|contribut\w*|changelog|change log|faq|requirements|prerequisites|development|developing|testing|tests?|examples?|table of contents|contents|credits|acknowledg\w*|support|sponsors?|backers?|community|roadmap|benchmarks?|further reading|see also|links|references?|api reference|documentation|docs|citation|citing|cite|authors?|security|troubleshooting|motivation|features?|limitations|known issues|todo|notes?|summary|example|demo|status|upgrading|migration|migrating|release notes|versioning|compatibility|alternatives|related projects?|who uses|users|about|why|what|how it works|next steps|learn more|resources|help|feedback|questions|projects using|used by|showcase|in the wild)\b/i;

/** Words that never place a heading on code by themselves. */
const FILLER = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'using', 'use', 'via', 'how', 'your', 'my', 'our',
  'from', 'by', 'as', 'at', 'is', 'are', 'be', 'it', 'this', 'that', 'what', 'why', 'when', 'new', 'custom', 'basic',
  'advanced', 'more', 'other', 'all', 'about', 'setup', 'set', 'up', 'configure', 'configuring', 'option', 'options',
  'setting', 'settings', 'mode', 'modes', 'support', 'supported', 'example', 'examples', 'guide', 'part', 'step', 'default',
  'defaults', 'main', 'core', 'common', 'base', 'type', 'types', 'util', 'utils', 'helper', 'helpers', 'test', 'tests',
  'index', 'lib', 'run', 'running', 'work', 'working', 'works', 'get', 'getting', 'started', 'v1', 'v2', 'vs', 'not',
  'do', 'does', 'can', 'will', 'you', 'we', 'i', 'its', 'their', 'into', 'over', 'out', 'add', 'adding', 'make', 'making',
  'list', 'note', 'tip', 'warning', 'one', 'two', 'multiple', 'single', 'simple', 'other', 'usage',
]);
/** File and folder names too generic to stand for a feature. */
const GENERIC_CODE = new Set([
  'index', 'main', 'mod', 'lib', 'init', '__init__', 'util', 'utils', 'helper', 'helpers', 'type', 'types', 'constant',
  'constants', 'common', 'base', 'core', 'error', 'errors', 'option', 'options', 'test', 'tests', 'src', 'internal',
  'pkg', 'app', 'cmd', 'model', 'models', 'interface', 'interfaces', 'shared', 'misc', 'version', 'doc', 'docs',
]);
/** Folders that hold build, packaging or helper scripts rather than the product. */
const NOT_PRODUCT_FOLDER = /(?:^|\/)(?:scripts?|tools?|bin|build|dist|formula|packaging|etc|vendor\w*|ci|docker|deploy)(?:\/|$)/i;
const DECLARATION_KINDS = new Set(['class', 'type', 'interface', 'struct', 'enum', 'trait', 'function']);

function cleanHeading(raw) {
  return String(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/:[a-z0-9_+-]+:/g, ' ')
    .replace(/[`*_~]/g, '')
    .replace(/\{#[^}]*\}/g, '')
    .replace(/[^\p{L}\p{N} .+/&()'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
}

/** `{ text, line }` for each heading at the given levels, fenced code skipped. */
function headingsOf(text, levels) {
  const rows = [];
  let fenced = false;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const atx = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx && levels.includes(atx[1].length)) rows.push({ text: cleanHeading(atx[2]), line: index + 1 });
    const front = index < 10 && /^title:\s*["']?(.+?)["']?\s*$/.exec(line);
    if (front && levels.includes(1)) rows.push({ text: cleanHeading(front[1]), line: index + 1 });
  }
  return rows.filter((row) => row.text.length >= 3);
}

/**
 * Names the code gives a feature, each with where it is: folder names (at the
 * folder's main file), file names, and declared types, classes and functions.
 */
function codeVocabulary(files, index) {
  const entries = new Map();
  const add = (key, entry) => {
    if (!key || key.length < 3 || GENERIC_CODE.has(key)) return;
    const held = entries.get(key);
    if (!held || held.rank > entry.rank) entries.set(key, entry);
  };
  const byFolder = new Map();
  files = files.filter((file) => !NOT_PRODUCT_FOLDER.test(dirname(file.path)));
  for (const file of files) byFolder.set(dirname(file.path), [...(byFolder.get(dirname(file.path)) ?? []), file]);
  for (const [folder, members] of byFolder) {
    if (folder === '.') continue;
    const name = basename(folder);
    const main = members.find((file) => basename(file.path).replace(/\.[^.]+$/, '') === name)
      ?? [...members].sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0) || a.path.localeCompare(b.path))[0];
    add(nameKey(name), { rank: 0, path: main.path, line: 1, symbol: name });
  }
  for (const file of files) {
    const stem = basename(file.path).replace(/\.[^.]+$/, '');
    add(nameKey(stem), { rank: 1, path: file.path, line: 1, symbol: stem });
  }
  if (index) {
    for (const [name, rows] of index) {
      if (name.includes('.') || !/^[A-Za-z]/.test(name) || wordsOf(name).length < 2) continue;
      const row = rows.find((candidate) => DECLARATION_KINDS.has(candidate.kind));
      if (row) add(nameKey(name), { rank: 2, path: row.path, line: row.line, symbol: name });
    }
  }
  return entries;
}

/**
 * The code entry a heading names: its whole phrase first ("Signed streams" is
 * `SignedStreams`), then a heading of one word as a whole folder or file name
 * ("Telemetry" is `telemetry/`). A heading is split at
 * spaces and punctuation only, so "TypeScript" stays one word.
 */
function matchHeading(heading, vocabulary) {
  const words = heading.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word && !FILLER.has(word));
  if (words.length === 0) return null;
  const key = (word) => word.replace(/s$/, '');
  const whole = vocabulary.get(words.map(key).join(''));
  if (whole) return whole;
  if (words.length !== 1 || words[0].length < 3) return null;
  const entry = vocabulary.get(key(words[0]));
  return entry && entry.rank < 2 ? entry : null;
}

/**
 * Documented features with their code location.
 *
 * @param {(path: string, limit: number) => string} readText confined reader
 * @param {{ readme: string|null, pages: string[] }} documents repository-relative paths
 * @param {{ path: string, lines?: number }[]} files product files
 * @param {Map<string, object[]>|null} index declaration index, or null
 */
export function documentedAbilities(readText, documents, files, index) {
  const vocabulary = codeVocabulary(files, index);
  const sources = [];
  if (documents.readme) sources.push({ path: documents.readme, levels: [2, 3] });
  for (const page of documents.pages.slice(0, PAGE_LIMIT)) sources.push({ path: page, levels: [1, 2] });
  const rows = [];
  const placed = new Set();
  for (const source of sources) {
    const text = readText(source.path, PAGE_BYTES);
    if (!text) continue;
    for (const heading of headingsOf(text, source.levels)) {
      if (META_HEADING.test(heading.text)) continue;
      const entry = matchHeading(heading.text, vocabulary);
      if (!entry) continue;
      const key = `${entry.path}\0${entry.symbol}`;
      if (placed.has(key)) continue;
      placed.add(key);
      rows.push({ kind: 'documented', name: heading.text, path: entry.path, line: entry.line, symbol: entry.symbol, doc: `${source.path}:L${heading.line}` });
      if (rows.length >= ROW_LIMIT) return rows;
    }
  }
  return rows;
}
