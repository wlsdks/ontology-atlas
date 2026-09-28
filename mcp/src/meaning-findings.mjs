/**
 * Meaning gaps a write can see in the body, the half of a node the eligibility
 * gate does not open. Every real build lands through add_concept and
 * patch_concept, so this door must say when a vault is shallow yet validates
 * clean (`docs/DECISIONS.md`, the dissent on "A refusal names the path that
 * stays open"). Pure over `{ kind, slug, frontmatter, body, repoRoot }`: no
 * writes or vault scan, and the only disk question is whether a cited path is a
 * directory. Advisory (construction rule 5). `src/shared/lib/meaning-findings.ts`
 * is the app twin, compared by `tests/contract/meaning-findings-parity.contract.test.ts`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

import {
  BODY_BOUNDARY_SECTIONS,
  BODY_DEFINITION_SECTIONS,
  BODY_UNCERTAINTY_SECTIONS,
  DEPENDENCY_FRONTMATTER_KEYS,
  STARTER_EXAMPLE_BODY_MARKERS,
  STARTER_EXAMPLE_SLUGS,
  boundaryMissingMessage,
  definitionMissingMessage,
  dependencyUnjudgedMessage,
  dependencyUnwitnessedMessage,
  epistemicExclusionMessage,
  folderOnlyEvidenceMessage,
  isEpistemicExclusionBoundary,
  starterExampleNodeMessage,
  uncertaintyMissingMessage,
} from './construction-rules.mjs';
import {
  NODE_ELIGIBILITY_GATE,
  ONTOLOGY_META_MODEL_REFERENCE,
  defaultBody,
  folderForKind,
} from './schema.mjs';

/**
 * Words of prose a definition needs: about the shortest English sentence that
 * carries both halves of a definition. Lower passes a restated title; higher
 * accuses a terse real one.
 */
const DEFINITION_MIN_WORDS = 8;

/**
 * Words a definition must add beyond the title, since construction rule 3a asks
 * for a non-circular sentence and length alone cannot tell circular from terse.
 * Five new words read as a paraphrase in the trial vaults; six begin to say something.
 */
const DEFINITION_MIN_NOVEL_WORDS = 6;

/** Grammar words, so restating the title around them still counts as restating. Kept tiny on purpose. */
const DEFINITION_STOP_WORDS = Object.freeze(
  new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'is', 'are']),
);

const DEFINITION_KINDS = new Set(['domain', 'capability', 'element']);
const BOUNDARY_KINDS = new Set(['domain', 'capability']);
const UNCERTAINTY_KINDS = new Set(['domain', 'capability', 'element']);
const EPISTEMIC_KINDS = new Set(['domain', 'capability', 'element', 'project']);
const BODY_CHECK_KINDS = new Set([...DEFINITION_KINDS, ...BOUNDARY_KINDS, ...UNCERTAINTY_KINDS, ...EPISTEMIC_KINDS]);
const BODY_CHECKS = [definitionFinding, boundaryFindings, uncertaintyFinding, epistemicExclusionFinding];
const FOLDER_EVIDENCE_KINDS = new Set(['capability', 'element']);

/** Entry-point filenames in the order an unfamiliar agent would try them, to say "open this instead". */
const ENTRY_POINT_BASENAMES = [
  'index', 'main', 'mod', 'app', 'server', 'cli', 'lib', 'init', '__init__',
];

function fold(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Strips a list marker (`-`, `*`, `1.`) or a blockquote caret from one line. */
function stripMarker(line) {
  return String(line ?? '').replace(/^\s*(?:[-*+]|\d+[.)]|>)\s*/, '').trim();
}

