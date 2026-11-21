/**
 * The members of the family a declaration belongs to, by the ties its source
 * writes, or null whenever any member cannot be decided. A wrong count is a
 * false fact handed to a builder, so nothing here guesses.
 *
 * - **Classes** (JavaScript and TypeScript, Python, Rust trait impls): a class
 *   header's base reference is resolved to one declaration through the file's
 *   own declarations and its imports, the way a call is (`declaration-survey`),
 *   following named re-exports up to three modules deep and a workspace
 *   package's entry file. A base that resolves to nothing in the repository, or
 *   to more than one declaration, has no family. Every class in that language
 *   whose header names the base's last segment is resolved the same way; one
 *   that cannot be resolved, or a header that could not be read in a file
 *   naming the base, withholds the family.
 * - **Go types**: an interface the repository declares with two or more
 *   methods, all with readable signatures. A member is a type in the
 *   interface's package or in a package importing it whose method set,
 *   promoted methods from embedded types included, has each method with the
 *   same parameter and result types. A type in scope whose embedded type
 *   cannot be followed, and that lacks a method, withholds the family.
 * - **Truncation**: a walk that stopped at its file cap has no families; a
 *   file whose declarations were cut short (past the size cap, or an outline
 *   that stopped early) withholds every family it could hold a member of.
 *
 * The index is one pass over the cached declarations; each family costs its
 * candidates, with caps past which there is no family.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { blankLiterals, importLines } from './code-text.mjs';
import { declarationsByFile } from './declaration-index.mjs';
import { buildSurvey } from './declaration-survey.mjs';
import { childSpec, importsOf, languageOf } from './import-bindings.mjs';

const TYPE_KINDS = new Set(['class', 'interface', 'struct', 'type', 'enum', 'trait']);
const CLASS_LANGUAGES = new Set(['js', 'py', 'rs']);
const MAX_FILE_BYTES = 256 * 1024;
const FAMILY_LIMITS = Object.freeze({
  candidates: 512,
  openHeaders: 64,
  interfaces: 16,
  scopeTypes: 4096,
  reexportDepth: 3,
  aliasFiles: 512,
  aliasesPerFile: 64,
  names: 256,
  embedDepth: 4,
  workspaceDirs: 8,
  configs: 16,
});
// Promoted methods of standard-library types a struct commonly embeds.
const KNOWN_EMBEDS = new Map([
  ['sync\0Mutex', { Lock: '()()', Unlock: '()()', TryLock: '()(bool)' }],
  ['sync\0RWMutex', { Lock: '()()', Unlock: '()()', RLock: '()()', RUnlock: '()()', TryLock: '()(bool)', TryRLock: '()(bool)', RLocker: '()(Locker)' }],
  ['sync\0WaitGroup', { Add: '(int)()', Done: '()()', Wait: '()()', Go: '(func())()' }],
  ['sync\0Once', { Do: '(func())()' }],
]);
const CONFIG_BYTES = 64 * 1024;
const ENTRY_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];
// What a module's default export names: `export default class X`, `export default X`, `module.exports = X`.
// Each runs on one trimmed line of at most `LINE_CHARS` characters, and no two
// of its repeated parts can match the same characters, so a line costs one pass.
const DEFAULT_EXPORTS = [
  /^export\s+default\s+(?:abstract\s+)?(?:class|interface)\s+([A-Za-z_$][\w$]*)/u,
  /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?$/u,
  /^module\.exports\s*=\s*(?:class\s+)?([A-Za-z_$][\w$]*)/u,
];
const LINE_CHARS = 2000;
// Lines and characters an `export { … }` list is read over.
const LIST_LINES = 40;
const LIST_CHARS = 4000;

function readable(path, text) {
  let blanked = null;
  let codeLines = null;
  let imports = null;
  let identifiers = null;
  const blankedOf = () => (blanked ??= blankLiterals(text, path));
  return {
    path,
    text,
    lines: text.split('\n'),
    get codeLines() {
      return (codeLines ??= blankedOf().code.split('\n'));
    },
    get imports() {
      return (imports ??= { path, lines: importLines(text, blankedOf()) });
    },
    get identifiers() {
      return (identifiers ??= new Set(blankedOf().code.match(/[A-Za-z_$][\w$]*/gu) ?? []));
    },
  };
}

