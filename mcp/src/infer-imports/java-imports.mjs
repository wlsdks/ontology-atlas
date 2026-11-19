// Java and Kotlin imports as file evidence. `import a.b.C;` (Kotlin: `import
// a.b.C`, `import a.b.c as d`) resolves to the file declaring that type under a
// source root the repository has; a static or nested import resolves through
// its longest type prefix; a wildcard resolves to that type, else to the
// package folder. Same-package references carry no import and are not inferred.
// A name that resolves inside no source root is external. Text is masked, never
// compiled or run.

import { confinedSourceReadsEnabled, readdirSync } from './confined-source-fs.mjs';
import { dirname, join, relative, sep } from 'node:path';
import { isIgnoredPath } from './source-files.mjs';
import { sourceRoleOf } from './source-role.mjs';

const JVM_FILE_EXTENSIONS = ['.java', '.kt'];
const SOURCE_SET_LANGUAGES = ['java', 'kotlin'];
/** Module folders are looked for this many levels below the root (`core/`, `server/api/`). */
const MODULE_DEPTH = 2;

/**
 * The text with every comment and the inside of every string and character
 * literal replaced by spaces, newlines and quote marks kept, so offsets and
 * line numbers still hold and nothing written in prose or data reads as code.
 * Kotlin block comments nest and `${...}` templates are skipped whole.
 *
 * @param {string} text
 * @param {{ kotlin?: boolean }} [options]
 * @returns {string}
 */
export function maskJvmSource(text, { kotlin = false } = {}) {
  const source = String(text ?? '');
  const codes = codeUnits(source);
  const special = /\/[/*]|"""|["']/g;
  for (let match = special.exec(source); match; match = special.exec(source)) {
    const start = match.index;
    const opener = match[0];
    let end;
    if (opener === '//') {
      end = lineEnd(source, start);
      blankRange(codes, start, end);
    } else if (opener === '/*') {
      end = blockCommentEnd(source, start, kotlin);
      blankRange(codes, start, end);
    } else {
      const close = opener === '"""'
        ? source.indexOf('"""', start + 3)
        : literalClose(source, start, opener, kotlin);
      // An unclosed text block runs to the end; an unclosed one-line literal to its line's end.
      const contentEnd = close >= 0 ? close : opener === '"""' ? source.length : lineEnd(source, start);
      blankRange(codes, start + opener.length, contentEnd);
      end = close >= 0 ? close + opener.length : contentEnd;
    }
    special.lastIndex = end;
  }
  return textOf(codes);
}

function codeUnits(text) {
  const codes = new Uint16Array(text.length);
  for (let index = 0; index < text.length; index += 1) codes[index] = text.charCodeAt(index);
  return codes;
}

function textOf(codes) {
  return Buffer.from(codes.buffer, codes.byteOffset, codes.byteLength).toString('utf16le');
}

/** Spaces over `codes` from `from` to `to`, newlines kept. */
function blankRange(codes, from, to) {
  for (let index = from; index < to; index += 1) if (codes[index] !== 10) codes[index] = 32;
}

function lineEnd(source, start) {
  const end = source.indexOf('\n', start);
  return end < 0 ? source.length : end;
}

function blockCommentEnd(source, start, nested) {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      depth = nested ? depth + 1 : 1;
      index += 2;
    } else if (source.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
    } else {
      index += 1;
    }
  }
  return source.length;
}

/** The index of the quote closing a one-line literal opened at `start`, or -1 when the line ends first. */
function literalClose(source, start, quote, kotlin) {
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') index += 1;
    else if (character === '\n') return -1;
    else if (character === quote) return index;
    else if (kotlin && quote === '"' && character === '$' && source[index + 1] === '{') {
      let depth = 0;
      for (index += 1; index < source.length && source[index] !== '\n'; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}' && --depth === 0) break;
      }
      if (source[index] === '\n') return -1;
    }
  }
  return -1;
}

/**
 * The masked text with everything inside braces or parentheses blanked too,
 * the outermost brackets kept: what is left are the package, the imports and
 * the heads of top-level declarations, at their original offsets.
 */