/** Lowercased word tokens, punctuation and markup dropped. */
function wordTokens(text) {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Distinct tokens not in the title, so one new word repeated does not pass. */
function novelWordCount(text, titleWords) {
  const novel = new Set();
  for (const token of wordTokens(text)) {
    if (DEFINITION_STOP_WORDS.has(token) || titleWords.has(token)) continue;
    novel.add(token);
  }
  return novel.size;
}

function wordCount(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** The starter line every template ends with; counting it would let an empty node pass on boilerplate. */
function isSchemaFurniture(line) {
  return String(line ?? '').includes(ONTOLOGY_META_MODEL_REFERENCE);
}

/**
 * Splits a body into the prose before the first `##` and the sections after.
 * The `#` title is neither (it repeats `title`), and fenced code is skipped so
 * a `##` inside a snippet invents no section.
 */
function parseBodySections(body) {
  const lead = [];
  const sections = [];
  let current = null;
  let fenced = false;
  for (const raw of String(body ?? '').split('\n')) {
    const line = raw.trim();
    if (/^(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      if (current) current.lines.push(line);
      else lead.push(line);
      continue;
    }
    const heading = /^(#{2,6})\s+(.*)$/.exec(line);
    if (heading) {
      current = { heading: heading[2].trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (/^#\s+/.test(line)) {
      current = null;
      continue;
    }
    if (!line || isSchemaFurniture(line)) continue;
    if (current) current.lines.push(line);
    else lead.push(line);
  }
  return { lead, sections };
}

function normalizeHeading(heading) {
  return fold(String(heading).replace(/[`*_#]/g, '').replace(/[:：.,]+\s*$/, ''));
}

function headingNames(heading, synonyms) {
  const normalized = normalizeHeading(heading);
  return synonyms.some(
    (name) =>
      normalized === name ||
      normalized.startsWith(`${name} `) ||
      normalized.endsWith(` ${name}`) ||
      normalized.includes(` ${name} `),
  );
}

/**
 * The section stating this side of the boundary. The negative side is tested
 * first: "out of scope" contains "scope", or `## Out of scope` reads as Includes.
 */
function findBoundarySection(sections, side) {
  for (const section of sections) {
    if (headingNames(section.heading, BODY_BOUNDARY_SECTIONS.excludes)) {
      if (side === 'excludes') return section;
      continue;
    }
    if (side === 'includes' && headingNames(section.heading, BODY_BOUNDARY_SECTIONS.includes)) {
      return section;
    }
  }
  return null;
}

/**
 * The section carrying the definition. The qualification lane writes it
 * under `## Definition` with nothing above, so the heading is a second place to look,
 * judged by the same word counts.
 */
function findDefinitionSection(sections) {
  return sections.find((section) => headingNames(section.heading, BODY_DEFINITION_SECTIONS)) ?? null;
}

/** The starter scaffold for this kind, parsed once per call site. */
function starterShape(kind, title) {
  try {
    return parseBodySections(defaultBody(kind, title ?? ''));
  } catch {
    return null;
  }
}

/** Placeholder lines, derived from the template so the scaffold and this check cannot drift. */
function starterPlaceholders(starter) {
  const placeholders = new Set();
  if (!starter) return placeholders;
  for (const section of starter.sections) {
    for (const line of section.lines) placeholders.add(fold(stripMarker(line)));
  }
  placeholders.delete('');
  return placeholders;
}

function bodyView(kind, title, body) {
  const starter = starterShape(kind, title);
  return { ...parseBodySections(body), starter, placeholders: starterPlaceholders(starter) };
}

export function bodyMeaningFindings(input) {
  if (!BODY_CHECK_KINDS.has(input.kind)) return [];
  const view = bodyView(input.kind, input.title, input.body);
  return BODY_CHECKS.flatMap((check) => check(input, view) ?? []);
}

/**
 * Is this line still a slot? Either untouched (matches the template) or reworded
 * around a surviving `<…>` slot, which a counter reads as filled.
 */
function isPlaceholderLine(line, placeholders) {
  const text = stripMarker(line);
  const folded = fold(text);
  if (!folded) return true;
  if (placeholders.has(folded)) return true;
  if (!/<[^>]*>/.test(text)) return false;
  return wordCount(text.replace(/<[^>]*>/g, ' ')) < 3;
}

function contentLines(section, placeholders) {
  if (!section) return [];
  return section.lines.filter((line) => line && !isPlaceholderLine(line, placeholders));
}

/**
 * Does the body say what this node is? A template definition line kept (by
 * containment, so appending one line does not pass) or too little new prose
 * before the first `##` share one code.
 */
export function definitionFinding({ kind, slug, title, body }, view = null) {
  if (!DEFINITION_KINDS.has(kind)) return null;
  const { lead, sections, starter, placeholders } = view ?? bodyView(kind, title, body);
  const leadText = lead.join(' ');
  const starterLead = starter ? starter.lead.join(' ') : '';
  const leadIsStarter = Boolean(starterLead) && fold(leadText).includes(fold(starterLead));
  const stated = contentLines(findDefinitionSection(sections), placeholders)
    .map((line) => stripMarker(line))
    .join(' ');
  // Either place may hold the definition; the candidate must be long enough and
  // add enough beyond the title.
  const titleWords = new Set(wordTokens(title));
  for (const candidate of [leadIsStarter ? '' : leadText, stated]) {
    if (wordCount(candidate) < DEFINITION_MIN_WORDS) continue;
    if (novelWordCount(candidate, titleWords) < DEFINITION_MIN_NOVEL_WORDS) continue;
    return null;
  }
  return {
    code: 'definition-missing',
    slug,
    key: 'body',
    refs: [],
    count: 1,
    message: definitionMissingMessage({ slug, kind }),
  };
}

/**
 * One finding per missing boundary side, named in `key`: the two are different
 * work, and reporting them together lets half an answer read as whole.
 */
export function boundaryFindings({ kind, slug, title, body }, view = null) {
  if (!BOUNDARY_KINDS.has(kind)) return [];
  const { sections, placeholders } = view ?? bodyView(kind, title, body);
  const findings = [];
  for (const side of ['includes', 'excludes']) {
    const section = findBoundarySection(sections, side);
    if (contentLines(section, placeholders).length > 0) continue;
    findings.push({
      code: 'boundary-missing',
      slug,
      key: side,
      refs: [],
      count: 1,
      message: boundaryMissingMessage({ slug, kind, side }),
    });
  }
  return findings;
}

/**
 * Does the body say what the writer did not check? No stated unknown claims
 * completeness. A placeholder bullet does not count, or the default write would
 * silence the question it cannot have answered.
 */
export function uncertaintyFinding({ kind, slug, title, body }, view = null) {
  if (!UNCERTAINTY_KINDS.has(kind)) return null;
  const { sections, placeholders } = view ?? bodyView(kind, title, body);
  const section = sections.find((row) => headingNames(row.heading, BODY_UNCERTAINTY_SECTIONS)) ?? null;
  if (contentLines(section, placeholders).length > 0) return null;
  return {
    code: 'uncertainty-missing',
    slug,
    key: 'uncertainty',
    refs: [],
    count: 1,
    message: uncertaintyMissingMessage({ slug, kind }),
  };
}

/**
 * The author's uncertainty lines, placeholders removed, chosen by the same
 * synonyms and scaffold as {@link uncertaintyFinding}. `uncertainty-reads.mjs`
 * imports it so the write-time question and the read-time queue agree.
 */
export function uncertaintySectionLines({ kind, title, body }) {
  const { sections, placeholders } = bodyView(kind, title, body);
  const section =
    sections.find((row) => headingNames(row.heading, BODY_UNCERTAINTY_SECTIONS)) ?? null;
  return contentLines(section, placeholders);
}

/**
 * Exclusions stating what the writer did not see rather than what the product
 * does not do. The rule is imported from `construction-rules.mjs`, never
 * re-derived, so the qualification lane and this door agree on each bullet.
 */
export function epistemicExclusionFinding({ kind, slug, title, body }, view = null) {
  if (!EPISTEMIC_KINDS.has(kind)) return null;
  const { sections, placeholders } = view ?? bodyView(kind, title, body);
  const section = findBoundarySection(sections, 'excludes');
  if (!section) return null;
  const offending = contentLines(section, placeholders)
    .map((line) => stripMarker(line))
    .filter((text) => text && isEpistemicExclusionBoundary(text));
  if (offending.length === 0) return null;
  return {
    code: 'epistemic-exclusion',
    slug,
    key: 'excludes',
    refs: offending,
    count: offending.length,
    message: epistemicExclusionMessage({
      slug,
      refs: offending,
      count: offending.length,
      sampleLimit: NODE_ELIGIBILITY_GATE.REFERENCE_SAMPLE_LIMIT,
    }),
  };
}

/** The file inside a folder an unfamiliar agent would open first, or null. */
function entryPointInside(directory) {
  let names;
  try {
    names = readdirSync(directory).filter((name) => !name.startsWith('.')).sort();
  } catch {
    return null;
  }
  const files = names.filter((name) => {
    try {
      return statSync(join(directory, name)).isFile();
    } catch {
      return false;
    }
  });
  if (files.length === 0) return null;
  for (const base of ENTRY_POINT_BASENAMES) {
    const match = files.find((name) => name.replace(/\.[^.]+$/, '').toLowerCase() === base);
    if (match) return match;
  }
  return files[0];
}

/**
 * Evidence that names a folder. Silent when `repoRoot` is unknown (an ungrounded
 * root would measure against the process cwd) or the path is missing
 * (validate_vault's `pathDrift` already says that).
 */
export function folderOnlyEvidenceFinding({ kind, slug, frontmatter, repoRoot }) {
  if (!FOLDER_EVIDENCE_KINDS.has(kind)) return null;
  const path = typeof frontmatter?.path === 'string' ? frontmatter.path.trim() : '';
  if (!path || !repoRoot || isAbsolute(path)) return null;
  /*
   * Security: `path:` is untrusted agent-written input, and `../../somewhere`
   * escapes as well as an absolute path; this then lists a directory and echoes a
   * filename, so it must stay inside the repository. Lexical, no realpath: the
   * root was settled by `assertScanRootAllowed`, and re-resolving would disagree
   * with every other server boundary where temp or home is a symlink.
   */
  const boundary = resolve(repoRoot);
  const absolute = resolve(boundary, path);
  if (absolute !== boundary && !absolute.startsWith(boundary + sep)) return null;
  if (!existsSync(absolute)) return null;
  let isDirectory = false;
  try {
    isDirectory = statSync(absolute).isDirectory();
  } catch {
    return null;
  }
  if (!isDirectory) return null;
  const entry = entryPointInside(absolute);
  return {
    code: 'folder-only-evidence',
    slug,
    key: 'path',
    refs: [path],
    count: 1,
    message: folderOnlyEvidenceMessage({
      slug,
      path,
      suggestion: entry ? `${path.replace(/\/$/, '')}/${entry}` : null,
    }),
  };
}

/**
 * Resolves a vault-relative path inside the repository, with the same lexical
 * clamp as `folderOnlyEvidenceFinding` (`path:` is untrusted input). `null`
 * whenever the answer would be a guess, which callers treat as "do not speak".
 */
function insideRepo(repoRoot, path) {
  const value = typeof path === 'string' ? path.trim() : '';
  if (!value || !repoRoot || isAbsolute(value)) return null;
  const boundary = resolve(repoRoot);
  const absolute = resolve(boundary, value);
  if (absolute !== boundary && !absolute.startsWith(boundary + sep)) return null;
  return { path: value, absolute };
}

/** Every dependency ref a node declares, under either spelling of the key. */
function declaredDependencies(frontmatter) {
  const refs = new Set();
  for (const key of DEPENDENCY_FRONTMATTER_KEYS) {
    const value = frontmatter?.[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      if (typeof ref !== 'string') continue;
      const trimmed = ref.trim();
      if (trimmed) refs.add(trimmed);
    }
  }
  return refs;
}

/**
 * Maps `src/shared/lib/nav.ts` → `nav`, the name an import carries. A module root
 * answers to its folder: `src/export/mod.rs` is `use
 * crate::export`, `src/lib/index.ts` is `'./lib'`, `pkg/__init__.py` is `import pkg`.
 */
const MODULE_ROOT_BASENAMES = new Set(['mod', 'index', '__init__']);
function witnessNamesFor(path) {
  const base = basename(path).replace(/\.[^.]+$/, '');
  if (!MODULE_ROOT_BASENAMES.has(base)) return [base];
  const folder = basename(dirname(path));
  return folder && folder !== '.' ? [base, folder] : [base];
}

/**
 * The module specifiers a file brings in, in every language this vault
 * describes: JavaScript/TypeScript `import … from '…'`, `import '…'`,
 * `import('…')` and `require('…')` (multi-line `import {\n…\n} from '…'` is
 * the common shape, so the whole text is read, never a line); Python
 * `import a.b` and `from a.b import c`; Rust `use a::b` and `mod b`; Go's
 * quoted paths inside `import (…)`; C-family `#include`; Ruby `require`.
 */
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s+['"]([^'"\n]+)['"]/g,
  /\brequire(?:_relative)?\s*(?:\(\s*)?['"]([^'"\n]+)['"]/g,
  /^[ \t]*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.]+))/gm,
  /^[ \t]*(?:pub(?:\([^)\n]*\))?\s+)?(?:use|mod)\s+(?!\s)((?:(?!\b(?:use|mod)\b)[\w:{}\s,])*?[\w:{},])\s*;/gm,
  /^[ \t]*#\s*include\s*[<"]([^>"\n]+)[>"]/gm,
];
const GO_IMPORT_BLOCK = /^[ \t]*import\s*\(((?:(?!\n[ \t]*import\b)[^)])*)\)/gm;
const WITNESS_TEXT_MAX_BYTES = 2 * 1024 * 1024;
const WITNESS_TEXT_CACHE_BYTES = 16 * 1024 * 1024;

function readWitnessText(absolute) {
  try {
    const stat = statSync(absolute);
    if (!stat.isFile()) return null;
    return stat.size > WITNESS_TEXT_MAX_BYTES ? { tooLarge: true } : { text: readFileSync(absolute, 'utf-8'), bytes: stat.size };
  } catch {
    return null;
  }
}

function moduleSpecifiers(text) {
  const specifiers = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of String(text).matchAll(pattern)) {
      specifiers.push(...match.slice(1).filter(Boolean));
    }
  }
  for (const block of String(text).matchAll(GO_IMPORT_BLOCK)) {
    for (const quoted of block[1].matchAll(/"([^"\n]+)"/g)) specifiers.push(quoted[1]);
  }
  return specifiers;
}

/**
 * Does this file bring that file in? Only two spellings count: the target path
 * verbatim, or its extensionless basename as the last segment of an import
 * specifier. A bare word elsewhere is no witness (unrelated identifiers would
 * keep an edge green with no import). Case-sensitive: `Vault` and `vault` differ.
 */
function textWitnesses({ text, path }, targetPath, witnessNames, moduleNamesByPath) {
  if (text.includes(targetPath)) return true;
  const names = witnessNames.filter(Boolean);
  if (names.length === 0) return false;
  let moduleNames = moduleNamesByPath.get(path);
  if (!moduleNames) {
    moduleNames = new Set(moduleSpecifiers(text).flatMap((specifier) =>
      specifier
        .split(/::|[/\\{},\s]+|\.(?![A-Za-z0-9]{1,10}$)/)
        .map((segment) => segment.replace(/\.[^.]+$/, '')),
    ));
    moduleNamesByPath.set(path, moduleNames);
  }
  return names.some((name) => moduleNames.has(name));
}

/**
 * A repo-relative file path inside a sentence: `/` and an extension, backticked
 * or not. The conservative half of `uncertainty-reads.mjs`'s rule (which also
 * takes a bare basename, useless against a root), restated since that module
 * does not export it.
 */
const NOTE_PATH_OPENERS = new Set(['(', '[', '{', '"', "'", '`', '\u201c', '\u2018']);
const NOTE_PATH_CLOSERS = new Set([')', ']', '}', '"', "'", '`', '\u201d', '\u2019', '.', ',', ';', ':', '!', '?']);
const NOTE_PATH_MAX_CHARS = 1024;
const NOTE_PATH_EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,9}$/;

function trimNotePathEdges(token) {
  let start = 0;
  let end = token.length;
  while (start < end && NOTE_PATH_OPENERS.has(token[start])) start += 1;
  while (end > start && NOTE_PATH_CLOSERS.has(token[end - 1])) end -= 1;
  return token.slice(start, end);
}

/**
 * The `:42` the message explicitly asks the writer to append, and the `:42:7`
 * an editor copies. Stripped in the same loop as the punctuation, because
 * `` `src/consumer.ts`:1, `` needs both passes twice: quote, line, backtick.
 */
const NOTE_PATH_LINE_SUFFIX = /(?::\d+(?:[-\u2013]\d+)?(?::\d+)?|#L\d+(?:-L?\d+)?)$/;

function pathTokensIn(text) {
  const tokens = new Set();
  for (const raw of String(text ?? '').split(/\s+/)) {
    if (raw.length > NOTE_PATH_MAX_CHARS) continue;
    let token = raw;
    let previous = null;
    while (token !== previous) {
      previous = token;
      token = trimNotePathEdges(token).replace(NOTE_PATH_LINE_SUFFIX, '');
    }
    if (!token || token.startsWith('http://') || token.startsWith('https://')) continue;
    if (!token.includes('/') || !NOTE_PATH_EXTENSION.test(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

/** The rationale stored for one edge, under the canonical key or its tail. */
function relationNoteText(frontmatter, target) {
  const notes = frontmatter?.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return '';
  if (typeof notes[target] === 'string') return notes[target];
  const tail = String(target).split('/').pop();
  for (const [key, value] of Object.entries(notes)) {
    if (typeof value !== 'string') continue;
    if (key === target || key.split('/').pop() === tail) return value;
  }
  return '';
}

export const createDependencyWitnessReads = () => ({ recent: new Map(), textBytes: 0, moduleNames: new Map() });

function cachedWitnessRead(fileReads, absolute) {
  const { recent } = fileReads;
  const read = recent.has(absolute) ? recent.get(absolute) : readWitnessText(absolute);
  if (!recent.delete(absolute)) fileReads.textBytes += read?.bytes ?? 0;
  recent.set(absolute, read);
  for (const [oldest, evicted] of recent) {
    if (fileReads.textBytes <= WITNESS_TEXT_CACHE_BYTES) break;
    recent.delete(oldest);
    fileReads.textBytes -= evicted?.bytes ?? 0;
  }
  return read;
}

/**
 * A declared dependency its file never mentions; `impact` keeps
 * answering `sourceBacked: false` for every declared edge, and this names the rows behind
 * it. New edges only when `previousFrontmatter` is given, so an old edge is not
 * re-accused on every patch; a whole-vault pass omits it. The witness may be the
 * source node's file or any repo-relative file the edge's `relation_notes`
 * names (a cross-boundary edge is witnessed by the bridge, not either end), each
 * clamped inside the repository and required to exist. Silent whenever an input
 * is a guess: no root, no `path:` on either end, a directory source
 * (`folder-only-evidence` owns that), or a path outside the tree.
 *
 * @param {object} args
 * @param {string} args.slug
 * @param {Record<string, unknown>} args.frontmatter
 * @param {Record<string, unknown>} [args.previousFrontmatter] absent judges every dependency
 * @param {string|null} args.repoRoot
 * @param {(ref: string) => string|null} args.resolveTargetPath target slug → its `path:`, or null
 * @returns {Array<object>} one finding per unwitnessed target, `key` = target slug (a per-edge notice key)
 */
export function dependencyWitnessFinding({
  slug,
  frontmatter,
  previousFrontmatter,
  repoRoot,
  resolveTargetPath,
  fileReads = createDependencyWitnessReads(),
}) {
  if (!repoRoot || typeof resolveTargetPath !== 'function') return [];
  const source = insideRepo(repoRoot, frontmatter?.path);
  if (!source) return [];
  const previous = previousFrontmatter ? declaredDependencies(previousFrontmatter) : new Set();
  const targets = [...declaredDependencies(frontmatter)].filter((target) => !previous.has(target));
  if (targets.length === 0) return [];
  const sourceRead = cachedWitnessRead(fileReads, source.absolute);
  if (sourceRead === null) return [];
  const readCache = new Map([[source.path, { ...sourceRead, path: source.path }]]);
  /**
   * A note path is tried from the repository root, then from each ancestor of the
   * citing file, nearest first, since writers copy editor-relative paths. Every
   * try stays clamped inside the repository and must be an existing file.
   */
  const sourceAncestors = [];
  for (let dir = dirname(source.path); dir && dir !== '.'; dir = dirname(dir)) {
    sourceAncestors.push(dir);
  }
  const readCandidate = (path) => {
    if (readCache.has(path)) return readCache.get(path);
    let read = null;
    for (const base of ['', ...sourceAncestors]) {
      const resolved = insideRepo(repoRoot, base ? `${base}/${path}` : path);
      if (!resolved) continue;
      const found = cachedWitnessRead(fileReads, resolved.absolute);
      read = found && { ...found, path: resolved.path };
      if (read) break;
    }
    readCache.set(path, read);
    return read;
  };
  const findings = [];
  for (const target of targets) {
    let targetPath;
    try {
      targetPath = resolveTargetPath(target);
    } catch {
      continue;
    }
    const resolved = insideRepo(repoRoot, targetPath);
    if (!resolved) continue;
    const witnessNames = witnessNamesFor(resolved.path);
    const reads = [readCache.get(source.path)];
    for (const token of pathTokensIn(relationNoteText(frontmatter, target))) {
      const read = readCandidate(token);
      if (read) reads.push(read);
    }
    if (reads.some((read) => read.text !== undefined && textWitnesses(read, resolved.path, witnessNames, fileReads.moduleNames))) continue;
    const unread = [...new Set(reads.filter((read) => read.tooLarge).map((read) => read.path))];
    findings.push({
      code: unread.length > 0 ? 'dependency-unjudged' : 'dependency-unwitnessed',
      slug,
      key: target,
      refs: [target],
      count: 1,
      message: unread.length > 0
        ? dependencyUnjudgedMessage({ slug, target, unreadPaths: unread, maxBytes: WITNESS_TEXT_MAX_BYTES })
        : dependencyUnwitnessedMessage({
          slug,
          sourcePath: source.path,
          target,
          targetPath: resolved.path,
          witnessName: witnessNames[0],
        }),
    });
  }
  return findings;
}

/** The kinds `init` ships a starter example for. */
const STARTER_EXAMPLE_KINDS = new Set(Object.keys(STARTER_EXAMPLE_SLUGS));

/**
 * Is this one of the examples `init` wrote to be copied? The three template
 * addresses match outright. Otherwise both an `example-` slug tail and an
 * "Example" title are required: either alone would accuse a real node, and a
 * real node that is about examples and named both ways is an accepted false
 * positive. The body is not consulted, so rewriting the prose but keeping the
 * name still counts.
 */
export function isStarterExampleNode({ slug, kind, title }) {
  const address = typeof slug === 'string' ? slug.trim() : '';
  if (!address) return false;
  if (typeof kind === 'string' && STARTER_EXAMPLE_SLUGS[kind.trim()] === address) return true;
  if (Object.values(STARTER_EXAMPLE_SLUGS).includes(address)) return true;
  const tail = address.split('/').pop() ?? '';
  if (!tail.startsWith('example-')) return false;
  return String(title ?? '').trim().startsWith('Example');
}

/** Does this body still carry the sentences only the untouched starter has? */
function hasUntouchedStarterBody(body) {
  const text = String(body ?? '').toLowerCase();
  return STARTER_EXAMPLE_BODY_MARKERS.every((marker) => text.includes(marker.toLowerCase()));
}

/**
 * One starter example no longer alone. Pure: the caller says which real sibling
 * exists (a whole-vault question); `realSlug` may be null when unknown.
 */
export function starterExampleFinding({ slug, kind, title, body, realSlug = null }) {
  const address = typeof slug === 'string' ? slug.trim() : '';
  const nodeKind = typeof kind === 'string' ? kind.trim() : '';
  if (!STARTER_EXAMPLE_KINDS.has(nodeKind)) return null;
  if (!isStarterExampleNode({ slug: address, kind: nodeKind, title })) return null;
  const folder = folderForKind(nodeKind) ?? '';
  return {
    code: 'starter-example-node',
    slug: address,
    key: 'slug',
    refs: realSlug ? [realSlug] : [],
    count: 1,
    message: starterExampleNodeMessage({
      starterSlug: address,
      kind: nodeKind,
      realSlug,
      renameTo: `${folder}<real-name>`,
      untouchedBody: hasUntouchedStarterBody(body),
    }),
  };
}

/**
 * Every starter example a vault has outgrown, for validate_vault, the CLI and
 * the maintenance plan. Needs only slug, kind and title, so it works on a vault
 * nobody compiled with bodies. `nodes`: iterable of `{ slug, kind, title, body? }`.
 */
export function starterExampleFindings(nodes) {
  const rows = [];
  for (const node of nodes ?? []) {
    const kind = typeof node?.kind === 'string' ? node.kind.trim() : '';
    if (!kind) continue;
    rows.push({ ...node, kind, starter: isStarterExampleNode({ slug: node.slug, kind, title: node.title }) });
  }
  const findings = [];
  for (const node of rows) {
    if (!node.starter) continue;
    // Until a real node of the kind exists, the starter is the product's own instructions.
    const sibling = rows.find((other) => other.kind === node.kind && !other.starter);
    if (!sibling) continue;
    const finding = starterExampleFinding({ ...node, realSlug: sibling.slug ?? null });
    if (finding) findings.push(finding);
  }
  return findings.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

/**
 * Every meaning finding for one written node. `bodyWritten` and `pathWritten`
 * say what this write touched, so a rename patch is not answered about a body it
 * never opened.
 */
export function meaningFindings({
  kind,
  slug,
  frontmatter,
  body,
  repoRoot,
  bodyWritten = false,
  pathWritten = false,
}) {
  const findings = [];
  if (typeof kind !== 'string' || !kind.trim()) return findings;
  const title = typeof frontmatter?.title === 'string' ? frontmatter.title : '';
  if (bodyWritten) {
    const definition = definitionFinding({ kind, slug, title, body });
    if (definition) findings.push(definition);
    findings.push(...boundaryFindings({ kind, slug, title, body }));
    const uncertainty = uncertaintyFinding({ kind, slug, title, body });
    if (uncertainty) findings.push(uncertainty);
    const epistemic = epistemicExclusionFinding({ kind, slug, title, body });
    if (epistemic) findings.push(epistemic);
  }
  if (pathWritten) {
    const folderOnly = folderOnlyEvidenceFinding({ kind, slug, frontmatter, repoRoot });
    if (folderOnly) findings.push(folderOnly);
  }
  return findings;
}
