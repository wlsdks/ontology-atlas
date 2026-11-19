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
 *
 * The index is one pass over the cached declarations; each family costs its
 * candidates, with caps past which there is no family.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { declarationEnd, enclosingClass } from './callees.mjs';
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
  embedDepth: 4,
  workspaceDirs: 8,
});
// Promoted methods of standard-library types a struct commonly embeds.
const KNOWN_EMBEDS = new Map([
  ['sync\0Mutex', { Lock: '()()', Unlock: '()()', TryLock: '()(bool)' }],
  ['sync\0RWMutex', { Lock: '()()', Unlock: '()()', RLock: '()()', RUnlock: '()()', TryLock: '()(bool)', TryRLock: '()(bool)', RLocker: '()(Locker)' }],
  ['sync\0WaitGroup', { Add: '(int)()', Done: '()()', Wait: '()()', Go: '(func())()' }],
  ['sync\0Once', { Do: '(func())()' }],
]);
const ENTRY_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];

const lastSegment = (name) => String(name).split('.').pop();
const sameDeclaration = (a, b) => a && b && typeof a === 'object' && typeof b === 'object' && a.path === b.path && a.line === b.line;
const isType = (declaration, path) => TYPE_KINDS.has(declaration.kind) && !(declaration.kind === 'class' && path.endsWith('.rs'));

/**
 * The families of one repository walk.
 *
 * @param {string} repoRoot absolute repository root
 * @param {object[]} files product files (`productFiles`)
 */
