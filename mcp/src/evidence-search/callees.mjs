/**
 * The functions a body calls that the repository declares, each with the file
 * and line to read next. A call is followed only where the file can reach it,
 * in its own language:
 * - `self.check(` / `this.check(` / a Go receiver's `r.check(` is the owner's
 *   own method, found in the owner, then in the classes it extends (local or
 *   imported), so an override wins over the base it replaces;
 * - `self.store.save(` is a method of a field, whose type the text does not
 *   name: never the owner's own `save`, only one declared in this file or a
 *   module it imports (a Go package it imports or shares), and when several
 *   types in one folder declare it (an interface's implementations live beside
 *   each other), each is listed as one implementation;
 * - a bare `check(` is declared in this file, imported into it by name, or (Go)
 *   declared in its package; `pkg.Check(` names an imported module or package;
 * - any other `x.check(` (`map.get(`, `items.includes(`) is a method of a value
 *   whose type the text does not name, and is not followed.
 * An import is resolved to its module's files and the name looked up there
 * (`declaration-survey.mjs`), so a read costs O(imports + calls) after one
 * indexing pass. Only an internal import naming no file here is followed by
 * name alone, capped and marked `byName`. A name declared in more places than
 * these allow is left out: following it would be a guess. A line over
 * `LINE_CHARS` characters is generated or minified and is not scanned.
 */

import { surveyOf } from './declaration-survey.mjs';
import { childSpec, importsOf, languageOf } from './import-bindings.mjs';

const CALLEE_LIMITS = Object.freeze({
  callees: 12,
  // Implementations of one field method listed at most; more is a common name.
  implementations: 6,
  // Classes walked up from the owner to find an inherited method.
  bases: 4,
  // Characters of a call's qualifier (`this.git.options.`) examined.
  qualifier: 120,
  // Declarations of a name followed by name alone; more is a common name, not one function.
  declarations: 64,
});

// A line longer than this is generated or minified: its calls are not followed.
const LINE_CHARS = 2000;
const IDENTIFIER = /[A-Za-z_$][\w$]*/gu;
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

/**
 * Each identifier in `line` written as a call (`name(` or `name (`), with where
 * it starts. One pass: an identifier is matched once, whole, then the
 * character after its spaces is checked.
 */
export function callsOnLine(line) {
  const calls = [];
  if (line.length > LINE_CHARS) return calls;
  IDENTIFIER.lastIndex = 0;
  for (let match = IDENTIFIER.exec(line); match; match = IDENTIFIER.exec(line)) {
    let next = IDENTIFIER.lastIndex;
    while (line[next] === ' ' || line[next] === '\t') next += 1;
    if (line[next] === '(') calls.push({ name: match[0], index: match.index });
  }
  return calls;
}

/**
 * How each called name is written: `own` (the owner's method), `field` (a
 * method of the owner's field), `name` (bare), `qualified` (after a module or
 * value, `chain` names it) or `expression` (after a call or index).
 */
