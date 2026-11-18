/**
 * What a user, an operator or a calling program can do with the product, as the
 * survey can see it without reading meaning into names. The list is a floor
 * under the abilities a builder names from the outlines and docs, never the
 * inventory itself:
 * - the entry points (commands, executables, routes, plugins) and the operations a
 *   dispatcher routes by name (`case "whisper": n.Whisper(...)`);
 * - the subcommands a command-line parser registers, the flags that change
 *   behaviour in the groups the code makes, the settings a configuration type
 *   turns on, and the background workers and schedulers (`operator-abilities.mjs`);
 * - what a library exports, resolved through the import that re-exports it and
 *   through public subpackages; five or more exports declared one per file in one
 *   folder are one family row, and three or more from one module are one API row;
 * - features the README and docs headings name that the code names too
 *   (`documented-abilities.mjs`).
 * Every row carries the file and line it was found at. Benchmarks, examples,
 * mocks and fixtures are tooling, not abilities. Breadth is counted against this
 * list, so an ability inside a folder some node already covers is still named
 * when no node mentions it.
 */

import { basename, dirname, extname, posix } from 'node:path';

import { declarationIndex } from '../evidence-search/declaration-index.mjs';
import { documentedAbilities } from './documented-abilities.mjs';
import { nameKey, operatorAbilities } from './operator-abilities.mjs';
import { readSurveyText, surveyEntry } from './survey-paths.mjs';

/** A folder of benchmarks, examples, demos, samples, mocks or fixtures (a folder name, never a file name). */
const TOOLING = /(?:^|\/)(?:[\w-]*bench[\w-]*|examples?|demos?|samples?|fixtures?|testdata|mocks?|[\w-]*_mocks)\//i;
const FAMILY_SIZE = 5;
const MODULE_API_SIZE = 3;
const ABILITY_LIMIT = 120;
/** Rows kept per kind, so one noisy kind cannot crowd out the rest. */
const KIND_LIMITS = { subcommand: 30, flags: 30, flag: 12, setting: 30, worker: 16, documented: 30 };
const SCAN_BYTES = 256 * 1024;
const DISPATCH_SUBJECT = /(?:^|\.)(?:command|cmd|action|op|operation|event|method|verb)$/i;
const NOT_A_HANDLER = new Set([
  'if', 'for', 'switch', 'return', 'await', 'fmt', 'log', 'Debug', 'debug', 'Info', 'info', 'Errorf', 'Error', 'error',
  'warn', 'Warn', 'print', 'println', 'Printf', 'console', 'String', 'string', 'len', 'append', 'make', 'new',
]);
const JS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

function readText(rootPath, path, limit = SCAN_BYTES) {
  return readSurveyText(rootPath, path, limit);
}

/** Whether a path is a benchmark, example, mock or fixture rather than the product. */
function isTooling(path) {
  return TOOLING.test(path);
}