function topLevelOf(masked) {
  const codes = codeUnits(masked);
  let depth = 0;
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    if (code === 123 || code === 40) {
      if (depth > 0) codes[index] = 32;
      depth += 1;
    } else if (code === 125 || code === 41) {
      depth = Math.max(0, depth - 1);
      if (depth > 0) codes[index] = 32;
    } else if (depth > 0 && code !== 10) {
      codes[index] = 32;
    }
  }
  return textOf(codes);
}

const PACKAGE = /^[ \t]*package[ \t]+([A-Za-z_$][\w$]*(?:[ \t]*\.[ \t]*[A-Za-z_$][\w$]*)*)/m;
const IMPORT = /^[ \t]*import[ \t]+(static[ \t]+)?([A-Za-z_$][\w$]*(?:[ \t]*\.[ \t]*[A-Za-z_$][\w$]*)*)([ \t]*\.[ \t]*\*)?/gm;
const TYPE_DECLARATION = /\b(?:class|interface|enum|record|object)[ \t\r\n]+([A-Za-z_$][\w$]*)/g;
const KOTLIN_DECLARATION = /\b(?:fun[ \t]+(?:<[^>\n]*>[ \t]*)?|(?:val|var|typealias)[ \t]+)(?:[\w$]+(?:<[^>\n]*>)?\??\.)*([A-Za-z_$][\w$]*)/g;

/**
 * The package and the imports of masked JVM source.
 *
 * @param {string} masked text from `maskJvmSource`
 * @returns {{ packageName: string|null, imports: { spec: string, wildcard: boolean }[] }}
 */
export function jvmHeader(masked) {
  return {
    packageName: PACKAGE.exec(masked)?.[1].replace(/\s+/g, '') ?? null,
    imports: [...masked.matchAll(IMPORT)].map((match) => ({
      spec: match[2].replace(/\s+/g, ''),
      wildcard: Boolean(match[3]),
    })),
  };
}

/**
 * The package a JVM source file declares, its imports, and the names it
 * declares at top level (a Kotlin file also its top-level functions and
 * properties), read from masked text.
 *
 * @param {string} text
 * @param {string} path file path, to tell Kotlin from Java and to name the public type
 * @returns {{ packageName: string|null, imports: { spec: string, wildcard: boolean }[], declarations: string[] }}
 */
export function parseJvmSource(text, path) {
  const kotlin = path.endsWith('.kt');
  const masked = maskJvmSource(text, { kotlin });
  const { packageName, imports } = jvmHeader(masked);
  const topLevel = topLevelOf(masked);
  const declarations = new Set([...topLevel.matchAll(TYPE_DECLARATION)].map((match) => match[1]));
  if (kotlin) for (const match of topLevel.matchAll(KOTLIN_DECLARATION)) declarations.add(match[1]);
  const stem = (path.split(/[\\/]/).pop() ?? '').replace(/\.(?:java|kt)$/, '');
  if (!kotlin && stem) declarations.add(stem);
  return { packageName, imports, declarations: [...declarations] };
}

/** The source root a file's package places it under (`.../src/main/java`), or null when its folder does not spell the package. */
function sourceRootOf(file, packageName) {
  if (!packageName) return null;
  const packagePath = packageName.split('.').join(sep);
  const folder = dirname(file);
  if (folder === packagePath) return '.';
  return folder.endsWith(`${sep}${packagePath}`) ? folder.slice(0, -packagePath.length - 1) : null;
}

/**
 * `src/<set>/java` and `src/<set>/kotlin` folders of the root and of module
 * folders up to two levels below it, real directories inside the root only.
 * Confined reads look nowhere beyond the scanned files' own roots, so a
 * snapshot is never asked about a folder the walk did not reach.
 */
