/**
 * What a user can do with the product, as the survey can see it without reading
 * meaning into names: the entry points (commands, executables, routes, plugins),
 * the operations a dispatcher routes by name (`case "whisper": n.Whisper(...)`),
 * and what a library exports as classes or functions. Five or more exports
 * declared one per file in one folder are one family row (a catalogue of
 * transforms or adapters), as a builder models it: one ability, members named.
 * Benchmarks, examples and fixtures are tooling, not abilities. Breadth is
 * counted against this list, so an ability inside a folder some node already
 * covers is still named when no node mentions it.
 */

import { basename, dirname, extname } from 'node:path';

import { declarationIndex } from '../evidence-search/declaration-index.mjs';
import { readSurveyText } from './survey-paths.mjs';

/** A folder of benchmarks, examples, demos, samples or fixtures (a folder name, never a file name). */
const TOOLING = /(?:^|\/)(?:[\w-]*bench[\w-]*|examples?|demos?|samples?|fixtures?|testdata)\//i;
const FAMILY_SIZE = 5;
const ABILITY_LIMIT = 80;
const SCAN_BYTES = 256 * 1024;
const DISPATCH_SUBJECT = /(?:^|\.)(?:command|cmd|action|op|operation|event|method|verb)$/i;
const NOT_A_HANDLER = new Set([
  'if', 'for', 'switch', 'return', 'await', 'fmt', 'log', 'Debug', 'debug', 'Info', 'info', 'Errorf', 'Error', 'error',
  'warn', 'Warn', 'print', 'println', 'Printf', 'console', 'String', 'string', 'len', 'append', 'make', 'new',
]);

function readText(rootPath, path) {
  return readSurveyText(rootPath, path, SCAN_BYTES);
}

/** Whether a path is a benchmark, example or fixture rather than the product. */
function isTooling(path) {
  return TOOLING.test(path);
}

function entryAbility(entry) {
  if (entry.kind === 'executable') {
    const folder = basename(dirname(entry.path));
    const name = ['src', 'bin', 'cmd', '.', ''].includes(folder) ? basename(entry.path).replace(/\.[^.]+$/, '') : folder;
    return { kind: 'executable', name, path: entry.path, symbol: entry.symbol };
  }
  return { kind: entry.kind, name: entry.name ?? entry.symbol, path: entry.path, symbol: entry.symbol };
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

/** Names a library entry file exports: `__all__`, `from .x import A`, or `export` forms. */
function exportedNames(path, text) {
  const names = [];
  const push = (name) => {
    if (name && !name.startsWith('_') && !/^[A-Z0-9_]+$/.test(name) && !/(?:Error|Exception|Warning)$/.test(name) && !names.includes(name)) names.push(name);
  };
  if (extname(path) === '.py') {
    const all = /^__all__\s*=\s*[[(]([\s\S]*?)[\])]/m.exec(text);
    if (all) for (const match of all[1].matchAll(/['"]([A-Za-z_]\w*)['"]/g)) push(match[1]);
    for (const match of text.matchAll(/^from\s+\.[\w.]*\s+import\s+(?:\(([^)]*)\)|([^(\n][^\n]*))$/gm)) {
      for (const name of (match[1] ?? match[2]).split(',')) push(name.trim().split(/\s+as\s+/).pop());
    }
    return names;
  }
  for (const match of text.matchAll(/^export\s+\{([^}]+)\}/gm)) {
    for (const name of match[1].split(',')) push(name.trim().split(/\s+as\s+/).pop().replace(/^type\s+/, ''));
  }
  for (const match of text.matchAll(/^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?)\s+([A-Za-z_$][\w$]*)/gm)) push(match[1]);
  return names;
}

const OPERATION_KINDS = new Set(['class', 'function', 'method']);

/** A library's exported classes and functions, families collapsed by declaring folder. */
function libraryAbilities(rootPath, entry, index) {
  const rows = [];
  const byFolder = new Map();
  for (const name of exportedNames(entry.path, readText(rootPath, entry.path))) {
    const declared = (index.get(name) ?? []).filter((row) => OPERATION_KINDS.has(row.kind) && !isTooling(row.path));
    if (declared.length !== 1) continue;
    const folder = dirname(declared[0].path);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), { name, path: declared[0].path }]);
  }
  for (const [folder, members] of byFolder) {
    const files = new Set(members.map((member) => member.path)).size;
    if (members.length >= FAMILY_SIZE && files * 4 >= members.length * 3) {
      rows.push({ kind: 'family', name: folder, path: folder, members: members.map((member) => member.name) });
    } else {
      for (const member of members) rows.push({ kind: 'export', name: member.name, path: member.path, symbol: member.name });
    }
  }
  return rows;
}

/**
 * Every ability the survey lists, tooling left out, at most 80 rows.
 *
 * @param {string} rootPath
 * @param {{ files: object[] }} collection
 * @param {{ kind: string, path: string, symbol: string, name?: string }[]} entryPoints
 */
export function abilitiesOf(rootPath, collection, entryPoints, { ignore = [] } = {}) {
  const rows = [];
  const seen = new Set();
  const push = (row) => {
    const key = `${row.kind}\0${row.path}\0${row.name}`;
    if (seen.has(key) || isTooling(row.path)) return;
    seen.add(key);
    rows.push(row);
  };
  let index = null;
  for (const entry of entryPoints) {
    if (entry.kind === 'library') {
      index ??= declarationIndex(rootPath, { ignore });
      const exported = libraryAbilities(rootPath, entry, index);
      if (exported.length > 0) {
        for (const row of exported) push(row);
        continue;
      }
    }
    push(entryAbility(entry));
  }
  for (const file of collection.files) {
    if (file.class !== 'product') continue;
    for (const row of dispatchedOperations(file.path, readText(rootPath, file.path))) push(row);
  }
  return { rows: rows.slice(0, ABILITY_LIMIT), omitted: Math.max(0, rows.length - ABILITY_LIMIT) };
}
