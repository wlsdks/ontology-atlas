/**
 * Where an imported name is declared, found by structure: an import names a
 * module, the module is resolved to its files once, and the name is looked up
 * in those files' declarations only. A same-named declaration anywhere else
 * neither competes with the import nor costs time.
 *
 * One survey is built per walk of the repository (memoized on the walk) and
 * holds each file's declarations by name, every module path a file answers to,
 * and each spec's resolution. After that pass, a read costs
 * O(imports + calls): each lookup is a few map reads.
 */

import { declarationIndex } from './declaration-index.mjs';
import { languageOf, segmentSuffixes, specKey, stemsOf } from './import-bindings.mjs';

// A spec answering to more files than this names no one module (`utils`).
const MODULE_FILES = 8;

const SURVEYS = new WeakMap();

function folderOf(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function push(map, key, value) {
  const held = map.get(key);
  if (held) held.push(value);
  else map.set(key, [value]);
}

/**
 * A survey over `paths` (every product file) and `index` (name -> declaration
 * rows, from `declarationIndex`).
 */
export function buildSurvey(paths, index) {
  const byPath = new Map();
  for (const [key, rows] of index) {
    for (const row of rows) {
      let names = byPath.get(row.path);
      if (!names) byPath.set(row.path, (names = new Map()));
      push(names, key, row);
    }
  }
  const stems = new Map();
  const suffixes = new Map();
  const folders = new Map();
  for (const path of new Set([...paths, ...byPath.keys()])) {
    push(folders, folderOf(path), path);
    for (const stem of stemsOf(path)) {
      push(stems, stem, path);
      for (const suffix of new Set(segmentSuffixes(stem))) push(suffixes, suffix, path);
    }
  }
  for (const map of [stems, suffixes]) for (const [key, list] of map) map.set(key, [...new Set(list)]);
  const resolved = new Map();
  const named = new Map();
  const imported = new WeakMap();
  const chains = new WeakMap();
  const sets = new WeakMap();
  const setOf = (list) => {
    let set = sets.get(list);
    if (!set) sets.set(list, (set = new Set(list)));
    return set;
  };
  const EMPTY = [];

  /** The files a spec names: one lookup; none when it names no file or too many to be one module. */
  const modulePaths = (spec) => {
    if (!spec) return EMPTY;
    const key = specKey(spec);
    if (resolved.has(key)) return resolved.get(key);
    let list = EMPTY;
    if (spec.go) {
      for (const suffix of segmentSuffixes(spec.go)) {
        const found = folders.get(suffix);
        if (suffix && found) {
          list = found;
          break;
        }
      }
    } else if (spec.exact) list = stems.get(spec.exact) ?? EMPTY;
    else if (spec.tail) list = suffixes.get(spec.tail) ?? EMPTY;
    if (list.length > MODULE_FILES) list = EMPTY;
    resolved.set(key, list);
    return list;
  };

  /** Declarations of `key` in `list`, by whichever side is smaller: the name's rows or the files. */
  const rowsAmong = (list, key) => {
    if (list.length === 0) return EMPTY;
    const all = index.get(key) ?? EMPTY;
    if (all.length <= list.length) {
      const set = setOf(list);
      return all.filter((row) => set.has(row.path));
    }
    return list.flatMap((path) => byPath.get(path)?.get(key) ?? EMPTY);
  };

  return {
    /** Each body's resolved callees, by `path\0line`, with the text they were resolved from. */
    callees: new Map(),
    modulePaths,
    rowsAmong,
    /** Every file in one folder (a Go package). */
    folder: (path) => folders.get(folderOf(path)) ?? EMPTY,
    /** Declarations of `name` (or a `Type.name` method) in the module `spec` names, memoized. */
    rowsIn(spec, name) {
      const key = `${specKey(spec)}\0${name}`;
      if (named.has(key)) return named.get(key);
      const list = modulePaths(spec);
      const rows = [...rowsAmong(list, name), ...rowsAmong(list, `*.${name}`)];
      named.set(key, rows);
      return rows;
    },
    /** Every file the modules `bindings` imports resolve to, in its language, once per importing file. */
    importedPaths(file, bindings) {
      if (imported.has(file)) return imported.get(file);
      const language = languageOf(file.path);
      const list = [...new Set(bindings.specs.flatMap((spec) => modulePaths(spec)))].filter((path) => languageOf(path) === language);
      imported.set(file, list);
      return list;
    },
    /** Files the specs name, merged and in `language`, memoized per importing file under `key` (a chain such as `pkg`). */
    pathsFor(file, key, specs) {
      let memo = chains.get(file);
      if (!memo) chains.set(file, (memo = new Map()));
      if (memo.has(key)) return memo.get(key);
      const language = languageOf(file.path);
      const list = [...new Set(specs().flatMap((spec) => modulePaths(spec)))].filter((path) => languageOf(path) === language && path !== file.path);
      memo.set(key, list.length > 0 ? list : EMPTY);
      return memo.get(key);
    },
    /** Every declaration of `name` anywhere: only for a binding whose module names no file. */
    everywhere: (name) => [...(index.get(name) ?? EMPTY), ...(index.get(`*.${name}`) ?? EMPTY)],
  };
}

/** The survey of one walk, built once and shared by every read in a call. */
export function surveyOf(rootPath, { ignore = [], files } = {}) {
  const list = files?.();
  if (list && SURVEYS.has(list)) return SURVEYS.get(list);
  const index = declarationIndex(rootPath, { ignore, files: list });
  const survey = buildSurvey((list ?? []).map((file) => file.path), index);
  if (list) SURVEYS.set(list, survey);
  return survey;
}
