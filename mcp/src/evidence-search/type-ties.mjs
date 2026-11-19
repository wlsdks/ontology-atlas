/**
 * What a declaration's own text says it is tied to, read once per file when
 * the declarations are indexed:
 *
 * - a class header's base references as written (`base.Transform`,
 *   `React.Component`, `Plugin`), read across the lines a formatter wraps it
 *   over, up to its `{` or its `:`, with type arguments removed;
 * - a Rust `impl Trait for Type` header's trait;
 * - a Go interface's methods with their parameter and result types, a Go
 *   struct's embedded types, a Go method's parameter and result types, and the
 *   packages a Go file imports;
 * - the local names a JavaScript or TypeScript file binds by default import,
 *   when its classes name a base.
 *
 * Whatever cannot be read for certain is marked `open` rather than guessed: a
 * header that does not end within `HEADER_LINES` lines, a base that is a call,
 * an interface that embeds another, a struct body that does not close.
 */

import { importsOf } from './import-bindings.mjs';

const HEADER_LINES = 12;
const HEADER_CHARS = 2000;
const BODY_LINES = 200;
const LINE_CHARS = 2000;
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;
const GO_KEYWORDS = new Set(['chan', 'func', 'map', 'struct', 'interface']);

const copy = (value) => Buffer.from(value).toString();

/** `text` with balanced `<...>` and `[...]` groups removed, innermost first. */
function withoutTypeArguments(text) {
  let held = text;
  for (let pass = 0; pass < 6 && /[<[]/u.test(held); pass += 1) {
    const next = held.replace(/<[^<>]*>|\[[^[\]]*\]/gu, '');
    if (next === held) break;
    held = next;
  }
  return held;
}

/** The index just past the group `text[open]` opens, or -1 when it does not close. */
function closing(text, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let at = open; at < text.length; at += 1) {
    const char = text[at];
    if (pairs[char]) stack.push(pairs[char]);
    else if (char === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return at + 1;
    }
  }
  return -1;
}

