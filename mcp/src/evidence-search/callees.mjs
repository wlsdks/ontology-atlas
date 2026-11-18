/**
 * The functions a body calls that the repository declares, each with the file
 * and line to read next. How a call is written decides where it leads:
 * - `self.check(` / `this.check(` / a Go receiver's `r.check(` is the owner's
 *   own method, found in the owner, then in the classes it extends, so an
 *   override wins over the base it replaces;
 * - `self.store.save(` is a method of a field, whose type the text does not
 *   name: never the owner's own `save`, and when several types in one folder
 *   declare it (an interface's implementations live beside each other), each is
 *   listed as one implementation;
 * - a bare `check(` or `pkg.Check(` is found by name, first in the same file.
 * A name declared in more places than these allow is left out: following it
 * would be a guess.
 */

import { declarationIndex } from './declaration-index.mjs';

export const CALLEE_LIMITS = Object.freeze({
  callees: 12,
  // Implementations of one field method listed at most; more is a common name.
  implementations: 6,
  // Classes walked up from the owner to find an inherited method.
  bases: 4,
  // Characters of a call's qualifier (`this.git.options.`) examined.
  qualifier: 120,
});

const CALL = /([A-Za-z_$][\w$]*)\s*\(/gu;
const NOT_A_CALLEE = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'func', 'def', 'class', 'new', 'typeof',
  'await', 'yield', 'super', 'print', 'len', 'make', 'append', 'cap', 'panic', 'require', 'import',
  'isinstance', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'bool', 'with', 'elif',
  'assert', 'not', 'and', 'or', 'in', 'is', 'lambda', 'match', 'case', 'select', 'go', 'defer', 'fn',
]);
const SELF_NAMES = new Set(['this', 'self', 'cls']);
const GO_RECEIVER = /^func\s*\(\s*([A-Za-z_]\w*)\s/u;
const PYTHON_BASES = /^class\s+[A-Za-z_]\w*\s*\(([^)]{0,300})\)/u;
const JS_EXTENDS = /\bextends\s+([A-Za-z_$][\w$.]*)/u;