function callsIn(text, selfNames) {
  const calls = [];
  const seen = new Set();
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end);
    start = end + 1;
    for (const { name, index } of callsOnLine(line)) {
      if (NOT_A_CALLEE.has(name)) continue;
      const chain = qualifierOf(line, index);
      const segments = chain ? chain.split('.').filter(Boolean) : [];
      const via = chain === null ? 'expression'
        : segments.length === 0 ? 'name'
          : selfNames.has(segments[0]) ? (segments.length === 1 ? 'own' : 'field')
            : 'qualified';
      if (via === 'expression') continue;
      const key = `${via}\0${via === 'qualified' ? chain : ''}\0${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      calls.push({ name, via, chain });
    }
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
function declarationEnd(lines, declarations, declaration) {
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
  const raw = String(file.lines[owner.line - 1] ?? '');
  if (raw.length > LINE_CHARS) return [];
  const line = raw.trim();
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
function inheritedMember({ file, owner, name, open, classes }) {
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
    const rows = classes(current.file, base);
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
export function calleesOf(input) {
  const { text, file, declaration, rootPath, ignore = [], files } = input;
  if (!rootPath) return resolveCallees(input, null);
  // One body is resolved once per walk: a call that reads it again, or reaches it again one call deeper, reuses it.
  const survey = surveyOf(rootPath, { ignore, files });
  const key = `${file.path}\0${declaration.line}`;
  const held = survey.callees.get(key);
  if (held?.text === text) return held.callees.map((row) => ({ ...row }));
  const callees = resolveCallees(input, survey);
  survey.callees.set(key, { text, callees });
  return callees.map((row) => ({ ...row }));
}

function resolveCallees({ text, file, declaration, rootPath, open = () => null }, surveyed) {
  const own = declaration.name.split('.').pop();
  const goReceiver = GO_RECEIVER.exec(String(declaration.signature ?? file.lines[declaration.line - 1] ?? '').trim());
  const ownType = declaration.name.includes('.') ? declaration.name.split('.')[0] : null;
  const selfNames = new Set(goReceiver ? [goReceiver[1]] : SELF_NAMES);
  const owner = goReceiver ? null : enclosingClass(file, declaration);
  const imports = importsOf(file);
  const survey = () => surveyed;
  const sameLanguage = (from) => (row) => languageOf(row.path) === languageOf(from.path);
  // A Go file's package: the other files of its folder.
  const packageRows = (from, key) => (languageOf(from.path) === 'go'
    ? survey().rowsAmong(survey().folder(from.path), key).filter((row) => row.path !== from.path && sameLanguage(from)(row))
    : []);
  /**
   * The declarations a bare `name` reaches through `from`'s imports: in the
   * module each binding names. Only when no binding's module names a file of
   * this project is the name looked up everywhere, capped, and marked `byName`.
   */
  const importedRows = (from, name) => {
    const bindings = importsOf(from).names.get(name) ?? [];
    const rows = bindings.flatMap((binding) => survey().rowsIn(binding.spec, binding.imported ?? name)).filter(sameLanguage(from));
    if (rows.length > 0 || !bindings.some((binding) => (binding.spec.exact || binding.spec.internal) && survey().modulePaths(binding.spec).length === 0)) {
      return { rows, byName: false };
    }
    const everywhere = survey().everywhere(bindings[0].imported ?? name);
    return { rows: everywhere.length > CALLEE_LIMITS.declarations ? [] : everywhere.filter(sameLanguage(from)), byName: true };
  };
  const classes = (from, base) => {
    const found = [...importedRows(from, base).rows, ...packageRows(from, base)];
    return found.filter((row) => row.kind === 'class');
  };
  const ownDeclaration = (path, line) => path === file.path && line === declaration.line;
  const inOwner = (path, line) => path === file.path && owner && line > owner.line
    && line <= declarationEnd(file.lines, file.declarations, owner);
  const callees = [];
  const push = (row) => {
    if (callees.length < CALLEE_LIMITS.callees && !callees.some((held) => held.path === row.path && held.line === row.line)) callees.push(row);
  };
  const unique = (rows) => {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.path}\0${row.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  for (const { name, via, chain } of callsIn(text, selfNames)) {
    if (callees.length >= CALLEE_LIMITS.callees) break;
    if (via === 'own') {
      if (name === own) continue;
      if (goReceiver && ownType) {
        const key = `${ownType}.${name}`;
        const rows = [
          ...file.declarations.filter((candidate) => candidate.name === key).map((candidate) => ({ path: file.path, line: candidate.line })),
          ...(rootPath ? packageRows(file, key) : []),
        ];
        if (rows.length === 1) push({ name, path: rows[0].path, line: rows[0].line });
        continue;
      }
      if (owner) {
        const found = inheritedMember({ file, owner, name, open, classes: rootPath ? classes : () => [] });
        if (found) {
          push({ name, ...found });
          continue;
        }
      }
    }
    if (via === 'field') {
      // A field's type is unnamed: its method is one declared in this file, its Go package, or a module the file imports.
      const local = file.declarations.filter((candidate) => isCode(candidate) && declares(candidate, name)).map((candidate) => ({ path: file.path, line: candidate.line, kind: candidate.kind, name: candidate.name }));
      const elsewhere = rootPath
        ? [...survey().rowsAmong(survey().importedPaths(file, imports), name), ...survey().rowsAmong(survey().importedPaths(file, imports), `*.${name}`),
          ...packageRows(file, name), ...packageRows(file, `*.${name}`)].filter((row) => row.path !== file.path)
        : [];
      const rows = unique([...local, ...elsewhere].filter((row) => row.kind === 'method' && !ownDeclaration(row.path, row.line)
        && !inOwner(row.path, row.line) && !(ownType && row.name === `${ownType}.${name}`)));
      if (rows.length > 0 && rows.length <= 2) for (const row of rows) push({ name, path: row.path, line: row.line });
      else if (rows.length > 2 && rows.length <= CALLEE_LIMITS.implementations && new Set(rows.map((row) => folderOf(row.path))).size === 1) {
        for (const row of rows) push({ name, path: row.path, line: row.line, implementation: true });
      }
      continue;
    }
    if (via === 'qualified') {
      // `pkg.Check(` or `ns.check(`: the module that name was imported as, and nothing else.
      if (!rootPath) continue;
      if (!imports.modules.has(chain) && !imports.names.has(chain)) continue;
      const paths = survey().pathsFor(file, chain, () => [imports.modules.get(chain), ...(imports.names.get(chain) ?? [])
        .flatMap((binding) => [binding.spec, childSpec(binding.spec, binding.imported)])].filter(Boolean));
      const rows = unique([...survey().rowsAmong(paths, name), ...survey().rowsAmong(paths, `*.${name}`)]);
      if (rows.length > 0 && rows.length <= 2) for (const row of rows) push({ name, path: row.path, line: row.line });
      continue;
    }
    if (name === own) continue;
    const local = file.declarations.filter((candidate) => declares(candidate, name) && candidate.line !== declaration.line && isCode(candidate));
    if (local.length > 0) {
      if (local.length <= 2) for (const candidate of local) push({ name, path: file.path, line: candidate.line });
      continue;
    }
    if (!rootPath) continue;
    const { rows: found, byName } = imports.names.has(name) ? importedRows(file, name) : { rows: packageRows(file, name), byName: false };
    const rows = unique(found.filter((row) => row.path !== file.path));
    if (rows.length > 0 && rows.length <= 2) for (const row of rows) push({ name, path: row.path, line: row.line, ...(byName ? { byName: true } : {}) });
  }
  return callees;
}
