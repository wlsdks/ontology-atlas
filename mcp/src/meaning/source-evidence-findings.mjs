// Findings about whether a node's cited paths and declared dependencies are
// witnessed in source. Reads the repository, and only reads.

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  resolve,
  sep,
} from 'node:path';
import {
  DEPENDENCY_FRONTMATTER_KEYS,
  dependencyUnjudgedMessage,
  dependencyUnwitnessedMessage,
  folderOnlyEvidenceMessage,
} from '../construction/construction-rules.mjs';

const FOLDER_EVIDENCE_KINDS = new Set(['capability', 'element']);

/** Entry-point filenames in the order an unfamiliar agent would try them, to say "open this instead". */
const ENTRY_POINT_BASENAMES = [
  'index', 'main', 'mod', 'app', 'server', 'cli', 'lib', 'init', '__init__',
];

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
  /^[ \t]*(?:pub(?:\([^)\n]*\))?\s+)?(?:use|mod)\s+(?!\s)((?:(?!\b(?:use|mod)\b)[\w:{}\s,])*?[\w:{},])\s*;/gm,
  /^[ \t]*#\s*include\s*[<"]([^>"\n]+)[>"]/gm,
];
/*
 * Python names modules with dots (`from .image import Image`, `import pkg.data.image`),
 * so its specifiers are read apart: the path splitter keeps a dot before a short
 * tail as a file extension, which would eat `image` from `.image`.
 */
const PYTHON_IMPORT = /^[ \t]*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.]+))/gm;
const GO_IMPORT_BLOCK = /^[ \t]*import\s*\(((?:(?!\n[ \t]*import\b)[^)])*)\)/gm;
const WITNESS_TEXT_MAX_BYTES = 2 * 1024 * 1024;

function readWitnessText(absolute) {
  try {
    const stat = statSync(absolute);
    if (!stat.isFile()) return null;
    return stat.size > WITNESS_TEXT_MAX_BYTES ? { tooLarge: true } : { text: readFileSync(absolute, 'utf-8') };
  } catch {
    return null;
  }
}

export function moduleSpecifiers(text) {
  const specifiers = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of String(text).matchAll(pattern)) {
      specifiers.push(...match.slice(1).filter(Boolean));
    }
  }
  for (const match of String(text).matchAll(PYTHON_IMPORT)) {
    specifiers.push(...match.slice(1).filter(Boolean).map((dotted) => dotted.replaceAll('.', '/')));
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
 * The `:42`, `:42:7` or `#L42` an editor copies. Stripped in the same loop as
 * the punctuation, because `` `src/consumer.ts`:1, `` needs both passes twice.
 */
const NOTE_PATH_LINE_SUFFIX = /(?::\d+(?:[-\u2013]\d+)?(?::\d+)?|#L\d+(?:-L?\d+)?)$/;

export function pathTokensIn(text) {
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
  moduleNamesByPath = new Map(),
}) {
  if (!repoRoot || typeof resolveTargetPath !== 'function') return [];
  const source = insideRepo(repoRoot, frontmatter?.path);
  if (!source) return [];
  const previous = previousFrontmatter ? declaredDependencies(previousFrontmatter) : new Set();
  const targets = [...declaredDependencies(frontmatter)].filter((target) => !previous.has(target));
  if (targets.length === 0) return [];
  const sourceRead = readWitnessText(source.absolute);
  if (sourceRead === null) return [];
  const readCache = new Map([[source.path, { ...sourceRead, path: source.path }]]);
  /**
   * A note path is tried from the repository root, then from each ancestor of the
   * citing file, nearest first, since writers copy editor-relative paths. Every
   * try stays clamped inside the repository and must be an existing file.
   */
  const sourceAncestors = [];
  for (let directory = dirname(source.path); directory && directory !== '.'; directory = dirname(directory)) {
    sourceAncestors.push(directory);
  }
  const readCandidate = (path) => {
    if (readCache.has(path)) return readCache.get(path);
    let read = null;
    for (const base of ['', ...sourceAncestors]) {
      const resolved = insideRepo(repoRoot, base ? `${base}/${path}` : path);
      if (!resolved) continue;
      const found = readWitnessText(resolved.absolute);
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
    if (reads.some((read) => read.text !== undefined && textWitnesses(read, resolved.path, witnessNames, moduleNamesByPath))) continue;
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
