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
 * - folders whose files each declare the operation the file is named after, which
 *   an application registers in a schema or router and no package file re-exports
 *   (`sibling-families.mjs`);
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
import { boundedLines, nameKey, operatorAbilities } from './operator-abilities.mjs';
import { siblingFamilies } from './sibling-families.mjs';
import { readSurveyText, surveyEntry } from './survey-paths.mjs';

/** A folder of benchmarks, examples, demos, samples, mocks or fixtures (a folder name, never a file name). */
const TOOLING = /(?:^|\/)(?:[\w-]*bench[\w-]*|examples?|demos?|samples?|fixtures?|testdata|mocks?|[\w-]*_mocks)\//i;
const FAMILY_SIZE = 5;
const MODULE_API_SIZE = 3;
export const ABILITY_LIMIT = 120;
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

/** An import or export list open longer than this many lines, or holding more names, is not a list. */
const LIST_LINES = 200;
const LIST_NAMES = 500;
const PY_FROM = /^from\s+(\.[\w.]*)\s+import\s+(.*)$/;
const PY_ALL = /^__all__\s*=\s*([[(])(.*)$/;
const JS_NAMED = /^export\s+(?:type\s+)?\{(.*)$/;
const JS_DECLARED = /^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?)\s+([A-Za-z_$][\w$]*)/;
const JS_STAR = /^export\s+\*\s+from\s+['"]([^'"]+)['"]/;
const JS_FROM = /^\s*from\s*['"]([^'"]+)['"]/;

/**
 * The import and export statements of an entry file, read in one forward pass:
 * a list that opens on one line (`from .a import (`, `export {`, `__all__ = [`)
 * is carried to the line that closes it, and dropped past 200 lines or 500 names,
 * or when another statement starts first.
 *
 * @returns {{ type: 'from'|'all'|'named'|'declared'|'star', spec: string|null, names: string[] }[]}
 */
function exportStatements(text, python) {
  const statements = [];
  let open = null;
  const names = (list) => list.split(',').map((name) => name.trim()).filter(Boolean).slice(0, LIST_NAMES);
  const close = (statement, list, rest) => {
    const spec = statement.type === 'named' ? JS_FROM.exec(rest)?.[1] ?? null : statement.spec;
    statements.push({ type: statement.type, spec, names: names(list) });
  };
  const start = (type, spec, rest, closer) => {
    const end = rest.indexOf(closer);
    if (end >= 0) close({ type, spec }, rest.slice(0, end), rest.slice(end + 1));
    else open = { type, spec, closer, parts: [rest], lines: 1, length: rest.length };
  };
  for (const raw of boundedLines(text)) {
    const line = raw.trimEnd();
    const starts = python ? /^(?:from|import|__all__)\b/.test(line) : /^(?:export|import)\b/.test(line);
    if (open && !starts) {
      const end = line.indexOf(open.closer);
      if (end >= 0) {
        close(open, [...open.parts, line.slice(0, end)].join(','), line.slice(end + 1));
        open = null;
      } else {
        open.parts.push(line);
        open.lines += 1;
        open.length += line.length;
        if (open.lines > LIST_LINES || open.length > LIST_NAMES * 80) open = null;
      }
      continue;
    }
    open = null;
    if (python) {
      const from = PY_FROM.exec(line);
      if (from && from[2].startsWith('(')) start('from', from[1], from[2].slice(1), ')');
      else if (from) statements.push({ type: 'from', spec: from[1], names: names(from[2]) });
      const all = PY_ALL.exec(line);
      if (all) start('all', null, all[2], all[1] === '[' ? ']' : ')');
      continue;
    }
    const named = JS_NAMED.exec(line);
    if (named) { start('named', null, named[1], '}'); continue; }
    const declared = JS_DECLARED.exec(line);
    if (declared) { statements.push({ type: 'declared', spec: null, names: [declared[1]] }); continue; }
    const star = JS_STAR.exec(line);
    if (star) statements.push({ type: 'star', spec: star[1], names: [] });
  }
  return statements;
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
  const python = extname(path) === '.py';
  const statements = exportStatements(readText(rootPath, path), python);
  const rows = new Map();
  const push = (name, from = null) => {
    if (!publicName(name)) return;
    const held = rows.get(name);
    if (held) held.from ??= from;
    else rows.set(name, { name, from });
  };
  const forwarded = (spec) => {
    const from = resolveModule(rootPath, path, spec, python ? 'py' : 'js');
    if (from && depth < 3) for (const row of exportedNames(rootPath, from, depth + 1, seen)) push(row.name, row.from ?? from);
  };
  if (python) {
    const sources = new Map();
    for (const statement of statements.filter((row) => row.type === 'from')) {
      const imported = statement.names.map((name) => name.split(/\s+as\s+/).pop());
      if (imported.includes('*')) { forwarded(statement.spec); continue; }
      const from = resolveModule(rootPath, path, statement.spec, 'py');
      for (const name of imported) sources.set(name, from);
    }
    const all = statements.find((row) => row.type === 'all');
    if (all) {
      for (const entry of all.names) {
        const name = /^['"]([A-Za-z_]\w*)['"]$/.exec(entry)?.[1];
        if (name) push(name, sources.get(name) ?? null);
      }
    } else for (const [name, from] of sources) push(name, from);
    return [...rows.values()];
  }
  for (const statement of statements.filter((row) => row.type === 'named')) {
    const from = statement.spec ? resolveModule(rootPath, path, statement.spec, 'js') : null;
    for (const name of statement.names) push(name.replace(/^type\s+/, '').split(/\s+as\s+/).pop(), from);
  }
  for (const statement of statements.filter((row) => row.type === 'declared')) push(statement.names[0], path);
  for (const statement of statements) if (statement.type === 'star') forwarded(statement.spec);
  return [...rows.values()];
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
 * How many rows each kind keeps of `limit`: every kind gets an equal share, and a
 * share a small kind leaves unused goes to the kinds that still have rows, so 130
 * dispatched operations cannot crowd out 45 subcommands.
 *
 * @param {Map<string, number>} counts rows found per kind
 * @returns {Map<string, number>}
 */
export function fairShares(counts, limit) {
  const shares = new Map([...counts.keys()].map((kind) => [kind, 0]));
  let left = limit;
  let open = [...counts.keys()].filter((kind) => counts.get(kind) > 0);
  while (left > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(left / open.length));
    for (const kind of open) {
      const take = Math.min(share, counts.get(kind) - shares.get(kind), left);
      shares.set(kind, shares.get(kind) + take);
      left -= take;
      if (left === 0) break;
    }
    open = open.filter((kind) => shares.get(kind) < counts.get(kind));
  }
  return shares;
}

/**
 * Every ability the survey lists, tooling left out, at most 120 rows shared
 * fairly between kinds, each with `evidence` as `path:Lline`. What a kind leaves
 * out is counted per kind, never dropped silently; `found` keeps every row for a
 * survey that shares the rows another way. An operator or documented row
 * whose name an earlier row already answers to is the same ability found twice
 * (a `metrics` flag group beside a `Metrics` config section) and is dropped.
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
  // After the export surface, so a folder a package file already re-exports stays one row.
  for (const row of siblingFamilies(product, declarations(), FAMILY_SIZE)) push(row);
  for (const file of product) {
    for (const row of dispatchedOperations(file.path, readText(rootPath, file.path))) push(row);
  }
  const operator = operatorAbilities(product, (path) => readText(rootPath, path));
  for (const row of [...operator.subcommands, ...operator.flags, ...operator.settings, ...operator.workers]) push(row, { merge: true });
  const documented = documentedAbilities((path, limit) => readText(rootPath, path, limit), documents, product, declarations());
  for (const row of documented) push(row, { merge: true });
  const shares = fairShares(counts, ABILITY_LIMIT);
  const kept = new Map();
  const listed = rows.filter((row) => {
    const taken = kept.get(row.kind) ?? 0;
    if (taken >= shares.get(row.kind)) return false;
    kept.set(row.kind, taken + 1);
    return true;
  });
  const omittedByKind = Object.fromEntries([...counts]
    .map(([kind, count]) => [kind, count - shares.get(kind)])
    .filter(([, omitted]) => omitted > 0));
  return { rows: listed, omitted: rows.length - listed.length, omittedByKind, found: rows };
}