/** Top-level comma-separated parts of `text`. */
function parts(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      out.push(text.slice(start, at).trim());
      start = at + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

/** A class header joined over its lines, comments and type arguments removed, up to its end; null when it does not end. */
function header(lines, line, python) {
  let text = '';
  for (let at = line - 1; at < lines.length && at < line - 1 + HEADER_LINES; at += 1) {
    const raw = lines[at] ?? '';
    if (raw.length > LINE_CHARS) return null;
    text += ` ${raw.replace(python ? /#.*$/u : /\/\/.*$/u, '').trim()}`;
    if (text.length > HEADER_CHARS) return null;
    const plain = withoutTypeArguments(text).trim();
    if (python) {
      const name = /\bclass\s+[A-Za-z_]\w*\s*/u.exec(plain);
      if (!name) return null;
      const after = name.index + name[0].length;
      if (plain[after] === ':') return plain.slice(0, after + 1);
      if (plain[after] !== '(') return null;
      const end = closing(plain, after);
      if (end > 0 && /^\s*:/u.test(plain.slice(end))) return plain.slice(0, end);
    } else if (plain.includes('{')) return plain.slice(0, plain.indexOf('{'));
  }
  return null;
}

function pythonBases(text) {
  const open = text.indexOf('(');
  if (open < 0) return [];
  const bases = [];
  for (const part of parts(text.slice(open + 1, closing(text, open) - 1))) {
    if (!part || /^[A-Za-z_]\w*\s*=/u.test(part)) continue;
    if (!REFERENCE.test(part)) return null;
    bases.push(part);
  }
  return bases;
}

function jsBases(text) {
  const head = text.slice(Math.max(0, text.search(/\bclass\b/u)));
  const bases = [];
  const extended = /\bextends\s+([^\s{(]+)(\s*\()?/u.exec(head);
  if (extended) {
    if (extended[2] || !REFERENCE.test(extended[1])) return null;
    bases.push(extended[1]);
  }
  const implemented = /\bimplements\s+([^{]+)/u.exec(head);
  for (const part of implemented ? parts(implemented[1]) : []) {
    if (!REFERENCE.test(part)) return null;
    bases.push(part);
  }
  return bases;
}

// A class written as an expression: `module.exports = class X`, `exports.X = class`, `const X = class`, `export default class`.
const CLASS_EXPRESSION = /^\s*(?:(?:module\.exports|exports\.([A-Za-z_$][\w$]*)|(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*))\s*=\s*|export\s+default\s+)class\b(?:\s+(?!extends\b|implements\b)([A-Za-z_$][\w$]*))?/u;

/** Each class expression in a JavaScript file as a class declaration with its ties: the outline lists none of them as a class with its own name. */
function classExpressions(lines) {
  const out = [];
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at];
    if (line.length > LINE_CHARS || !line.includes('class')) continue;
    const match = CLASS_EXPRESSION.exec(line);
    if (!match) continue;
    const written = header(lines, at + 1, false);
    const bases = written === null ? null : jsBases(written);
    if (bases !== null && bases.length === 0) continue;
    const name = match[3] ?? match[1] ?? match[2] ?? 'default';
    out.push({ name: copy(name), line: at + 1, kind: 'class', ...(bases === null ? { open: true } : { bases: bases.map(copy) }) });
  }
  return out;
}

function rustBases(text) {
  const impl = /^(?:unsafe\s+)?impl\s+(.*?)\s+for\s+/u.exec(text.trim());
  if (!impl) return [];
  const trait = impl[1].trim().replace(/::/gu, '.');
  return REFERENCE.test(trait) ? [trait] : null;
}

/** A Go parameter or result list as its types, names dropped and package qualifiers removed; null when unreadable. */
function goTypes(inner) {
  const entries = parts(inner).filter((entry, index, all) => entry !== '' || all.length > 1);
  if (entries.length === 1 && entries[0] === '') return [];
  const named = (entry) => {
    const match = /^([A-Za-z_]\w*)\s+(\S.*)$/u.exec(entry);
    return match && !GO_KEYWORDS.has(match[1]) ? match[2] : null;
  };
  let types = entries;
  if (entries.some((entry) => named(entry) !== null)) {
    types = [];
    let pending = 0;
    for (const entry of entries) {
      const type = named(entry);
      if (type === null) {
        if (!/^[A-Za-z_]\w*$/u.test(entry)) return null;
        pending += 1;
        continue;
      }
      for (let count = 0; count <= pending; count += 1) types.push(type);
      pending = 0;
    }
    if (pending > 0) return null;
  }
  return types.map((type) => type.replace(/\s+/gu, ' ').replace(/\b[A-Za-z_]\w*\./gu, '').trim());
}

/** `(params)results` of a Go signature that starts at its parameter list, normalized; null when unreadable. */
function goSignature(text) {
  const plain = text.replace(/\/\/.*$/u, '').replace(/\binterface\s*\{\s*\}/gu, 'any').replace(/\bstruct\s*\{\s*\}/gu, 'struct');
  if (plain[0] !== '(') return null;
  const end = closing(plain, 0);
  if (end < 0) return null;
  const params = goTypes(plain.slice(1, end - 1));
  let rest = plain.slice(end);
  const body = rest.indexOf('{');
  if (body >= 0) rest = rest.slice(0, body);
  rest = rest.trim();
  let results;
  if (rest.startsWith('(')) {
    const close = closing(rest, 0);
    results = close < 0 ? null : goTypes(rest.slice(1, close - 1));
  } else results = rest ? goTypes(rest) : [];
  if (!params || !results) return null;
  return `(${params.join(',')})(${results.join(',')})`;
}

/** A Go interface's methods with their signatures, or `open` when it embeds another or a line cannot be read. */
function goInterface(lines, line, signature) {
  if (/\binterface\s*\{\s*\}/u.test(signature)) return {};
  const methods = [];
  for (let at = line; at < lines.length && at < line + BODY_LINES; at += 1) {
    const raw = (lines[at] ?? '').replace(/\/\/.*$/u, '');
    if (/^\}/u.test(raw)) return methods.length > 0 ? { methods } : {};
    if (raw.trim() === '') continue;
    const method = /^\s+([A-Za-z_]\w*)\s*(\(.*)$/u.exec(raw);
    const signed = method ? goSignature(method[2].trim()) : null;
    if (!signed) return { open: true };
    methods.push({ name: copy(method[1]), signature: copy(signed) });
  }
  return { open: true };
}

/** A Go struct's embedded types as written, or `open` when its body cannot be read. */
function goStruct(lines, line, signature) {
  if (/\bstruct\s*\{\s*\}/u.test(signature)) return { embeds: [] };
  if (!/\{\s*(?:\/\/.*)?$/u.test(signature)) return { open: true };
  const embeds = [];
  for (let at = line; at < lines.length && at < line + BODY_LINES; at += 1) {
    const raw = (lines[at] ?? '').replace(/\/\/.*$/u, '').replace(/`[^`]*`/gu, '').trim();
    if (/^\}/u.test(raw)) return { embeds };
    const embedded = /^\*?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)(?:\[[^\]]*\])?$/u.exec(raw);
    if (embedded) embeds.push(copy(embedded[1]));
  }
  return { open: true };
}

/**
 * The ties of each declaration in `declarations` (outline rows with their
 * `signature`), by index, the packages a Go file imports, the local names a
 * JavaScript file binds by default import, its class expressions, and whether
 * an import statement was cut at a cap.
 *
 * @param {object[]} declarations
 * @param {string} text the file's text
 * @param {string} path repository-relative path
 * @param {{ partial?: boolean }} [outline] whether the outline skipped part of the file
 */
export function typeTiesOf(declarations, text, path, { partial = false } = {}) {
  const python = path.endsWith('.py') || path.endsWith('.pyi');
  const js = /\.(?:[cm]?[jt]sx?)$/u.test(path);
  const rust = path.endsWith('.rs');
  const go = path.endsWith('.go');
  const ties = new Map();
  if (!(python || js || rust || go)) return { ties, goImports: [], defaultImports: [], expressions: [], importsCut: false };
  let lines = null;
  const linesOf = () => (lines ??= text.split('\n'));
  declarations.forEach((declaration, index) => {
    const signature = typeof declaration.signature === 'string' ? declaration.signature : '';
    if (declaration.kind === 'class' && (python || js || rust)) {
      const written = header(linesOf(), declaration.line, python);
      const bases = written === null ? null : python ? pythonBases(written) : js ? jsBases(written) : rustBases(written);
      if (bases === null) ties.set(index, { open: true });
      else if (bases.length > 0) ties.set(index, { bases: bases.map(copy) });
    } else if (go && declaration.kind === 'interface') ties.set(index, goInterface(linesOf(), declaration.line, signature));
    else if (go && declaration.kind === 'struct') ties.set(index, goStruct(linesOf(), declaration.line, signature));
    else if (go && declaration.kind === 'type') {
      // An alias takes the methods of the type it names; an alias of a literal function, map, channel or slice
      // type, or of a predeclared type other than `error`, has none.
      const alias = /^type\s+[A-Za-z_]\w*(?:\[[^\]]*\])?\s*=\s*(.*)$/u.exec(signature.trim());
      if (alias && !/^(?:func\b|map\[|chan\b|<-|\[|(?:any|bool|byte|rune|string|uintptr|u?int(?:8|16|32|64)?|float(?:32|64)|complex(?:64|128))\s*(?:\/\/.*)?$)/u.test(alias[1])) ties.set(index, { open: true });
    }
    else if (go && declaration.kind === 'method' && declaration.name.includes('.')) {
      const method = declaration.name.slice(declaration.name.lastIndexOf('.') + 1);
      const at = signature.search(new RegExp(`\\)\\s*${method}\\s*\\(`, 'u'));
      const signed = at < 0 ? null : goSignature(signature.slice(signature.indexOf('(', at + 1)));
      ties.set(index, { signature: signed === null ? null : copy(signed) });
    }
  });
  const goImports = go
    ? [...importsOf({ path, lines: linesOf() }).modules].filter(([, spec]) => spec?.go).map(([local, spec]) => [copy(local), copy(spec.go)])
    : [];
  const expressions = js && text.includes('class') ? classExpressions(linesOf()) : [];
  // A default import may give a base any local name, so a file whose class headers name a base, or that was not all outlined, keeps those names;
  // an import statement cut at a cap may hide one.
  let defaultImports = [];
  let importsCut = false;
  if ((js || python) && (partial || expressions.length > 0 || [...ties.values()].some((tie) => tie.bases || tie.open))) {
    const bindings = importsOf({ path, lines: linesOf() });
    importsCut = Boolean(bindings.incomplete);
    if (js) {
      defaultImports = [...bindings.names]
        .filter(([local, rows]) => rows.some((row) => row.imported === local && bindings.modules.get(local) === row.spec))
        .map(([local]) => copy(local));
    }
  }
  return { ties, goImports, defaultImports, expressions, importsCut };
}