const isQualifierChar = (code) => (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
  || code === 95 || code === 36 || code === 46 || code === 63;

/**
 * The dotted chain written before a call name, `this.git` for `this.git?.save(`;
 * '' for a bare call and null when an expression (`f().save(`) comes before it.
 */
function qualifierOf(text, start) {
  if (text[start - 1] !== '.') return '';
  let index = start - 1;
  const stop = Math.max(0, start - CALLEE_LIMITS.qualifier);
  while (index > stop && isQualifierChar(text.charCodeAt(index - 1))) index -= 1;
  const chain = text.slice(index, start - 1).replace(/\?/gu, '');
  if (!chain || chain.startsWith('.') || /^[0-9]/u.test(chain)) return null;
  return chain;
}

/** How each called name is written: `own` (the owner's method), `field`, or `name` (bare or a package). */
function callsIn(text, selfNames) {
  const calls = [];
  const seen = new Set();
  for (const match of text.matchAll(CALL)) {
    const name = match[1];
    if (NOT_A_CALLEE.has(name)) continue;
    const chain = qualifierOf(text, match.index);
    const segments = chain ? chain.split('.').filter(Boolean) : [];
    const via = segments.length === 0 || !selfNames.has(segments[0]) ? 'name' : segments.length === 1 ? 'own' : 'field';
    const key = `${via === 'field' ? 'field' : 'name'}\0${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push({ name, via });
  }
  return calls;
}

function folderOf(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function indentAt(lines, line) {
  return /^[\t ]*/u.exec(lines[line - 1] ?? '')[0].length;
}

function isCode(declaration) {
  return declaration.kind !== 'export' && declaration.kind !== 'section';
}

/** Whether a declaration answers to `name`: exactly, or as `Receiver.name` (Go methods). */
function declares(declaration, name) {
  return declaration.name === name || declaration.name.endsWith(`.${name}`);
}

/** The last line of a declaration: before the next declaration at its indent or shallower. */
export function declarationEnd(lines, declarations, declaration) {
  const indent = indentAt(lines, declaration.line);
  const next = declarations.find((candidate) => candidate.line > declaration.line && isCode(candidate) && indentAt(lines, candidate.line) <= indent);
  let end = next ? next.line - 1 : lines.length;
  while (end > declaration.line && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return end;
}

/** The class a member is declared in by indentation (Python, TypeScript), or null. */
export function enclosingClass(file, declaration) {
  const indent = indentAt(file.lines, declaration.line);
  if (indent === 0) return null;
  let best = null;
  for (const candidate of file.declarations) {
    if (candidate.line >= declaration.line || candidate.kind !== 'class' || indentAt(file.lines, candidate.line) >= indent) continue;
    if (declarationEnd(file.lines, file.declarations, candidate) < declaration.line) continue;
    if (!best || candidate.line > best.line) best = candidate;
  }
  return best;
}

/** The member `name` declared inside `owner` in `file`, or null. */
function memberOf(file, owner, name) {
  const end = declarationEnd(file.lines, file.declarations, owner);
  return file.declarations.find((candidate) => isCode(candidate) && candidate.name === name
    && candidate.line > owner.line && candidate.line <= end && candidate.kind !== 'class') ?? null;
}

/** The names a class line says it extends: `class A(B, mod.C):` or `class A extends B`. */
function basesOf(file, owner) {
  const line = String(file.lines[owner.line - 1] ?? '').trim();
  const python = PYTHON_BASES.exec(line);
  if (python) {
    return python[1].split(',').map((part) => part.trim().split('[')[0].split('.').pop())
      .filter((name) => /^[A-Za-z_]\w*$/u.test(name) && name !== 'object');
  }
  const js = JS_EXTENDS.exec(line);
  return js ? [js[1].split('.').pop()] : [];
}

/**
 * The owner's own method `name`, or the nearest class it extends that declares
 * it. A class name declared in more than two places is not followed.
 */
function inheritedMember({ file, owner, name, open, index }) {
  let current = { file, owner };
  const visited = new Set();
  for (let level = 0; level <= CALLEE_LIMITS.bases && current; level += 1) {
    const key = `${current.file.path}\0${current.owner.line}`;
    if (visited.has(key)) return null;
    visited.add(key);
    const member = memberOf(current.file, current.owner, name);
    if (member) return { path: current.file.path, line: member.line };
    const [base] = basesOf(current.file, current.owner);
    if (!base) return null;
    const local = current.file.declarations.find((candidate) => candidate.kind === 'class' && candidate.name === base);
    if (local) {
      current = { file: current.file, owner: local };
      continue;
    }
    const rows = (index().get(base) ?? []).filter((row) => row.kind === 'class');
    if (rows.length !== 1) return null;
    const baseFile = open(rows[0].path);
    const baseOwner = baseFile?.declarations.find((candidate) => candidate.line === rows[0].line);
    current = baseOwner ? { file: baseFile, owner: baseOwner } : null;
  }
  return null;
}

/**
 * Functions `text` (the body of `declaration` in `file`) calls that the
 * repository declares, each `{ name, path, line }`, and `implementation: true`
 * for one of several types' method a field call may reach.
 *
 * @param {object} input
 * @param {string} input.text the body read
 * @param {{ path: string, lines: string[], declarations: object[] }} input.file its file
 * @param {object} input.declaration the body's declaration
 * @param {string} [input.rootPath] repository root; without it only the same file is searched
 * @param {string[]} [input.ignore]
 * @param {() => object[]} [input.files] one walk shared across a call
 * @param {(path: string) => object | null} [input.open] another file, under the read policy
 */
export function calleesOf({ text, file, declaration, rootPath, ignore = [], files, open = () => null }) {
  const own = declaration.name.split('.').pop();
  const goReceiver = GO_RECEIVER.exec(String(declaration.signature ?? file.lines[declaration.line - 1] ?? '').trim());
  const ownType = declaration.name.includes('.') ? declaration.name.split('.')[0] : null;
  const selfNames = new Set(goReceiver ? [goReceiver[1]] : SELF_NAMES);
  const owner = goReceiver ? null : enclosingClass(file, declaration);
  let built = null;
  const index = () => (built ??= rootPath ? declarationIndex(rootPath, { ignore, files: files?.() }) : new Map());
  const ownDeclaration = (path, line) => path === file.path && line === declaration.line;
  const inOwner = (path, line) => path === file.path && owner && line > owner.line
    && line <= declarationEnd(file.lines, file.declarations, owner);
  const callees = [];
  const push = (row) => {
    if (callees.length < CALLEE_LIMITS.callees && !callees.some((held) => held.path === row.path && held.line === row.line)) callees.push(row);
  };
  for (const { name, via } of callsIn(text, selfNames)) {
    if (callees.length >= CALLEE_LIMITS.callees) break;
    if (via === 'own') {
      if (name === own) continue;
      if (goReceiver && ownType) {
        const rows = index().get(`${ownType}.${name}`) ?? file.declarations.filter((candidate) => candidate.name === `${ownType}.${name}`).map((candidate) => ({ path: file.path, line: candidate.line }));
        if (rows.length === 1) {
          push({ name, path: rows[0].path, line: rows[0].line });
          continue;
        }
      } else if (owner) {
        const found = inheritedMember({ file, owner, name, open, index });
        if (found) {
          push({ name, ...found });
          continue;
        }
      }
    }
    if (via === 'field') {
      const local = file.declarations.filter((candidate) => isCode(candidate) && declares(candidate, name)).map((candidate) => ({ path: file.path, line: candidate.line, kind: candidate.kind, name: candidate.name }));
      const elsewhere = rootPath
        ? [...(index().get(name) ?? []), ...(index().get(`*.${name}`) ?? [])].filter((row) => row.path !== file.path)
        : [];
      const rows = [...local, ...elsewhere].filter((row) => row.kind === 'method' && !ownDeclaration(row.path, row.line)
        && !inOwner(row.path, row.line) && !(ownType && row.name === `${ownType}.${name}`));
      const unique = rows.filter((row, at) => rows.findIndex((other) => other.path === row.path && other.line === row.line) === at);
      if (unique.length > 0 && unique.length <= 2) for (const row of unique) push({ name, path: row.path, line: row.line });
      else if (unique.length > 2 && unique.length <= CALLEE_LIMITS.implementations && new Set(unique.map((row) => folderOf(row.path))).size === 1) {
        for (const row of unique) push({ name, path: row.path, line: row.line, implementation: true });
      }
      continue;
    }
    if (name === own) continue;
    const local = file.declarations.filter((candidate) => declares(candidate, name) && candidate.line !== declaration.line && isCode(candidate));
    if (local.length > 0) {
      if (local.length <= 2) for (const candidate of local) push({ name, path: file.path, line: candidate.line });
      continue;
    }
    if (!rootPath) continue;
    const elsewhere = [...(index().get(name) ?? []), ...(index().get(`*.${name}`) ?? [])].filter((row) => row.path !== file.path);
    if (elsewhere.length > 0 && elsewhere.length <= 2) for (const row of elsewhere) push({ name, path: row.path, line: row.line });
  }
  return callees;
}