/** The first line of `text` matching `pattern`, 1-based, or 1. */
function lineOf(text, pattern) {
  const index = String(text).split(/\r?\n/).findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : 1;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function entryAbility(rootPath, entry) {
  const text = readText(rootPath, entry.path);
  if (entry.kind === 'executable') {
    const folder = basename(dirname(entry.path));
    const name = ['src', 'bin', 'cmd', '.', ''].includes(folder) ? basename(entry.path).replace(/\.[^.]+$/, '') : folder;
    const line = lineOf(text, /^func main\(\)|^fn main\(\)|^if __name__ == ["']__main__["']/);
    return { kind: 'executable', name, path: entry.path, symbol: entry.symbol, line };
  }
  const needle = entry.kind === 'route' ? String(entry.symbol).split(' ').pop() : entry.symbol;
  const line = entry.kind === 'route' || entry.kind === 'plugin' || entry.kind === 'command'
    ? lineOf(text, new RegExp(`["'\`]${escapeRegExp(needle)}["'\`]|\\b(?:class|def|function|func)\\s+${escapeRegExp(needle)}\\b`))
    : 1;
  return { kind: entry.kind, name: entry.name ?? entry.symbol, path: entry.path, symbol: entry.symbol, line };
}

/**
 * Operations a dispatcher routes by a command name: a `switch` (or Python
 * `match`) on a command-like subject with three or more string cases that each
 * call a handler.
 */
function dispatchedOperations(path, text) {
  const ext = extname(path);
  if (!['.go', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py'].includes(ext)) return [];
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const head = /^\s*(?:switch\s*\(?\s*([\w.]+)\s*\)?\s*\{|match\s+([\w.]+)\s*:)\s*$/.exec(lines[index]);
    if (!head || !DISPATCH_SUBJECT.test(head[1] ?? head[2])) continue;
    const found = [];
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 200); cursor += 1) {
      const line = lines[cursor];
      if (/^\s*(?:switch|match)\b/.test(line) && cursor !== index) break;
      const kase = /^\s*case\s+["'`]([\w:/.-]+)["'`]\s*(?:,\s*["'`][\w:/.-]+["'`]\s*)*:/.exec(line);
      if (!kase) {
        if (/^\s*\}\s*$/.test(line) && /^\s*/.exec(line)[0].length <= /^\s*/.exec(lines[index])[0].length) break;
        continue;
      }
      for (let look = cursor; look < Math.min(lines.length, cursor + 4); look += 1) {
        if (look > cursor && /^\s*(?:case\b|default\b)/.test(lines[look])) break;
        const rest = look === cursor ? lines[look].slice(kase[0].length) : lines[look];
        const call = [...rest.matchAll(/(?:[\w$]+\.)*([\w$]+)\s*\(/g)].map((match) => match[1]).find((name) => !NOT_A_HANDLER.has(name));
        if (call) {
          found.push({ kind: 'operation', name: kase[1], path, symbol: call, line: cursor + 1 });
          break;
        }
      }
    }
    if (found.length >= 3) rows.push(...found);
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * Library exports
 * ------------------------------------------------------------------------- */

/** The repository file a relative import in `from` names, or null; resolved through the survey's confinement. */
function resolveModule(rootPath, from, spec, language) {
  if (language === 'py') {
    const dots = /^\.+/.exec(spec)?.[0].length ?? 0;
    if (dots === 0) return null;
    let base = dirname(from);
    for (let up = 1; up < dots; up += 1) base = dirname(base);
    const rest = spec.slice(dots).split('.').filter(Boolean).join('/');
    const stem = rest ? posix.join(base, rest) : base;
    return surveyEntry(rootPath, `${stem}.py`) ?? surveyEntry(rootPath, `${stem}/__init__.py`);
  }
  if (!spec.startsWith('.')) return null;
  const stem = posix.join(dirname(from), spec).replace(/\.(?:c|m)?js$/, '');
  for (const ext of JS_EXTENSIONS) {
    const hit = surveyEntry(rootPath, `${stem}${ext}`) ?? surveyEntry(rootPath, `${stem}/index${ext}`);
    if (hit) return hit;
  }
  return null;
}

function publicName(name) {
  return Boolean(name) && !name.startsWith('_') && !/^[A-Z0-9_]+$/.test(name) && !/(?:Error|Exception|Warning)$/.test(name);
}

/**
 * Names a library entry file exports, each with the module the file imports it
 * from when it says: `__all__` and `from .x import A`, or `export { A } from`,
 * `export class` and `export * from` (followed up to three files deep).
 *
 * @returns {{ name: string, from: string|null }[]}
 */
function exportedNames(rootPath, path, depth = 0, seen = new Set()) {
  if (seen.has(path)) return [];
  seen.add(path);
  const text = readText(rootPath, path);
  const rows = [];
  const push = (name, from = null) => {
    if (!publicName(name)) return;
    const held = rows.find((row) => row.name === name);
    if (held) held.from ??= from;
    else rows.push({ name, from });
  };
  if (extname(path) === '.py') {
    const sources = new Map();
    for (const match of text.matchAll(/^from\s+(\.[\w.]*)\s+import\s+(?:\(([^)]*)\)|([^(\n][^\n]*))$/gm)) {
      const from = resolveModule(rootPath, path, match[1], 'py');
      const names = (match[2] ?? match[3]).split(',').map((name) => name.trim().split(/\s+as\s+/).pop()).filter(Boolean);
      if (names.includes('*')) {
        if (from && depth < 3) for (const row of exportedNames(rootPath, from, depth + 1, seen)) push(row.name, row.from ?? from);
        continue;
      }
      for (const name of names) sources.set(name, from);
    }
    const all = /^__all__\s*=\s*[[(]([\s\S]*?)[\])]/m.exec(text);
    if (all) for (const match of all[1].matchAll(/['"]([A-Za-z_]\w*)['"]/g)) push(match[1], sources.get(match[1]) ?? null);
    else for (const [name, from] of sources) push(name, from);
    return rows;
  }
  for (const match of text.matchAll(/^export\s+(?:type\s+)?\{([^}]+)\}(?:\s*from\s*['"]([^'"]+)['"])?/gm)) {
    const from = match[2] ? resolveModule(rootPath, path, match[2], 'js') : null;
    for (const name of match[1].split(',')) {
      const clean = name.trim().replace(/^type\s+/, '');
      if (clean) push(clean.split(/\s+as\s+/).pop(), from);
    }
  }
  for (const match of text.matchAll(/^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?)\s+([A-Za-z_$][\w$]*)/gm)) push(match[1], path);
  if (depth < 3) {
    for (const match of text.matchAll(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)) {
      const from = resolveModule(rootPath, path, match[1], 'js');
      if (from) for (const row of exportedNames(rootPath, from, depth + 1, seen)) push(row.name, row.from ?? from);
    }
  }
  return rows;
}

const OPERATION_KINDS = new Set(['class', 'function', 'method']);

/** The `__init__.py` of each public subpackage under a Python library's top package. */
function subpackageEntries(collection, entry) {
  if (basename(entry.path) !== '__init__.py') return [];
  const top = dirname(entry.path);
  return collection.files
    .filter((file) => file.class === 'product' && basename(file.path) === '__init__.py' && file.path !== entry.path)
    .filter((file) => file.path.startsWith(`${top}/`)
      && !file.path.slice(top.length + 1).split('/').slice(0, -1).some((part) => part.startsWith('_')))
    .map((file) => file.path)
    .sort();
}

/**
 * A library's exported classes and functions: each name resolved to the file the
 * entry imports it from when that file declares it, else to its one declaration.
 * One-per-file siblings in a folder are a family; three or more from one module
 * are that module's API row.
 */
function libraryAbilities(rootPath, collection, entry, index) {
  const declaredIn = new Map();
  for (const path of [entry.path, ...subpackageEntries(collection, entry)]) {
    for (const { name, from } of exportedNames(rootPath, path)) {
      if (declaredIn.has(name)) continue;
      const rows = (index.get(name) ?? []).filter((row) => OPERATION_KINDS.has(row.kind) && !isTooling(row.path));
      const declared = (from && rows.find((row) => row.path === from)) ?? (rows.length === 1 ? rows[0] : null);
      if (declared) declaredIn.set(name, declared);
    }
  }
  const byFolder = new Map();
  for (const [name, declared] of declaredIn) {
    const folder = dirname(declared.path);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), { name, path: declared.path, line: declared.line }]);
  }
  const rows = [];
  const loose = [];
  for (const [folder, members] of byFolder) {
    const files = new Set(members.map((member) => member.path)).size;
    if (members.length >= FAMILY_SIZE && files * 4 >= members.length * 3) {
      rows.push({ kind: 'family', name: folder, path: folder, evidence: `${members[0].path}:L${members[0].line}`, members: members.map((member) => member.name) });
    } else loose.push(...members);
  }
  const byFile = new Map();
  for (const member of loose) byFile.set(member.path, [...(byFile.get(member.path) ?? []), member]);
  for (const [path, members] of byFile) {
    if (members.length >= MODULE_API_SIZE) {
      const stem = basename(path).replace(/\.[^.]+$/, '');
      const folders = dirname(path).split('/').filter((part) => !['src', 'lib', 'source', '.'].includes(part));
      const name = ['index', '__init__', 'mod', 'lib', 'main'].includes(stem) ? folders.at(-1) ?? stem : stem;
      rows.push({ kind: 'api', name, path, line: members[0].line, members: members.map((member) => member.name) });
    } else {
      for (const member of members) rows.push({ kind: 'export', name: member.name, path, symbol: member.name, line: member.line });
    }
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * The list
 * ------------------------------------------------------------------------- */

/** Every name a row answers to, in comparable form. */
function keysOf(row) {
  return [row.name, row.symbol, ...(row.members ?? [])]
    .filter(Boolean)
    .map((name) => nameKey(String(name).replace(/^--/, '')))
    .filter(Boolean);
}

/**
 * Every ability the survey lists, tooling left out, at most 120 rows, each with
 * `evidence` as `path:Lline`. An operator or documented row whose name an earlier
 * row already answers to is the same ability found twice (a `metrics` flag group
 * beside a `Metrics` config section) and is dropped.
 *
 * @param {string} rootPath
 * @param {{ files: object[] }} collection
 * @param {{ kind: string, path: string, symbol: string, name?: string }[]} entryPoints
 * @param {{ ignore?: string[], documents?: { readme: string|null, pages: string[] } }} [options]
 */
export function abilitiesOf(rootPath, collection, entryPoints, { ignore = [], documents = { readme: null, pages: [] } } = {}) {
  const rows = [];
  const seen = new Set();
  const names = new Set();
  const counts = new Map();
  const push = (row, { merge = false } = {}) => {
    const key = `${row.kind}\0${row.path}\0${row.name}`;
    if (seen.has(key) || isTooling(row.path)) return;
    const own = nameKey(String(row.name).replace(/^--/, ''));
    if (merge && own && names.has(own)) return;
    const limit = KIND_LIMITS[row.kind];
    if (limit !== undefined && (counts.get(row.kind) ?? 0) >= limit) return;
    seen.add(key);
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
    for (const name of keysOf(row)) names.add(name);
    rows.push(row.evidence ? row : { ...row, evidence: `${row.path}:L${row.line ?? 1}` });
  };
  const product = collection.files.filter((file) => file.class === 'product' && !isTooling(file.path));
  let index = null;
  const declarations = () => {
    index ??= declarationIndex(rootPath, { ignore });
    return index;
  };
  for (const entry of entryPoints) {
    if (entry.kind === 'library') {
      const exported = libraryAbilities(rootPath, collection, entry, declarations());
      if (exported.length > 0) {
        for (const row of exported) push(row);
        continue;
      }
    }
    push(entryAbility(rootPath, entry));
  }
  for (const file of product) {
    for (const row of dispatchedOperations(file.path, readText(rootPath, file.path))) push(row);
  }
  const operator = operatorAbilities(product, (path) => readText(rootPath, path));
  for (const row of [...operator.subcommands, ...operator.flags, ...operator.settings, ...operator.workers]) push(row, { merge: true });
  const documented = documentedAbilities((path, limit) => readText(rootPath, path, limit), documents, product, declarations());
  for (const row of documented) push(row, { merge: true });
  return { rows: rows.slice(0, ABILITY_LIMIT), omitted: Math.max(0, rows.length - ABILITY_LIMIT) };
}
