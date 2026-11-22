// Java and Kotlin imports as file evidence. `import a.b.C;` (Kotlin: `import
// a.b.C`, `import a.b.c as d`) resolves to the file declaring that type under a
// source root the repository has; a static or nested import resolves through
// its longest type prefix; a wildcard resolves to that type, else to the
// package folder. A Kotlin file's top-level functions are also its facade class
// (`FileKt`, or its `@file:JvmName`). A type named in a file of the same
// package, which needs no import, is an edge too. A name that resolves inside
// no source root is external. Text is masked, never compiled or run.

import { confinedSourceReadsEnabled, readdirSync } from '../confinement/confined-source-fs.mjs';
import { dirname, join, relative, sep } from 'node:path';
import { isIgnoredPath } from '../source-files.mjs';
import { sourceRoleOf } from '../source-role.mjs';

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
const IMPORT = /^[ \t]*import[ \t]+(static[ \t]+)?([A-Za-z_$][\w$]*(?:[ \t]*\.[ \t]*[A-Za-z_$][\w$]*)*)([ \t]*\.[ \t]*\*)?(?:[ \t]+as[ \t]+([A-Za-z_$][\w$]*))?/gm;
/** Kotlin's `enum class X` names X: the second keyword is skipped, not read as the name. */
const TYPE_DECLARATION = /\b(?:class|interface|enum|record|object)[ \t\r\n]+(?:class[ \t\r\n]+)?([A-Za-z_$][\w$]*)/g;
/** A capitalised name not preceded by a dot: a type the code names directly, not a member or a qualified name. */
const TYPE_REFERENCE = /(?<![\w$.])[A-Z][\w$]*/g;
/** Type parameters a class, function or Java generic method declares: `class Store<State, Event>`, `fun <T>`, `static <T>`. */
const TYPE_PARAMETERS = /(?:\b(?:class|interface|record|fun)\b[ \t\r\n]*[\w$]*|\b(?:public|protected|private|static|final|abstract|synchronized|default)\b)[ \t\r\n]*<((?:[^<>\n]|<[^<>\n]{0,200}>){0,400})>/g;
const TYPE_PARAMETER_NAME = /(?:^|,)[ \t\r\n]*(?:(?:reified|in|out)[ \t\r\n]+)?([A-Za-z_$][\w$]*)/g;
const ENUM_BODY = /\benum\b[^{;]{0,400}\{/g;
const FILE_JVM_NAME = /@file[ \t]*:[ \t]*JvmName[ \t]*\([ \t]*(?:name[ \t]*=[ \t]*)?"/;
const JVM_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** No real package is this deep; a longer import is external without a probe, which keeps every path walk shallow. */
const MAX_IMPORT_SEGMENTS = 64;
/** Type arguments, one nested level deep (`<T : Enum<T>>`), are read up to 200 characters, so an unclosed `<` costs a bounded scan per declaration. */
const KOTLIN_DECLARATION = /\b(?:fun[ \t]+(?:<(?:[^<>\n]|<[^<>\n]{0,200}>){0,200}>[ \t]*)?|(?:val|var|typealias)[ \t]+)(?:[\w$]+(?:<(?:[^<>\n]|<[^<>\n]{0,200}>){0,200}>)?\??\.)*([A-Za-z_$][\w$]*)/g;

/**
 * The package and the imports of masked JVM source.
 *
 * @param {string} masked text from `maskJvmSource`
 * @returns {{ packageName: string|null, imports: { spec: string, wildcard: boolean, alias: string|null }[] }}
 */
export function jvmHeader(masked) {
  return {
    packageName: PACKAGE.exec(masked)?.[1].replace(/\s+/g, '') ?? null,
    imports: [...masked.matchAll(IMPORT)].map((match) => ({
      spec: match[2].replace(/\s+/g, ''),
      wildcard: Boolean(match[3]),
      alias: match[4] ?? null,
    })),
  };
}

/**
 * The package a JVM source file declares, its imports, the names it declares
 * at top level (a Kotlin file also its top-level functions and properties),
 * which of those are types, and the type names its code uses, read from masked
 * text in one pass over its bytes.
 *
 * @param {string} text
 * @param {string} path file path, to tell Kotlin from Java and to name the public type
 * @returns {{ packageName: string|null, imports: { spec: string, wildcard: boolean, alias: string|null }[], declarations: string[], types: string[], typeReferences: string[] }}
 */
export function parseJvmSource(text, path) {
  const kotlin = path.endsWith('.kt');
  const masked = maskJvmSource(text, { kotlin });
  const { packageName, imports } = jvmHeader(masked);
  const topLevel = topLevelOf(masked);
  const types = new Set([...topLevel.matchAll(TYPE_DECLARATION)].map((match) => match[1]));
  const declarations = new Set(types);
  const stem = (path.split(/[\\/]/).pop() ?? '').replace(/\.(?:java|kt)$/, '');
  if (kotlin) {
    let topLevelMembers = 0;
    for (const match of topLevel.matchAll(KOTLIN_DECLARATION)) {
      declarations.add(match[1]);
      topLevelMembers += 1;
    }
    const facade = topLevelMembers > 0 ? kotlinFacadeName(text, masked, stem) : null;
    if (facade) {
      declarations.add(facade);
      types.add(facade);
    }
  } else if (stem) {
    declarations.add(stem);
    types.add(stem);
  }
  const typeReferences = new Set(masked.match(TYPE_REFERENCE) ?? []);
  for (const name of localTypeNames(masked)) typeReferences.delete(name);
  return { packageName, imports, declarations: [...declarations], types: [...types], typeReferences: [...typeReferences] };
}

/**
 * Names the file binds itself, which a same-package type of that name cannot
 * be: every type it declares at any depth, its type parameters, and enum entries.
 */
function localTypeNames(masked) {
  const names = new Set([...masked.matchAll(TYPE_DECLARATION)].map((match) => match[1]));
  for (const match of masked.matchAll(TYPE_PARAMETERS)) {
    const flat = match[1].replace(/<[^<>]*>/g, '');
    for (const parameter of flat.matchAll(TYPE_PARAMETER_NAME)) names.add(parameter[1]);
  }
  let readUntil = 0;
  for (const match of masked.matchAll(ENUM_BODY)) {
    if (match.index < readUntil) continue;
    const { entries, end } = enumEntries(masked, match.index + match[0].length);
    for (const entry of entries) names.add(entry);
    readUntil = end;
  }
  return names;
}

/**
 * The entries of an enum body opened just before `from`: names at its own depth
 * before its first `;` or its close, and where reading stopped. A caller skips
 * enums opened before that point, so unclosed bodies are read once in all.
 */
function enumEntries(masked, from) {
  const entries = [];
  let depth = 0;
  let expectEntry = true;
  let index = from;
  for (; index < masked.length; index += 1) {
    const character = masked[index];
    if (character === '{' || character === '(' || character === '<') depth += 1;
    else if (character === '}' || character === ')' || character === '>') {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && character === ';') break;
    else if (depth === 0 && character === ',') expectEntry = true;
    else if (depth === 0 && character === '@') index += /^@[\w$.]*/.exec(masked.slice(index, index + 256))[0].length - 1;
    else if (depth === 0 && expectEntry && /[A-Za-z_$]/.test(character)) {
      const name = /^[\w$]+/.exec(masked.slice(index, index + 256))[0];
      entries.push(name);
      expectEntry = false;
      index += name.length - 1;
    }
  }
  return { entries, end: index };
}

/** The class Java sees a Kotlin file's top-level functions in: its `@file:JvmName`, else the file name, capitalised, with `Kt`. */
function kotlinFacadeName(text, masked, stem) {
  const annotation = FILE_JVM_NAME.exec(masked);
  if (annotation) {
    const open = annotation.index + annotation[0].length;
    const name = text.slice(open, masked.indexOf('"', open)).trim();
    if (JVM_IDENTIFIER.test(name)) return name;
  }
  if (!stem) return null;
  const identifier = stem.replace(/[^\w$]/g, '_');
  return `${identifier[0].toUpperCase()}${identifier.slice(1)}Kt`;
}

/** The module folder and source set of a file under `<module>/src/<set>/`, or null outside that layout. */
function sourceSetOf(file) {
  const parts = file.split(sep);
  const src = parts.lastIndexOf('src');
  if (src < 0 || src + 1 >= parts.length - 1) return null;
  return { module: parts.slice(0, src).join(sep), set: parts[src + 1] };
}

const TEST_SET = /test/i;

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
 * distinct import is resolved once, and each type name a file uses is looked up
 * once in its package: O(F + I + N + P·R) for F files, I imports, N type names
 * used and P distinct package prefixes probed in the R source roots holding
 * their parent folder.
 *
 * @param {{ file: string, packageName: string|null, imports: { spec: string, wildcard: boolean }[], declarations: string[], types: string[], typeReferences: string[] }[]} parsedFiles absolute paths
 * @param {{ rootPath: string, edges: object[], externalImports: object[], ignore: Set<string>, facts: ReturnType<import('../confinement/path-confinement.mjs').createPathFacts> }} pass
 */
export function classifyJvmImports(parsedFiles, { rootPath, edges, externalImports, ignore, facts }) {
  if (parsedFiles.length === 0) return;
  const declaredIn = new Map();
  const typesByPackage = new Map();
  const sourceSetOfFile = new Map();
  const roots = new Set();
  for (const parsed of parsedFiles) {
    const root = sourceRootOf(relative(rootPath, parsed.file), parsed.packageName);
    sourceSetOfFile.set(parsed.file, sourceSetOf(relative(rootPath, parsed.file)));
    if (root !== null) roots.add(root === '.' ? rootPath : join(rootPath, root));
    for (const name of parsed.declarations) {
      const qualified = parsed.packageName ? `${parsed.packageName}.${name}` : name;
      declaredIn.set(qualified, [...(declaredIn.get(qualified) ?? []), parsed.file]);
    }
    if (!parsed.packageName) continue;
    if (!typesByPackage.has(parsed.packageName)) typesByPackage.set(parsed.packageName, new Map());
    const packageTypes = typesByPackage.get(parsed.packageName);
    for (const name of parsed.types) packageTypes.set(name, [...(packageTypes.get(name) ?? []), parsed.file]);
  }
  for (const root of discoverSourceRoots(rootPath, ignore, facts)) roots.add(root);
  const sourceRoots = [...roots].sort();

  // Unconfined, a type file is probed only under roots holding its package folder, narrowed one
  // segment at a time and remembered, so a library import costs one folder probe per root.
  const narrowByFolder = !confinedSourceReadsEnabled();
  const rootsHolding = new Map([['', sourceRoots]]);
  const rootsWithFolder = (segments) => {
    const key = segments.join('/');
    let held = rootsHolding.get(key);
    if (held) return held;
    held = rootsWithFolder(segments.slice(0, -1)).filter((root) => facts.statKind(join(root, ...segments)) === 'directory');
    rootsHolding.set(key, held);
    return held;
  };
  const typeFiles = (parts) => {
    for (let length = parts.length; length >= 2; length -= 1) {
      const declared = declaredIn.get(parts.slice(0, length).join('.'));
      if (declared) return declared;
      for (const root of narrowByFolder ? rootsWithFolder(parts.slice(0, length - 1)) : sourceRoots) {
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
    targets = parts.length > MAX_IMPORT_SEGMENTS ? [] : typeFiles(parts);
    if (targets.length === 0 && wildcard) targets = packageFolders(parts);
    resolved.set(key, targets);
    return targets;
  };

  const seen = new Set();
  const addEdge = (from, target) => {
    const to = relative(rootPath, target);
    if (to === from || isIgnoredPath(to, ignore)) return;
    const key = `${from}\0${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind: 'static', sourceRole: sourceRoleOf(from), importUsage: 'value' });
  };
  for (const parsed of parsedFiles) {
    const from = relative(rootPath, parsed.file);
    for (const jvmImport of parsed.imports) {
      const targets = targetsOf(jvmImport);
      if (targets.length === 0) {
        externalImports.push({ from, spec: jvmImport.wildcard ? `${jvmImport.spec}.*` : jvmImport.spec });
        continue;
      }
      for (const target of targets) addEdge(from, target);
    }
    for (const target of samePackageTargets(parsed, typesByPackage, sourceSetOfFile)) addEdge(from, target);
  }
}

/**
 * Files of the same package declaring a type this file names without importing
 * it, matched by name. Only the file's own module is searched, since another
 * module's copy of the package may not be on its class path; there a twin in
 * the file's own source set wins, and code outside tests never reaches a test set.
 */
function samePackageTargets(parsed, typesByPackage, sourceSetOfFile) {
  const packageTypes = parsed.packageName ? typesByPackage.get(parsed.packageName) : null;
  if (!packageTypes) return [];
  const imported = new Set(parsed.imports.filter((entry) => !entry.wildcard).map((entry) => entry.alias ?? entry.spec.split('.').pop()));
  const own = sourceSetOfFile.get(parsed.file);
  const visible = (file) => {
    const other = sourceSetOfFile.get(file);
    if (!own || !other) return !own && !other;
    return other.module === own.module && (TEST_SET.test(own.set) || !TEST_SET.test(other.set));
  };
  const targets = [];
  for (const name of parsed.typeReferences) {
    if (imported.has(name)) continue;
    const declaring = (packageTypes.get(name) ?? []).filter((file) => file !== parsed.file && visible(file));
    const sameSet = declaring.filter((file) => sourceSetOfFile.get(file)?.set === own?.set);
    targets.push(...(sameSet.length > 0 ? sameSet : declaring));
  }
  return targets;
}
