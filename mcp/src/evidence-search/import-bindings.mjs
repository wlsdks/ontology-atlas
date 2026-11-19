/**
 * What a source file brings into scope, read from its import lines, so a call
 * is followed only to a declaration the file can reach. A name alone says
 * nothing: `map.get(` and `new Error(` match a `get` or an `Error` declared
 * anywhere, in any language, and following them reads code no caller runs.
 *
 * Each statement is read from lines of at most `LINE_CHARS` characters and at
 * most `STATEMENT_LINES` lines, so a hostile file costs one pass. A statement
 * or name cut at a cap marks the file's bindings `incomplete`. The family count
 * reads with `{ family: true }`: statements of up to `FAMILY_STATEMENT_LINES`
 * lines, and a JavaScript specifier kept apart by how it was written.
 */

import { posix } from 'node:path';

const LINE_CHARS = 2000;
const STATEMENT_LINES = 40;
const FAMILY_STATEMENT_LINES = 400;
const SPEC_CHARS = 300;
// Modules and names one file brings in that are kept; a file importing more is generated.
const SPECS = 256;
const NAMES = 1024;
// Modules one name may come from (a name imported twice, or once per build tag).
const BINDINGS_PER_NAME = 4;

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
export function stemsOf(path) {
  const stem = stripExtension(path);
  const stems = [stem];
  if (['index', '__init__', 'mod'].includes(posix.basename(stem))) stems.push(posix.dirname(stem));
  for (const held of [...stems]) if (held.endsWith('/src')) stems.push(held.slice(0, -4));
  return stems;
}

/** Every suffix of `path` that starts at a segment: `a/b/c`, `b/c`, `c`. */
export function segmentSuffixes(path) {
  const suffixes = [path];
  for (let at = path.indexOf('/'); at >= 0; at = path.indexOf('/', at + 1)) suffixes.push(path.slice(at + 1));
  return suffixes;
}

/** The module one level below `spec`: `from a import b` may bring in the module `a/b`. */
export function childSpec(spec, name) {
  if (!spec || spec.go) return null;
  if (spec.exact) return { exact: posix.join(spec.exact, name) };
  const internal = spec.internal ? { internal: true } : {};
  const raw = typeof spec.raw === 'string' ? { raw: `${spec.raw}/${name}` } : {};
  return spec.tail ? { tail: `${spec.tail}/${name}`, ...internal, ...raw } : { tail: name, ...internal, ...raw };
}

