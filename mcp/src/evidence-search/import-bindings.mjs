/**
 * What a source file brings into scope, read from its import lines, so a call
 * is followed only to a declaration the file can reach. A name alone says
 * nothing: `map.get(` and `new Error(` match a `get` or an `Error` declared
 * anywhere, in any language, and following them reads code no caller runs.
 *
 * Each statement is read from lines of at most `LINE_CHARS` characters and at
 * most `STATEMENT_LINES` lines, so a hostile file costs one pass.
 */

import { posix } from 'node:path';

const LINE_CHARS = 2000;
const STATEMENT_LINES = 40;
const SPEC_CHARS = 300;

const FAMILIES = new Map([
  ...['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'].map((ext) => [ext, 'js']),
  ['.py', 'py'], ['.pyi', 'py'], ['.go', 'go'], ['.rs', 'rs'],
]);

/** The language a path is written in, by extension: `.ts` and `.mjs` are both `js`. */
export function languageOf(path) {
  const ext = posix.extname(String(path)).toLowerCase();
  return FAMILIES.get(ext) ?? ext;
}

function stripExtension(path) {
  const ext = posix.extname(path);
  return FAMILIES.has(ext.toLowerCase()) ? path.slice(0, -ext.length) : path;
}

/** The module paths a file answers to: `a/b.ts`, and `a` for `a/index.ts` or `a/__init__.py`. */
function stemsOf(path) {
  const stem = stripExtension(path);
  const stems = [stem];
  if (['index', '__init__', 'mod'].includes(posix.basename(stem))) stems.push(posix.dirname(stem));
  for (const held of [...stems]) if (held.endsWith('/src')) stems.push(held.slice(0, -4));
  return stems;
}

/**
 * Whether `spec` (one import of a file) names the module at `path`:
 * - `exact`: a relative import resolved against the importing file;
 * - `tail`: the trailing segments of a package import (`@/shared/x`, `pkg.mod`, `crate::a::b`);
 * - `go`: a Go import path, which ends with the package's folder.
 */
export function specReaches(spec, path) {
  if (!spec) return false;
  if (spec.go) {
    const folder = posix.dirname(path);
    return folder !== '.' && (spec.go === folder || spec.go.endsWith(`/${folder}`));
  }
  const stems = stemsOf(path);
  if (spec.exact) return stems.includes(spec.exact);
  return Boolean(spec.tail) && stems.some((stem) => stem === spec.tail || stem.endsWith(`/${spec.tail}`));
}

/** The module one level below `spec`: `from a import b` may bring in the module `a/b`. */
export function childSpec(spec, name) {
  if (!spec || spec.go) return null;
  if (spec.exact) return { exact: posix.join(spec.exact, name) };
  return spec.tail ? { tail: `${spec.tail}/${name}` } : { tail: name };
}