function discoverSourceRoots(rootPath, ignore, facts) {
  if (confinedSourceReadsEnabled()) return [];
  const roots = [];
  const modules = [rootPath];
  for (let level = 0, frontier = [rootPath]; level < MODULE_DEPTH; level += 1) {
    const next = [];
    for (const folder of frontier) {
      for (const name of listNames(folder)) {
        if (name.startsWith('.') || ignore.has(name) || name === 'src') continue;
        const child = join(folder, name);
        if (facts.lstatKind(child) === 'directory') next.push(child);
      }
    }
    modules.push(...next);
    frontier = next;
  }
  for (const folder of modules) {
    const src = join(folder, 'src');
    if (facts.lstatKind(src) !== 'directory') continue;
    for (const set of listNames(src)) {
      if (set.startsWith('.') || ignore.has(set)) continue;
      for (const language of SOURCE_SET_LANGUAGES) {
        const root = join(src, set, language);
        if (facts.lstatKind(join(src, set)) === 'directory' && facts.lstatKind(root) === 'directory' && facts.resolvesInsideRoot(root)) {
          roots.push(root);
        }
      }
    }
  }
  return roots;
}

function listNames(folder) {
  try {
    return readdirSync(folder).sort();
  } catch {
    return [];
  }
}

/**
 * Edges, external imports and nothing else for the parsed JVM files of one
 * pass. A type index from the scanned files answers first; a source root is
 * probed through `facts` for a type in a file the walk did not reach. Each
 * distinct import is resolved once: O(F + I + D·R) for F files, I imports and D
 * distinct imports probed in R source roots.
 *
 * @param {{ file: string, packageName: string|null, imports: { spec: string, wildcard: boolean }[], declarations: string[] }[]} parsedFiles absolute paths
 * @param {{ rootPath: string, edges: object[], externalImports: object[], ignore: Set<string>, facts: ReturnType<import('./path-confinement.mjs').createPathFacts> }} pass
 */
export function classifyJvmImports(parsedFiles, { rootPath, edges, externalImports, ignore, facts }) {
  if (parsedFiles.length === 0) return;
  const declaredIn = new Map();
  const roots = new Set();
  for (const parsed of parsedFiles) {
    const root = sourceRootOf(relative(rootPath, parsed.file), parsed.packageName);
    if (root !== null) roots.add(root === '.' ? rootPath : join(rootPath, root));
    for (const name of parsed.declarations) {
      const qualified = parsed.packageName ? `${parsed.packageName}.${name}` : name;
      declaredIn.set(qualified, [...(declaredIn.get(qualified) ?? []), parsed.file]);
    }
  }
  for (const root of discoverSourceRoots(rootPath, ignore, facts)) roots.add(root);
  const sourceRoots = [...roots].sort();

  const typeFiles = (parts) => {
    for (let length = parts.length; length >= 2; length -= 1) {
      const declared = declaredIn.get(parts.slice(0, length).join('.'));
      if (declared) return declared;
      for (const root of sourceRoots) {
        for (const extension of JVM_FILE_EXTENSIONS) {
          const file = `${join(root, ...parts.slice(0, length))}${extension}`;
          if (facts.isOwnFile(file)) return [file];
        }
      }
    }
    return [];
  };
  const packageFolders = (parts) =>
    sourceRoots
      .map((root) => join(root, ...parts))
      .filter((folder) => facts.lstatKind(folder) === 'directory' && facts.resolvesInsideRoot(folder));
  const resolved = new Map();
  const targetsOf = ({ spec, wildcard }) => {
    const key = `${wildcard ? '*' : ''}${spec}`;
    let targets = resolved.get(key);
    if (targets) return targets;
    const parts = spec.split('.');
    targets = typeFiles(parts);
    if (targets.length === 0 && wildcard) targets = packageFolders(parts);
    resolved.set(key, targets);
    return targets;
  };

  const seen = new Set();
  for (const parsed of parsedFiles) {
    const from = relative(rootPath, parsed.file);
    for (const jvmImport of parsed.imports) {
      const targets = targetsOf(jvmImport);
      if (targets.length === 0) {
        externalImports.push({ from, spec: jvmImport.wildcard ? `${jvmImport.spec}.*` : jvmImport.spec });
        continue;
      }
      for (const target of targets) {
        const to = relative(rootPath, target);
        if (to === from || isIgnoredPath(to, ignore)) continue;
        const key = `${from}\0${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from, to, kind: 'static', sourceRole: sourceRoleOf(from), importUsage: 'value' });
      }
    }
  }
}