function jsSpec(file, raw) {
  const spec = raw.trim();
  if (!spec || spec.length > SPEC_CHARS) return null;
  if (spec.startsWith('.')) return { exact: stripExtension(posix.normalize(posix.join(posix.dirname(file.path), spec))).replace(/\/index$/u, '') };
  const parts = spec.split('/').filter(Boolean);
  // `@/x`, `~/x` and `#x` are the project's own path aliases; `@scope/pkg` drops its scope.
  const alias = parts[0] && /^[@~#]/u.test(parts[0]) && (parts[0].length === 1 || parts.length > 1);
  if (alias) parts.shift();
  // `raw` keeps the written specifier: a bare one names a package, never a file of that name.
  return parts.length > 0 ? { tail: stripExtension(parts.join('/')), raw: spec, ...(alias && spec[1] === '/' ? { internal: true } : {}) } : null;
}

function pySpec(file, dots, dotted) {
  if (dots + (dotted?.length ?? 0) > SPEC_CHARS) return null;
  const parts = dotted ? dotted.split('.').filter(Boolean) : [];
  if (dots === 0) return parts.length > 0 ? { tail: parts.join('/') } : null;
  let base = posix.dirname(file.path);
  for (let level = 1; level < dots; level += 1) base = posix.dirname(base);
  return { exact: posix.normalize(posix.join(base, ...parts)) };
}

function rsSpec(segments) {
  const parts = segments.filter((part) => part && !['crate', 'self', 'super'].includes(part));
  if (parts.length === 0) return null;
  return { tail: parts.join('/'), ...(['crate', 'self', 'super'].includes(segments[0]) ? { internal: true } : {}) };
}

/** Whitespace runs as one space, first, so no later pattern scans a run once per position. */
function spaced(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

/** One string per module a spec names; a package-internal tail (`@/x`, `crate::x`) is its own key. */
export function specKey(spec) {
  return spec.go ? `g\0${spec.go}` : spec.exact ? `e\0${spec.exact}` : `t\0${spec.tail}\0${spec.internal ? 1 : 0}`;
}

/** The one copy of `spec` this file holds, or null past the cap or for no spec. */
function addSpec(bindings, spec) {
  if (!spec) return null;
  const key = bindings.family && typeof spec.raw === 'string' ? `${specKey(spec)}\0${spec.raw}` : specKey(spec);
  const held = bindings.byKey.get(key);
  if (held) return held;
  if (bindings.byKey.size >= SPECS) {
    bindings.incomplete = true;
    return null;
  }
  bindings.byKey.set(key, spec);
  return spec;
}

function addModule(bindings, local, spec) {
  if (spec && (bindings.modules.has(local) || bindings.modules.size < NAMES)) bindings.modules.set(local, spec);
}

function addName(bindings, local, spec, imported = local) {
  if (!spec || !/^[A-Za-z_$][\w$]*$/u.test(local)) return;
  const held = bindings.names.get(local);
  const rows = held ?? [];
  if (rows.some((row) => row.spec === spec && row.imported === imported)) return;
  if ((!held && bindings.names.size >= NAMES) || rows.length >= BINDINGS_PER_NAME) {
    bindings.incomplete = true;
    return;
  }
  rows.push({ spec, imported });
  bindings.names.set(local, rows);
}

/** The statement starting at `index`, joined over its continuation lines until `done` holds for one. */
function statement(lines, index, done, limit = STATEMENT_LINES) {
  let text = '';
  let at = index;
  let ended = false;
  for (; at < lines.length && at < index + limit; at += 1) {
    const line = lines[at];
    if (line.length > LINE_CHARS) break;
    text += `${line} `;
    if (done(line, at === index)) {
      ended = true;
      break;
    }
  }
  return { text, last: Math.min(at, lines.length - 1), cut: !ended && at < lines.length };
}

const JS_FROM = /\bfrom\s*['"]([^'"\n]{1,300})['"]/u;
const RUST_USE = /^\s*(?:pub(?:\([\w\s:]*\))?\s+)?use\s+/u;
const JS_REQUIRE = /^(?:const|let|var)\s+(\{[^}]{0,1000}\}|[A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"\n]{1,300})['"]\s*\)/u;

function jsClause(bindings, spec, clause) {
  const body = spaced(clause).replace(/^type /u, '');
  const namespace = /\* ?as ([A-Za-z_$][\w$]*)/u.exec(body);
  if (namespace) addModule(bindings, namespace[1], spec);
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
    addModule(bindings, head[1], spec);
  }
}

function readJs(file, lines, bindings) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > LINE_CHARS) {
      if (/^\s*(?:import|export)\b/u.test(line.slice(0, 64))) bindings.incomplete = true;
      continue;
    }
    const trimmed = line.trimStart();
    if (/^(?:import\s|import\{|export\s*(?:type\s*)?[{*])/u.test(trimmed)) {
      const { text, last, cut } = statement(lines, index, (held, first) => JS_FROM.test(held) || (first && /^import\s*['"]/u.test(held.trimStart())) || /;\s*$/u.test(held), bindings.statementLines);
      index = last;
      if (cut) bindings.incomplete = true;
      const from = JS_FROM.exec(text);
      if (!from) continue;
      const spec = addSpec(bindings, jsSpec(file, from[1]));
      if (!spec) continue;
      jsClause(bindings, spec, text.slice(text.search(/\b(?:import|export)\b/u) + 6, from.index));
      continue;
    }
    const required = JS_REQUIRE.exec(trimmed);
    if (required) {
      const spec = addSpec(bindings, jsSpec(file, required[2]));
      if (!spec) continue;
      jsClause(bindings, spec, required[1]);
    }
  }
}

function readPython(file, lines, bindings) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > LINE_CHARS) {
      if (/^\s*(?:from|import)\b/u.test(line.slice(0, 64))) bindings.incomplete = true;
      continue;
    }
    const trimmed = line.trim();
    // The module part starts with a word, so the dots and it never trade characters.
    const from = /^from\s+(\.*)(\w[\w.]*)?\s+import\s+(.*)$/u.exec(trimmed);
    if (from) {
      let names = from[3];
      if (names.startsWith('(') && !names.includes(')')) {
        const { text, last, cut } = statement(lines, index + 1, (held) => held.includes(')'), bindings.statementLines);
        index = last;
        if (cut) bindings.incomplete = true;
        names += ` ${text}`;
      }
      const spec = addSpec(bindings, pySpec(file, from[1].length, from[2] ?? ''));
      if (!spec) continue;
      for (const item of spaced(names.replace(/[()\\]/gu, ' ')).split(',')) {
        const [imported, local] = item.trim().split(/ as /u).map((part) => part.trim());
        if (!imported || imported === '*') continue;
        addName(bindings, local || imported, spec, imported);
        addModule(bindings, local || imported, addSpec(bindings, childSpec(spec, imported)));
      }
      continue;
    }
    const plain = /^import\s+(.+)$/u.exec(trimmed);
    if (!plain) continue;
    for (const item of spaced(plain[1]).split(',')) {
      const [dotted, local] = item.trim().split(/ as /u).map((part) => part.trim());
      const spec = addSpec(bindings, pySpec(file, 0, dotted));
      if (!spec) continue;
      addModule(bindings, local || dotted, spec);
    }
  }
}