export function createFamilies(repoRoot, files) {
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
  const add = (map, key, value) => {
    const held = map.get(key);
    if (held) held.push(value);
    else map.set(key, [value]);
  };
  for (const { path, declarations, goImports, mayName } of declarationsByFile(repoRoot, { files })) {
    byPath.set(path, declarations);
    mayNameIn.set(path, mayName);
    const folder = posix.dirname(path);
    for (let dir = folder; dir !== '.' && dir !== '/' && !dirs.has(dir); dir = posix.dirname(dir)) {
      dirs.add(dir);
      folderNames.add(posix.basename(dir));
    }
    const go = path.endsWith('.go');
    if (go) {
      goImportsOf.set(path, goImports ?? []);
      add(goFolderFiles, folder, path);
    }
    for (const declaration of declarations) {
      add(index, declaration.name, { path, line: declaration.line, kind: declaration.kind, name: declaration.name });
      if (declaration.kind === 'class' && declaration.open) openHeaders.push(path);
      for (const ref of declaration.bases ?? []) add(classesByBase, lastSegment(ref), { path, declaration, ref });
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
  /** `{ path, lines, text }` of a product file, or null past the size cap. */
  function fileOf(path) {
    if (texts.has(path)) return texts.get(path);
    let file = null;
    try {
      const text = readFileSync(join(repoRoot, path), 'utf8');
      if (text.length <= MAX_FILE_BYTES) file = { path, text, lines: text.split('\n') };
    } catch {
      file = null;
    }
    texts.set(path, file);
    return file;
  }

  const workspaceEntries = new Map();
  /** The entry file of the workspace package a bare spec names: its `source`, `types` or `main`, mapped from a build folder to `src/`. */
  function workspaceEntry(tail) {
    if (workspaceEntries.has(tail)) return workspaceEntries.get(tail);
    const leaf = posix.basename(tail);
    const found = [];
    for (const dir of [...dirs].filter((candidate) => posix.basename(candidate) === leaf).slice(0, FAMILY_LIMITS.workspaceDirs)) {
      let manifest = null;
      try {
        if (existsSync(join(repoRoot, dir, 'package.json'))) manifest = JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'));
      } catch {
        manifest = null;
      }
      const name = typeof manifest?.name === 'string' ? manifest.name : '';
      if (name !== tail && !name.endsWith(`/${tail}`)) continue;
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
      const entry = tries.map((candidate) => posix.join(dir, candidate)).find((candidate) => productPaths.has(candidate));
      if (entry) found.push(entry);
    }
    const list = found.length === 1 ? found : [];
    workspaceEntries.set(tail, list);
    return list;
  }

  /** A spec that names no module here and whose first segment is no folder or package here: outside the repository. */
  function external(spec) {
    if (!spec || spec.exact || spec.internal || spec.go) return false;
    const segments = String(spec.tail ?? '').split('/');
    return !segments.some((segment) => folderNames.has(segment));
  }

  function modulePaths(spec, language) {
    let list = surveyed().modulePaths(spec).filter((path) => languageOf(path) === language);
    if (list.length === 0 && language === 'js' && spec?.tail) list = workspaceEntry(spec.tail);
    return list;
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
      for (const row of importsOf(file).names.get(name) ?? []) results.push(resolveExport(row.spec, row.imported, language, depth + 1));
    }
    return agree(results);
  }

  /** The declaration a base reference written in `path` names, `external`, or null when it cannot be told. */
  function resolveReference(path, reference) {
    const file = fileOf(path);
    if (!file) return null;
    const language = languageOf(path);
    const segments = reference.split('.');
    const bindings = importsOf(file);
    if (segments.length === 1) {
      const [name] = segments;
      const local = (byPath.get(path) ?? []).filter((declaration) => isType(declaration, path) && declaration.name === name);
      if (local.length === 1) return { path, line: local[0].line, name };
      if (local.length > 1) return null;
      const rows = bindings.names.get(name);
      return rows ? agree(rows.map((row) => resolveExport(row.spec, row.imported, language, 0))) : null;
    }
    let spec = bindings.modules.get(segments[0]) ?? null;
    for (const middle of segments.slice(1, -1)) spec = spec ? childSpec(spec, middle) : null;
    return spec ? resolveExport(spec, segments.at(-1), language, 0) : null;
  }

  /**
   * The names `base` may be written under in `language`: its own and every local
   * name an import or re-export gives it, followed a few rounds; null past the cap.
   */
  function namesOf(base, language) {
    const names = new Set([base.name]);
    const scanned = new Set();
    for (let round = 0; round < FAMILY_LIMITS.reexportDepth; round += 1) {
      const before = names.size;
      for (const [path, mayName] of mayNameIn) {
        if (scanned.has(path) || languageOf(path) !== language || ![...names].some((name) => mayName(name))) continue;
        scanned.add(path);
        if (scanned.size > FAMILY_LIMITS.aliasFiles) return null;
        const file = fileOf(path);
        if (!file) return null;
        for (const [local, rows] of importsOf(file).names) if (rows.some((row) => names.has(row.imported))) names.add(local);
      }
      if (names.size === before) break;
    }
    return names;
  }

  /** Every class whose header names `base`, or null when one cannot be decided. */
  function classMembers(base, language) {
    const names = namesOf(base, language);
    if (!names) return null;
    const candidates = [...names].flatMap((name) => classesByBase.get(name) ?? []).filter((candidate) => languageOf(candidate.path) === language);
    if (candidates.length > FAMILY_LIMITS.candidates) return null;
    const unread = [...new Set(openHeaders)].filter((path) => languageOf(path) === language && [...names].some((name) => mayNameIn.get(path)?.(name)));
    if (unread.length > FAMILY_LIMITS.openHeaders) return null;
    const words = [...names].map((name) => new RegExp(`(?<![\\w$])${name.replace(/[$]/gu, '\\$&')}(?![\\w$])`, 'u'));
    for (const path of unread) {
      const file = fileOf(path);
      if (!file || words.some((word) => word.test(file.text))) return null;
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
    let owner = declaration.kind === 'class' ? declaration : null;
    if (!owner) {
      const file = fileOf(path);
      owner = file ? enclosingClass({ lines: file.lines, declarations: byPath.get(path) ?? [] }, declaration) : null;
    }
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
      if (!declaration) return null;
      return classFamily(path, declaration) ?? goFamily(path, declaration);
    },
    /** The lines a member's own code spans: its own declaration of the read method, else the whole class or method. */
    spanOf(member, method) {
      const file = fileOf(member.path);
      const declarations = byPath.get(member.path) ?? [];
      const own = declarations.find((candidate) => candidate.line === member.line);
      if (!file || !own) return null;
      if (member.kind === 'class' && method) {
        const mine = declarations.find((candidate) => lastSegment(candidate.name) === method && candidate.line > own.line
          && (candidate.kind === 'method' || candidate.kind === 'function') && enclosingClass({ lines: file.lines, declarations }, candidate) === own);
        if (mine) return { startLine: mine.line, endLine: declarationEnd(file.lines, declarations, mine) };
      }
      return { startLine: own.line, endLine: declarationEnd(file.lines, declarations, own) };
    },
  };
}