// The stem a JavaScript module path resolves under: no extension, no `/index`.
const jsStem = (path) => path.replace(/\.(?:d\.)?[cm]?[jt]sx?$/u, '').replace(/\/index$/u, '');

/** JSON with line and block comments and trailing commas, as `tsconfig.json` allows, made plain. */
function withoutJsonComments(text) {
  return text.replace(/("(?:\\.|[^"\\\n])*")|\/\/[^\n]*|\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//gu, (match, string) => string ?? '').replace(/,(\s*[}\]])/gu, '$1');
}

// Imports read as the family count reads them (`importsOf`).
const FAMILY_READ = Object.freeze({ family: true });

const lastSegment = (name) => String(name).split('.').pop();
const sameDeclaration = (a, b) => a && b && typeof a === 'object' && typeof b === 'object' && a.path === b.path && a.line === b.line;
const isType = (declaration, path) => TYPE_KINDS.has(declaration.kind) && !(declaration.kind === 'class' && path.endsWith('.rs'));

/**
 * The families of one repository walk.
 *
 * @param {string} repoRoot absolute repository root
 * @param {object[]} files product files (`productWalk`)
 * @param {{ truncated?: boolean }} [walk] whether the walk stopped before it listed every file
 */
export function createFamilies(repoRoot, files, { truncated: walkTruncated = false } = {}) {
  const byPath = new Map();
  const mayNameIn = new Map();
  const goImportsOf = new Map();
  const index = new Map();
  const classesByBase = new Map();
  const openHeaders = [];
  const folderNames = new Set();
  const dirs = new Set();
  const goTypes = new Map();
  const goFaces = new Map();
  const goMethods = new Map();
  const goFacesByMethod = new Map();
  const goFolderTypes = new Map();
  const goFolderFiles = new Map();
  const defaultLocalsIn = new Map();
  const defaultCandidates = [];
  const cutShort = [];
  const add = (map, key, value) => {
    const held = map.get(key);
    if (held) held.push(value);
    else map.set(key, [value]);
  };
  for (const { path, declarations, goImports, defaultImports, truncated, capped, importsCut, mayName } of declarationsByFile(repoRoot, { files })) {
    byPath.set(path, declarations);
    mayNameIn.set(path, mayName);
    // A file past the size cap was never read: it may name anything.
    if (truncated) cutShort.push({ path, language: languageOf(path), folder: posix.dirname(path), mayName: capped ? () => true : mayName, defaults: Boolean(defaultImports?.length) || importsCut });
    const defaults = new Set(defaultImports ?? []);
    if (defaults.size) defaultLocalsIn.set(path, [...defaults]);
    const folder = posix.dirname(path);
    for (let directory = folder; directory !== '.' && directory !== '/' && !dirs.has(directory); directory = posix.dirname(directory)) {
      dirs.add(directory);
      folderNames.add(posix.basename(directory));
    }
    const go = path.endsWith('.go');
    if (go) {
      goImportsOf.set(path, goImports ?? []);
      add(goFolderFiles, folder, path);
    }
    for (const declaration of declarations) {
      add(index, declaration.name, { path, line: declaration.line, kind: declaration.kind, name: declaration.name });
      if (declaration.kind === 'class' && declaration.open) openHeaders.push(path);
      for (const ref of declaration.bases ?? []) {
        add(classesByBase, lastSegment(ref), { path, declaration, ref });
        if (defaults.has(ref)) defaultCandidates.push({ path, declaration, ref });
      }
      if (!go) continue;
      const key = `${folder}\0${declaration.name}`;
      if (declaration.kind === 'interface') {
        goFaces.set(key, { folder, path, declaration });
        if (declaration.methods?.length >= 2) {
          for (const method of new Set(declaration.methods.map((row) => row.name))) add(goFacesByMethod, method, { folder, path, declaration });
        }
      } else if (declaration.kind === 'struct' || declaration.kind === 'type') {
        if (!goTypes.has(key)) goTypes.set(key, { folder, path, declaration });
        add(goFolderTypes, folder, key);
      } else if (declaration.kind === 'method' && declaration.name.includes('.')) {
        const receiver = declaration.name.slice(0, declaration.name.lastIndexOf('.'));
        const typeKey = `${folder}\0${receiver}`;
        let methods = goMethods.get(typeKey);
        if (!methods) {
          goMethods.set(typeKey, (methods = new Map()));
          add(goFolderTypes, folder, typeKey);
        }
        const method = lastSegment(declaration.name);
        if (!methods.has(method)) methods.set(method, { path, line: declaration.line, signature: declaration.signature ?? null });
      }
    }
  }
  for (const [folder, keys] of goFolderTypes) goFolderTypes.set(folder, [...new Set(keys)]);
  const paths = [...byPath.keys()];
  const productPaths = new Set(paths);
  let survey = null;
  const surveyed = () => (survey ??= buildSurvey(paths, index));

  const texts = new Map();
  /**
   * A product file, or null past the size cap: its text and lines; `codeLines`
   * with comments and strings blanked; `imports`, the lines its imports are read
   * from; and `identifiers`, every name its code writes.
   */
  function fileOf(path) {
    if (texts.has(path)) return texts.get(path);
    let file = null;
    try {
      const text = readFileSync(join(repoRoot, path), 'utf8');
      if (text.length <= MAX_FILE_BYTES) file = readable(path, text);
    } catch {
      file = null;
    }
    texts.set(path, file);
    return file;
  }

  const workspaceEntries = new Map();
  /**
   * The files of the workspace package a bare specifier names: its entry (its
   * `source`, `types` or `main`, mapped from a build folder to `src/`), or the
   * module a subpath names inside it. The package name must match exactly.
   */
  function workspaceEntry(raw) {
    if (workspaceEntries.has(raw)) return workspaceEntries.get(raw);
    const segments = raw.split('/');
    const packageName = segments.slice(0, raw.startsWith('@') ? 2 : 1).join('/');
    const subpath = segments.slice(raw.startsWith('@') ? 2 : 1).join('/');
    const leaf = posix.basename(packageName);
    const found = [];
    for (const directory of [...dirs].filter((candidate) => posix.basename(candidate) === leaf).slice(0, FAMILY_LIMITS.workspaceDirs)) {
      let manifest = null;
      try {
        if (existsSync(join(repoRoot, directory, 'package.json'))) manifest = JSON.parse(readFileSync(join(repoRoot, directory, 'package.json'), 'utf8'));
      } catch {
        manifest = null;
      }
      const name = typeof manifest?.name === 'string' ? manifest.name : '';
      if (name !== packageName) continue;
      if (subpath) {
        found.push(...[posix.join(directory, subpath), posix.join(directory, 'src', subpath)].flatMap((stem) => surveyed().modulePaths({ exact: jsStem(stem) })));
        continue;
      }
      const fields = [manifest.source, manifest.types, manifest.typings, manifest.module, manifest.main, manifest.exports?.['.']?.import, manifest.exports?.['.']?.default]
        .filter((value) => typeof value === 'string');
      const tries = [];
      for (const field of fields) {
        const entry = posix.normalize(field.replace(/^\.\//u, ''));
        tries.push(entry);
        const stem = entry.replace(/^(?:dist|lib|build|out|esm|cjs)\//u, 'src/').replace(/(?:\.d)?\.[cm]?[jt]sx?$/u, '');
        for (const extension of ENTRY_EXTENSIONS) tries.push(`${stem}${extension}`);
      }
      tries.push('src/index.ts', 'src/index.tsx', 'src/index.js', 'index.ts', 'index.js');
      const entry = tries.map((candidate) => posix.join(directory, candidate)).find((candidate) => productPaths.has(candidate));
      if (entry) found.push(entry);
    }
    const list = found.length === 1 ? found : [];
    workspaceEntries.set(raw, list);
    return list;
  }

  let configs = null;
  /** Each `tsconfig.json` or `jsconfig.json` in the folder: its folder, `baseUrl` and `paths`. */
  function pathConfigs() {
    if (configs) return configs;
    configs = [];
    for (const directory of ['', ...dirs]) {
      for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const file = join(repoRoot, directory, name);
        try {
          if (!existsSync(file)) continue;
          const text = readFileSync(file, 'utf8');
          if (text.length > CONFIG_BYTES) continue;
          const options = JSON.parse(withoutJsonComments(text))?.compilerOptions ?? {};
          const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : null;
          const paths = options.paths && typeof options.paths === 'object' ? options.paths : null;
          if (baseUrl !== null || paths) configs.push({ dir: directory, base: posix.join(directory, baseUrl ?? '.'), paths: paths ?? {}, baseUrl: baseUrl !== null });
        } catch {
          // An unreadable config maps nothing.
        }
        if (configs.length >= FAMILY_LIMITS.configs) return configs;
      }
    }
    return configs;
  }

  /** The files a non-relative JavaScript specifier names here: through a config's `paths` or `baseUrl`, or a workspace package; a bare package name names none. */
  function packagePaths(spec) {
    const raw = spec.raw;
    if (typeof raw !== 'string') return [];
    const stems = [];
    for (const config of pathConfigs()) {
      for (const [key, targets] of Object.entries(config.paths)) {
        const star = key.indexOf('*');
        const rest = star < 0 ? (raw === key ? '' : null) : raw.startsWith(key.slice(0, star)) && raw.endsWith(key.slice(star + 1)) && raw.length >= key.length - 1
          ? raw.slice(star, raw.length - (key.length - star - 1)) : null;
        if (rest === null) continue;
        for (const target of Array.isArray(targets) ? targets : []) if (typeof target === 'string') stems.push(posix.join(config.base, target.replace('*', rest)));
      }
      if (config.baseUrl) stems.push(posix.join(config.base, raw));
    }
    const found = [...new Set(stems.map(posix.normalize).filter((stem) => !stem.startsWith('..')).flatMap((stem) => surveyed().modulePaths({ exact: jsStem(stem) })))];
    return found.length > 0 ? found : workspaceEntry(raw);
  }

  const sourceRoots = new Map();
  /** Whether a Python file reached by absolute module path `tail` sits under a source root, not inside another package. */
  function underSourceRoot(path, tail) {
    const stem = path.replace(/\.pyi?$/u, '').replace(/\/__init__$/u, '');
    if (!stem.endsWith(tail)) return false;
    const root = stem.slice(0, stem.length - tail.length).replace(/\/$/u, '');
    if (root === '') return true;
    if (!sourceRoots.has(root)) sourceRoots.set(root, !existsSync(join(repoRoot, root, '__init__.py')));
    return sourceRoots.get(root);
  }

  /** A spec that names no module here and whose first segment is no folder or package here: outside the repository. */
  function external(spec) {
    if (!spec || spec.exact || spec.internal || spec.go) return false;
    const segments = String(spec.tail ?? '').split('/');
    return !segments.some((segment) => folderNames.has(segment));
  }

  /**
   * The files a module spec names in `language`. A non-relative JavaScript
   * specifier names a file only through a config's `paths` or `baseUrl` or a
   * workspace package, so `events` is Node's module even beside an `events.ts`;
   * an absolute Python module path names a file only from a source root.
   */
  function modulePaths(spec, language) {
    if (!spec) return [];
    if (language === 'js' && !spec.exact) return packagePaths(spec).filter((path) => languageOf(path) === language);
    const list = surveyed().modulePaths(spec).filter((path) => languageOf(path) === language);
    return language === 'py' && !spec.exact && spec.tail ? list.filter((path) => underSourceRoot(path, spec.tail)) : list;
  }

  /** One declaration all results agree on, `external` when all are outside, else null. */
  function agree(results) {
    if (results.length === 0 || results.some((result) => result === null)) return null;
    if (results.every((result) => result === 'external')) return 'external';
    if (results.some((result) => result === 'external')) return null;
    return results.every((result) => sameDeclaration(result, results[0])) ? results[0] : null;
  }

  /** The type `name` the module `spec` declares or re-exports by name. */
  function resolveExport(spec, name, language, depth) {
    if (!spec) return null;
    if (name === 'default' && language === 'js') return resolveDefault(spec, language, depth);
    const list = modulePaths(spec, language);
    if (list.length === 0) return external(spec) ? 'external' : null;
    const found = list.flatMap((path) => (byPath.get(path) ?? [])
      .filter((declaration) => isType(declaration, path) && declaration.name === name)
      .map((declaration) => ({ path, line: declaration.line, name })));
    if (found.length === 1) return found[0];
    if (found.length > 1 || depth >= FAMILY_LIMITS.reexportDepth) return null;
    const results = [];
    for (const path of list) {
      const file = fileOf(path);
      if (!file) return null;
      for (const row of importsOf(file.imports, FAMILY_READ).names.get(name) ?? []) results.push(resolveExport(row.spec, row.imported, language, depth + 1));
    }
    return agree(results);
  }

  /** The type `name` means in `path`: its own declaration, or what an import of that name resolves to. */
  function resolveName(path, name, language, depth) {
    const file = fileOf(path);
    if (!file) return null;
    const local = (byPath.get(path) ?? []).filter((declaration) => isType(declaration, path) && declaration.name === name);
    if (local.length === 1) return { path, line: local[0].line, name };
    if (local.length > 1) return null;
    const bindings = importsOf(file.imports, FAMILY_READ);
    const rows = bindings.names.get(name);
    if (!rows) return null;
    // `import Name from` binds whatever the module exports by default, under any name.
    const byDefault = (row) => language === 'js' && row.imported === name && bindings.modules.get(name) === row.spec;
    return agree(rows.map((row) => (byDefault(row) ? resolveDefault(row.spec, language, depth) : resolveExport(row.spec, row.imported, language, depth))));
  }

  const defaults = new Map();
  /** The type a module's default export names, `external`, or null when it cannot be told. */
  function resolveDefault(spec, language, depth) {
    const list = modulePaths(spec, language);
    if (list.length === 0) return external(spec) ? 'external' : null;
    if (depth >= FAMILY_LIMITS.reexportDepth) return null;
    return agree(list.map((path) => defaultOf(path, language, depth)));
  }

  /** The type the module at `path` exports by default, or null when it cannot be told. */
  function defaultOf(path, language, depth) {
    if (defaults.has(path)) return defaults.get(path);
    defaults.set(path, null);
    const file = fileOf(path);
    let result = null;
    if (file) {
      const names = new Set();
      const lines = file.codeLines;
      for (let at = 0; at < lines.length; at += 1) {
        const line = lines[at];
        if (line.length > LINE_CHARS) continue;
        const trimmed = line.trim();
        if (!/^(?:export|module)\b/u.test(trimmed)) continue;
        for (const pattern of DEFAULT_EXPORTS) {
          const match = pattern.exec(trimmed);
          if (match) names.add(match[1]);
        }
        if (!/^export\s*\{/u.test(trimmed)) continue;
        let list = trimmed;
        let end = at;
        while (!list.includes('}') && end + 1 < lines.length && end - at < LIST_LINES && list.length < LIST_CHARS && lines[end + 1].length <= LINE_CHARS) {
          end += 1;
          list += ` ${lines[end].trim()}`;
        }
        at = end;
        const close = list.indexOf('}');
        if (close < 0) continue;
        if (/^\s*from\b/u.test(list.slice(close + 1, close + 64))) continue;
        for (const item of list.slice(list.indexOf('{') + 1, close).split(',')) {
          const words = item.trim().split(/\s+/u);
          if (words.length === 3 && words[1] === 'as' && words[2] === 'default') names.add(words[0]);
        }
      }
      const reexports = importsOf(file.imports, FAMILY_READ).names.get('default') ?? [];
      if (names.size === 1 && reexports.length === 0) result = resolveName(path, [...names][0], language, depth + 1);
      else if (names.size === 0 && reexports.length === 1) result = resolveExport(reexports[0].spec, reexports[0].imported, language, depth + 1);
    }
    defaults.set(path, result);
    return result;
  }

  /** The declaration a base reference written in `path` names, `external`, or null when it cannot be told. */
  function resolveReference(path, reference) {
    const file = fileOf(path);
    if (!file) return null;
    const language = languageOf(path);
    const segments = reference.split('.');
    if (segments.length === 1) return resolveName(path, segments[0], language, 0);
    const bindings = importsOf(file.imports, FAMILY_READ);
    let spec = bindings.modules.get(segments[0]) ?? null;
    for (const middle of segments.slice(1, -1)) spec = spec ? childSpec(spec, middle) : null;
    return spec ? resolveExport(spec, segments.at(-1), language, 0) : null;
  }

  const aliasMaps = new Map();
  /**
   * What a file's imports and re-exports rename, built once: imported name ->
   * local names, and the rows that bind a module's default. Null past the
   * alias cap.
   */
  function aliasMapOf(path) {
    if (aliasMaps.has(path)) return aliasMaps.get(path);
    const file = fileOf(path);
    let map = null;
    if (file) {
      const renamed = new Map();
      const defaults = [];
      let count = 0;
      for (const [local, rows] of importsOf(file.imports, FAMILY_READ).names) {
        if (local === 'default') continue;
        for (const row of rows) {
          if (row.imported === 'default') defaults.push({ local, spec: row.spec });
          else if (row.imported !== local) {
            const held = renamed.get(row.imported);
            if (held) held.push(local);
            else renamed.set(row.imported, [local]);
          } else continue;
          count += 1;
        }
      }
      map = count > FAMILY_LIMITS.aliasesPerFile ? null : { renamed, defaults };
    }
    aliasMaps.set(path, map);
    return map;
  }

  /**
   * The names `base` may be written under in `language`: its own and every local
   * name an import or re-export gives it, followed a few rounds; null past a cap
   * or when the names have not settled.
   */
  function namesOf(base, language) {
    const names = new Set([base.name]);
    const scanned = new Set();
    // A base its module exports by default is also reached as `default`: `export { default as Channel } from './base'`.
    const byDefault = language === 'js' && sameDeclaration(defaultOf(base.path, language, 0), base);
    const mentions = (mayName) => (byDefault && mayName('default')) || [...names].some((name) => mayName(name));
    for (let round = 0; round < FAMILY_LIMITS.reexportDepth; round += 1) {
      const before = names.size;
      // A file read in an earlier round is read again: a name found since may be the one it renames.
      for (const [path, mayName] of mayNameIn) {
        if (languageOf(path) !== language || !mentions(mayName)) continue;
        scanned.add(path);
        if (scanned.size > FAMILY_LIMITS.aliasFiles) return null;
        const map = aliasMapOf(path);
        if (!map) return null;
        for (const name of [...names]) for (const local of map.renamed.get(name) ?? []) names.add(local);
        if (byDefault) for (const { local, spec } of map.defaults) if (modulePaths(spec, language).includes(base.path)) names.add(local);
        if (names.size > FAMILY_LIMITS.names) return null;
      }
      // Names still growing after the last round may not all be found.
      if (names.size === before) return names;
    }
    return null;
  }

  const memberSets = new Map();
  /** Every class whose header names `base`, or null when one cannot be decided. */
  function classMembers(base, language) {
    const key = `${base.path}\0${base.line}`;
    if (!memberSets.has(key)) memberSets.set(key, findClassMembers(base, language));
    return memberSets.get(key);
  }

  function findClassMembers(base, language) {
    const names = namesOf(base, language);
    if (!names) return null;
    // A member may be cut from a file whose declarations were not all read.
    if (cutShort.some((file) => file.language === language && (file.defaults || [...names].some((name) => file.mayName(name))))) return null;
    const candidates = [...names].flatMap((name) => classesByBase.get(name) ?? [])
      .concat(defaultCandidates.filter((candidate) => !names.has(candidate.ref)))
      .filter((candidate) => languageOf(candidate.path) === language);
    if (candidates.length > FAMILY_LIMITS.candidates) return null;
    const unread = [...new Set(openHeaders)].filter((path) => languageOf(path) === language
      && (defaultLocalsIn.has(path) || [...names].some((name) => mayNameIn.get(path)?.(name))));
    if (unread.length > FAMILY_LIMITS.openHeaders) return null;
    for (const path of unread) {
      const file = fileOf(path);
      if (!file || [...names].some((name) => file.identifiers.has(name))) return null;
      for (const local of defaultLocalsIn.get(path) ?? []) {
        const resolved = resolveReference(path, local);
        if (resolved === null || sameDeclaration(resolved, base)) return null;
      }
    }
    const members = new Map();
    for (const { path, declaration, ref } of candidates) {
      const resolved = resolveReference(path, ref);
      if (resolved === null) return null;
      if (sameDeclaration(resolved, base)) members.set(`${path}\0${declaration.line}`, { name: declaration.name, path, line: declaration.line, kind: 'class' });
    }
    return [...members.values()];
  }

  function classFamily(path, declaration) {
    const language = languageOf(path);
    if (!CLASS_LANGUAGES.has(language)) return null;
    const owner = declaration.kind === 'class' ? declaration : structureOf(path)?.ownerOf.get(declaration) ?? null;
    if (!owner?.bases || owner.open) return null;
    for (const ref of owner.bases) {
      const base = resolveReference(path, ref);
      if (base === null || base === 'external') continue;
      const members = classMembers(base, language);
      if (members === null) return null;
      if (members.length >= 2 && members.some((member) => member.path === path && member.line === owner.line)) {
        return { members, base, method: owner === declaration ? null : lastSegment(declaration.name), tie: 'class' };
      }
    }
    return null;
  }

  const importFolders = new Map();
  /** The repository folder a Go import path names, or null. */
  function goFolder(importPath) {
    if (importFolders.has(importPath)) return importFolders.get(importPath);
    const list = surveyed().modulePaths({ go: importPath }).filter((path) => path.endsWith('.go'));
    const folders = new Set(list.map((path) => posix.dirname(path)));
    const folder = folders.size === 1 ? [...folders][0] : null;
    importFolders.set(importPath, folder);
    return folder;
  }

  let importers = null;
  /** Folders whose files import the package in `folder`. */
  function importersOf(folder) {
    if (!importers) {
      importers = new Map();
      for (const [path, imports] of goImportsOf) {
        for (const [, importPath] of imports) {
          const target = goFolder(importPath);
          if (target) add(importers, target, posix.dirname(path));
        }
      }
      for (const [key, list] of importers) importers.set(key, [...new Set(list)]);
    }
    return importers.get(folder) ?? [];
  }

  const effective = new Map();
  /** A Go type's method set with promoted methods: name -> signature (null when unreadable), and `unknown` when an embedded type cannot be followed. */
  function methodSet(key, depth = 0) {
    if (effective.has(key)) return effective.get(key);
    const set = { methods: new Map(), unknown: true };
    effective.set(key, set);
    for (const [name, row] of goMethods.get(key) ?? []) set.methods.set(name, row.signature);
    const type = goTypes.get(key);
    let unknown = !type || Boolean(type.declaration.open);
    const imports = new Map(type ? goImportsOf.get(type.path) ?? [] : []);
    for (const embed of type?.declaration.embeds ?? []) {
      let embedKey = null;
      if (embed.includes('.')) {
        const [local, name] = embed.split('.');
        const importPath = imports.get(local);
        const known = importPath ? KNOWN_EMBEDS.get(`${importPath}\0${name}`) : null;
        if (known) {
          for (const [method, signature] of Object.entries(known)) if (!set.methods.has(method)) set.methods.set(method, signature);
          continue;
        }
        const folder = importPath ? goFolder(importPath) : null;
        embedKey = folder ? `${folder}\0${name}` : null;
      } else embedKey = `${type.folder}\0${embed}`;
      const face = embedKey ? goFaces.get(embedKey) : null;
      if (face) {
        if (face.declaration.open) unknown = true;
        for (const row of face.declaration.methods ?? []) if (!set.methods.has(row.name)) set.methods.set(row.name, row.signature);
        continue;
      }
      if (!embedKey || (!goTypes.has(embedKey) && !goMethods.has(embedKey)) || depth >= FAMILY_LIMITS.embedDepth) {
        unknown = true;
        continue;
      }
      const promoted = methodSet(embedKey, depth + 1);
      if (promoted.unknown) unknown = true;
      for (const [method, signature] of promoted.methods) if (!set.methods.has(method)) set.methods.set(method, signature);
    }
    set.unknown = unknown;
    return set;
  }

  /** true, false, or null when a method of that name has an unreadable signature. */
  function covers(set, face) {
    let all = true;
    for (const { name, signature } of face.declaration.methods) {
      if (!set.methods.has(name)) {
        all = false;
        continue;
      }
      const own = set.methods.get(name);
      if (own === null) return null;
      if (own !== signature) all = false;
    }
    return all;
  }

  function goMembers(face, method) {
    const folders = [face.folder, ...importersOf(face.folder)];
    const scope = new Set(folders);
    if (cutShort.some((file) => file.language === 'go' && scope.has(file.folder))) return null;
    const keys = [...new Set(folders.flatMap((folder) => goFolderTypes.get(folder) ?? []))];
    if (keys.length > FAMILY_LIMITS.scopeTypes) return null;
    const members = [];
    for (const key of keys) {
      const set = methodSet(key);
      const covered = covers(set, face);
      if (covered === null) return null;
      if (covered) {
        const at = goMethods.get(key)?.get(method);
        const type = goTypes.get(key);
        members.push({ name: key.split('\0')[1], path: at?.path ?? type.path, line: at?.line ?? type.declaration.line, kind: at ? 'method' : 'type', key });
      } else if (set.unknown) return null;
    }
    return members;
  }

  function goFamily(path, declaration) {
    if (!path.endsWith('.go') || declaration.kind !== 'method' || !declaration.name.includes('.')) return null;
    const receiver = declaration.name.slice(0, declaration.name.lastIndexOf('.'));
    const method = lastSegment(declaration.name);
    const own = methodSet(`${posix.dirname(path)}\0${receiver}`);
    if (own.unknown) return null;
    // An interface or a type with this method may sit in what a cut-short file did not list.
    if (cutShort.some((file) => file.language === 'go' && file.mayName(method))) return null;
    const faces = goFacesByMethod.get(method) ?? [];
    if (faces.length > FAMILY_LIMITS.interfaces) return null;
    const covered = [];
    for (const face of faces) {
      const result = covers(own, face);
      if (result === null) return null;
      if (result) covered.push(face);
    }
    if (covered.length === 0) return null;
    const width = Math.max(...covered.map((face) => face.declaration.methods.length));
    const widest = covered.filter((face) => face.declaration.methods.length === width);
    const sets = widest.map((face) => goMembers(face, method));
    if (sets.some((set) => set === null)) return null;
    const keys = sets.map((set) => set.map((member) => member.key).sort().join('\n'));
    // Two interfaces of the same width that different types implement: no one tie.
    if (new Set(keys).size !== 1 || sets[0].length < 2) return null;
    const face = widest[0];
    return { members: sets[0], base: { path: face.path, line: face.declaration.line, name: face.declaration.name }, method, tie: 'go' };
  }

  const structures = new Map();
  /**
   * One pass over a file's declarations, by indentation the way
   * `declarationEnd` reads them: each declaration's last line, the class it is
   * a direct member of, and each class's own methods by name.
   */
  function structureOf(path) {
    if (structures.has(path)) return structures.get(path);
    const file = fileOf(path);
    let structure = null;
    if (file) {
      const declarations = [...(byPath.get(path) ?? [])].sort((a, b) => a.line - b.line);
      const indentOf = (line) => /^[\t ]*/u.exec(file.lines[line - 1] ?? '')[0].length;
      const endOf = new Map();
      const ownerOf = new Map();
      const methodsOf = new Map();
      const atLine = new Map();
      const close = (declaration, last) => {
        let end = last;
        while (end > declaration.line && (file.lines[end - 1] ?? '').trim() === '') end -= 1;
        endOf.set(declaration, end);
      };
      const open = [];
      for (const declaration of declarations) {
        if (!atLine.has(declaration.line)) atLine.set(declaration.line, declaration);
        const indent = indentOf(declaration.line);
        while (open.length && open.at(-1).indent >= indent) close(open.pop().declaration, declaration.line - 1);
        // Only a class's direct members are its own: a function nested in a method belongs to that method.
        const parent = open.at(-1)?.declaration;
        const owner = parent?.kind === 'class' ? parent : null;
        ownerOf.set(declaration, owner);
        if (owner && (declaration.kind === 'method' || declaration.kind === 'function')) {
          let methods = methodsOf.get(owner);
          if (!methods) methodsOf.set(owner, (methods = new Map()));
          const name = lastSegment(declaration.name);
          if (!methods.has(name)) methods.set(name, declaration);
        }
        open.push({ declaration, indent });
      }
      while (open.length) close(open.pop().declaration, file.lines.length);
      structure = { endOf, ownerOf, methodsOf, atLine };
    }
    structures.set(path, structure);
    return structure;
  }

  return {
    /**
     * The family of the declaration a read served, or null.
     *
     * @param {string} path repository-relative path of the read
     * @param {{ startLine: number, endLine: number }} range the read's range
     * @param {string} symbol the read's symbol
     */
    familyOf(path, range, symbol) {
      const declarations = byPath.get(path) ?? [];
      const declaration = declarations.find((candidate) => candidate.line === range.startLine)
        ?? declarations.find((candidate) => candidate.name === symbol && candidate.line >= range.startLine && candidate.line <= range.endLine);
      if (!declaration || walkTruncated) return null;
      return classFamily(path, declaration) ?? goFamily(path, declaration);
    },
    /** The lines a member's own code spans: its own declaration of the read method, else the whole class or method. */
    spanOf(member, method) {
      const structure = structureOf(member.path);
      const own = structure?.atLine.get(member.line);
      if (!own) return null;
      const mine = member.kind === 'class' && method ? structure.methodsOf.get(own)?.get(method) : null;
      if (mine) return { startLine: mine.line, endLine: structure.endOf.get(mine) };
      return { startLine: own.line, endLine: structure.endOf.get(own) };
    },
  };
}