function readGo(lines, bindings) {
  const take = (text) => {
    const match = /^(?:([A-Za-z_.]\w*)\s+)?"([^"\n]{1,300})"/u.exec(text.trim());
    if (!match) return;
    const spec = addSpec(bindings, { go: match[2] });
    if (!spec) return;
    const segments = match[2].split('/');
    const name = match[1] ?? (/^v\d+$/u.test(segments.at(-1)) && segments.length > 1 ? segments.at(-2) : segments.at(-1));
    if (name && name !== '_' && name !== '.') addModule(bindings, name.replace(/[^\w]/gu, '_'), spec);
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
    const { text, last, cut } = statement(lines, index, (held) => held.includes(';'), bindings.statementLines);
    index = last;
    if (cut) bindings.incomplete = true;
    const path = spaced(text.replace(RUST_USE, '').split(';')[0]).replace(/ ?:: ?/gu, '::');
    const open = path.indexOf('{');
    const head = open < 0 ? path : path.slice(0, open);
    // A module path longer than any import names is not one: the statement is skipped whole.
    if (head.length > SPEC_CHARS) continue;
    const prefix = head.split('::').filter(Boolean);
    const items = open < 0 ? [prefix.pop() ?? ''] : path.slice(open + 1, path.lastIndexOf('}')).split(',');
    for (const item of items) {
      if (item.includes('{')) continue;
      const [route, local] = item.trim().split(/ as /u);
      if (route.length > SPEC_CHARS) continue;
      const segments = route.split('::').filter(Boolean);
      const name = segments.pop();
      if (!name || name === '*' || name === 'self') continue;
      const spec = addSpec(bindings, rsSpec([...prefix, ...segments]));
      if (!spec) continue;
      addName(bindings, local || name, spec, name);
    }
  }
}

const BINDINGS = new WeakMap();
const FAMILY_BINDINGS = new WeakMap();

/**
 * The names and modules a file imports: `names` local name -> [{ spec, imported }],
 * `modules` local name -> spec (a namespace, a Go package, a Python module), and
 * every spec it imports.
 *
 * @param {{ path: string, lines: string[] }} file
 * @param {{ family?: boolean }} [options] read as the family count does
 */
export function importsOf(file, { family = false } = {}) {
  const cache = family ? FAMILY_BINDINGS : BINDINGS;
  if (cache.has(file)) return cache.get(file);
  const bindings = {
    names: new Map(), modules: new Map(), byKey: new Map(), specs: [], incomplete: false,
    family, statementLines: family ? FAMILY_STATEMENT_LINES : STATEMENT_LINES,
  };
  const lines = file.lines.map((line) => (line.length > LINE_CHARS ? line : line.replace(/\r?\n$/u, '')));
  const language = languageOf(file.path);
  if (language === 'js') readJs(file, lines, bindings);
  else if (language === 'py') readPython(file, lines, bindings);
  else if (language === 'go') readGo(lines, bindings);
  else if (language === 'rs') readRust(lines, bindings);
  bindings.specs = [...bindings.byKey.values()];
  cache.set(file, bindings);
  return bindings;
}