function jsSpec(file, raw) {
  const spec = raw.trim();
  if (!spec || spec.length > SPEC_CHARS) return null;
  if (spec.startsWith('.')) return { exact: stripExtension(posix.normalize(posix.join(posix.dirname(file.path), spec))).replace(/\/index$/u, '') };
  const parts = spec.split('/').filter(Boolean);
  if (parts[0] && /^[@~#]/u.test(parts[0]) && (parts[0].length === 1 || parts.length > 1)) parts.shift();
  return parts.length > 0 ? { tail: stripExtension(parts.join('/')) } : null;
}

function pySpec(file, dots, dotted) {
  const parts = dotted ? dotted.split('.').filter(Boolean) : [];
  if (dots === 0) return parts.length > 0 ? { tail: parts.join('/') } : null;
  let base = posix.dirname(file.path);
  for (let level = 1; level < dots; level += 1) base = posix.dirname(base);
  return { exact: posix.normalize(posix.join(base, ...parts)) };
}

function rsSpec(segments) {
  const parts = segments.filter((part) => part && !['crate', 'self', 'super'].includes(part));
  return parts.length > 0 ? { tail: parts.join('/') } : null;
}

/** Whitespace runs as one space, first, so no later pattern scans a run once per position. */
function spaced(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

function addName(bindings, local, spec, imported = local) {
  if (!spec || !/^[A-Za-z_$][\w$]*$/u.test(local)) return;
  const held = bindings.names.get(local) ?? [];
  held.push({ spec, imported });
  bindings.names.set(local, held);
}

/** The statement starting at `index`, joined over its continuation lines until `done` holds for one. */
function statement(lines, index, done) {
  let text = '';
  let at = index;
  for (; at < lines.length && at < index + STATEMENT_LINES; at += 1) {
    const line = lines[at];
    if (line.length > LINE_CHARS) break;
    text += `${line} `;
    if (done(line, at === index)) break;
  }
  return { text, last: Math.min(at, lines.length - 1) };
}

const JS_FROM = /\bfrom\s*['"]([^'"\n]{1,300})['"]/u;
const RUST_USE = /^\s*(?:pub(?:\([\w\s:]*\))?\s+)?use\s+/u;
const JS_REQUIRE = /^(?:const|let|var)\s+(\{[^}]{0,1000}\}|[A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"\n]{1,300})['"]\s*\)/u;

function jsClause(bindings, spec, clause) {
  const body = spaced(clause).replace(/^type /u, '');
  const namespace = /\* ?as ([A-Za-z_$][\w$]*)/u.exec(body);
  if (namespace) bindings.modules.set(namespace[1], spec);
  const open = body.indexOf('{');
  const close = open < 0 ? -1 : body.indexOf('}', open);
  if (open >= 0 && close > open) {
    for (const item of body.slice(open + 1, close).split(',')) {
      const [imported, local] = item.trim().replace(/^type /u, '').split(/ as |:/u).map((part) => part.trim());
      if (imported) addName(bindings, local || imported, spec, imported);
    }
  }
  const head = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/u.exec((open >= 0 ? body.slice(0, open) : body).trim());
  if (head) {
    addName(bindings, head[1], spec);
    bindings.modules.set(head[1], spec);
  }
}

function readJs(file, lines, bindings) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > LINE_CHARS) continue;
    const trimmed = line.trimStart();
    if (/^(?:import\s|import\{|export\s*(?:type\s*)?[{*])/u.test(trimmed)) {
      const { text, last } = statement(lines, index, (held, first) => JS_FROM.test(held) || (first && /^import\s*['"]/u.test(held.trimStart())) || /;\s*$/u.test(held));
      index = last;
      const from = JS_FROM.exec(text);
      if (!from) continue;
      const spec = jsSpec(file, from[1]);
      if (!spec) continue;
      bindings.specs.push(spec);
      jsClause(bindings, spec, text.slice(text.search(/\b(?:import|export)\b/u) + 6, from.index));
      continue;
    }
    const required = JS_REQUIRE.exec(trimmed);
    if (required) {
      const spec = jsSpec(file, required[2]);
      if (!spec) continue;
      bindings.specs.push(spec);
      jsClause(bindings, spec, required[1]);
    }
  }
}

function readPython(file, lines, bindings) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > LINE_CHARS) continue;
    const trimmed = line.trim();
    const from = /^from\s+(\.*)([\w.]*)\s+import\s+(.*)$/u.exec(trimmed);
    if (from) {
      let names = from[3];
      if (names.startsWith('(') && !names.includes(')')) {
        const { text, last } = statement(lines, index + 1, (held) => held.includes(')'));
        index = last;
        names += ` ${text}`;
      }
      const spec = pySpec(file, from[1].length, from[2]);
      if (!spec) continue;
      bindings.specs.push(spec);
      for (const item of spaced(names.replace(/[()\\]/gu, ' ')).split(',')) {
        const [imported, local] = item.trim().split(/ as /u).map((part) => part.trim());
        if (!imported || imported === '*') continue;
        addName(bindings, local || imported, spec, imported);
        const child = childSpec(spec, imported);
        bindings.specs.push(child);
        bindings.modules.set(local || imported, child);
      }
      continue;
    }
    const plain = /^import\s+(.+)$/u.exec(trimmed);
    if (!plain) continue;
    for (const item of spaced(plain[1]).split(',')) {
      const [dotted, local] = item.trim().split(/ as /u).map((part) => part.trim());
      const spec = pySpec(file, 0, dotted);
      if (!spec) continue;
      bindings.specs.push(spec);
      bindings.modules.set(local || dotted, spec);
    }
  }
}

function readGo(lines, bindings) {
  const take = (text) => {
    const match = /^(?:([A-Za-z_.]\w*)\s+)?"([^"\n]{1,300})"/u.exec(text.trim());
    if (!match) return;
    const spec = { go: match[2] };
    bindings.specs.push(spec);
    const segments = match[2].split('/');
    const name = match[1] ?? (/^v\d+$/u.test(segments.at(-1)) && segments.length > 1 ? segments.at(-2) : segments.at(-1));
    if (name && name !== '_' && name !== '.') bindings.modules.set(name.replace(/[^\w]/gu, '_'), spec);
  };
  let block = false;
  for (const line of lines) {
    if (line.length > LINE_CHARS) continue;
    const trimmed = line.trim();
    if (block) {
      if (trimmed.startsWith(')')) block = false;
      else take(trimmed);
      continue;
    }
    if (/^import\s*\(\s*$/u.test(trimmed)) block = true;
    else if (trimmed.startsWith('import ')) take(trimmed.slice(7));
  }
}

function readRust(lines, bindings) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > LINE_CHARS || !RUST_USE.test(line)) continue;
    const { text, last } = statement(lines, index, (held) => held.includes(';'));
    index = last;
    const path = spaced(text.replace(RUST_USE, '').split(';')[0]).replace(/ ?:: ?/gu, '::');
    const open = path.indexOf('{');
    const prefix = (open < 0 ? path : path.slice(0, open)).split('::').filter(Boolean);
    const items = open < 0 ? [prefix.pop() ?? ''] : path.slice(open + 1, path.lastIndexOf('}')).split(',');
    for (const item of items) {
      if (item.includes('{')) continue;
      const [route, local] = item.trim().split(/ as /u);
      const segments = route.split('::').filter(Boolean);
      const name = segments.pop();
      if (!name || name === '*' || name === 'self') continue;
      const spec = rsSpec([...prefix, ...segments]);
      if (!spec) continue;
      bindings.specs.push(spec);
      addName(bindings, local || name, spec, name);
    }
  }
}

const BINDINGS = new WeakMap();

/**
 * The names and modules a file imports: `names` local name -> [{ spec, imported }],
 * `modules` local name -> spec (a namespace, a Go package, a Python module), and
 * every spec it imports.
 *
 * @param {{ path: string, lines: string[] }} file
 */
export function importsOf(file) {
  if (BINDINGS.has(file)) return BINDINGS.get(file);
  const bindings = { names: new Map(), modules: new Map(), specs: [] };
  const lines = file.lines.map((line) => (line.length > LINE_CHARS ? line : line.replace(/\r?\n$/u, '')));
  const language = languageOf(file.path);
  if (language === 'js') readJs(file, lines, bindings);
  else if (language === 'py') readPython(file, lines, bindings);
  else if (language === 'go') readGo(lines, bindings);
  else if (language === 'rs') readRust(lines, bindings);
  bindings.specs = bindings.specs.filter(Boolean);
  BINDINGS.set(file, bindings);
  return bindings;
}
