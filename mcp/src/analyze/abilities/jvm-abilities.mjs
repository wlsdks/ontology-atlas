/**
 * Abilities a Java or Kotlin product offers, read from masked source so a
 * comment or a string literal never produces a row (an annotation's string
 * argument is read from the original text at the same offsets):
 * - an HTTP resource class, JAX-RS (`@Path` with `@GET`, `@POST`...) or Spring
 *   (`@RestController` or `@Controller`, `@RequestMapping`, `@GetMapping`...),
 *   is one `route` row whose members are its routes, those it inherits from a
 *   repository base class included;
 * - a `static void main` (Kotlin: a top-level `fun main`) is an `executable`;
 * - scheduled work is a `worker`: a `@Scheduled` method, a
 *   `scheduleAtFixedRate` or `scheduleWithFixedDelay` call, or a class
 *   implementing a repository task type that is runnable and takes a scheduler;
 * - a message consumer is a `worker` too, one row per method or class annotated
 *   as a Kafka, RabbitMQ, JMS, SQS or Pulsar listener, named for its method,
 *   apart from the class's scheduled work;
 * - three or more concrete classes in one folder whose supertype is the same
 *   type are a `family`, the supertype resolved through the file, an explicit
 *   import or the package. A class whose supertype cannot be resolved is in no
 *   family, and Java and Kotlin runtime types (`java.*`, `kotlin.*`) found none.
 * A path written as a constant, not a literal, cannot be decided and gives no
 * route. Every row carries `evidence` as `path:Lline`. Pure: text comes only
 * from `readText`.
 */

import { posix } from 'node:path';

import { jvmHeader, maskJvmSource } from '../../infer-imports/java-imports.mjs';

const JVM_FILE = /\.(?:java|kt)$/;
const FAMILY_SIZE = 3;
/** Supertype chains are followed this many levels up. */
const ANCESTOR_LIMIT = 8;
/** Classes nested deeper than this are not read. */
const NESTING_LIMIT = 4;
/** A file importing more packages whole than this leaves every unknown type undecided. */
const WILDCARD_LIMIT = 64;
/** A `main` signature is read this far on either side of its name. */
const MAIN_HEAD_CHARS = 256;
const JAX_RS_PACKAGE = /^(?:jakarta|javax)\.ws\.rs(?:\.|$)/;
const SPRING_PACKAGE = /^org\.springframework\./;
const SPRING_WEB_PACKAGE = /^org\.springframework\.web\.bind\.annotation(?:\.|$)/;
const JAX_RS_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
const SPRING_MAPPINGS = new Map([
  ['GetMapping', 'GET'],
  ['PostMapping', 'POST'],
  ['PutMapping', 'PUT'],
  ['DeleteMapping', 'DELETE'],
  ['PatchMapping', 'PATCH'],
  ['RequestMapping', null],
]);
const SPRING_CONTROLLERS = new Set(['RestController', 'Controller']);
const RUNTIME_TYPE = /^(?:java|kotlin)\./;
const RUNNABLE_TYPES = new Set(['java.lang.Runnable', 'java.util.TimerTask']);
const SCHEDULER_TYPE = /\b(?:ScheduledExecutorService|TaskScheduler|Timer)\b/;
const SCHEDULE_CALL = /\.\s*(?:scheduleAtFixedRate|scheduleWithFixedDelay)\s*\(/g;
const MESSAGE_LISTENERS = new Set(['KafkaListener', 'RabbitListener', 'JmsListener', 'SqsListener', 'PulsarListener']);

/** Kotlin's `enum class X` is an enum named X: the second keyword is skipped, not read as the name. */
const CLASS_HEAD = /\b(class|interface|enum|record|object)[ \t\r\n]+(?:class[ \t\r\n]+)?([A-Za-z_$][\w$]*)/g;
const ANNOTATION = /@([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/g;
const JAVA_METHOD_NAME = /(?<![\w$])([A-Za-z_$][\w$]*)\s*\(/g;
/** Type arguments are read up to 200 characters, so an unclosed `<` costs a bounded scan per function. */
const KOTLIN_FUNCTION_NAME = /\bfun\s+(?:<[^>{}]{0,200}>\s*)?(?:[\w$]+(?:<[^>{}]{0,200}>)?\??\.)*([A-Za-z_$][\w$]*)\s*\(/g;
const JAVA_MAIN_PARAMETERS = /^main\s*\(\s*(?:final\s+)?String\s*(?:(?:\[\s*\]|\.\.\.)\s*[\w$]+|\s[\w$]+\s*\[\s*\])\s*\)/;
const KOTLIN_MAIN = /\bfun\s+main\s*\(/g;
/** A line that starts another Kotlin declaration ends a class head written without a body. */
const KOTLIN_NEXT_DECLARATION = /\n[ \t]*(?:@|(?:public|private|internal|protected|abstract|open|sealed|data|enum|annotation|inline|value|class|interface|object|fun|val|var|typealias)\b)/;

/* ---------------------------------------------------------------------------
 * One file
 * ------------------------------------------------------------------------- */

/** The offset of the `}` closing each `{`. */
function closingBraces(masked) {
  const closeOf = new Map();
  const open = [];
  for (let index = 0; index < masked.length; index += 1) {
    const character = masked.charCodeAt(index);
    if (character === 123) open.push(index);
    else if (character === 125 && open.length > 0) closeOf.set(open.pop(), index);
  }
  return closeOf;
}

/** The offset just past the `)` closing the `(` at `start`, or `limit` when it does not close before it. */
function closingParen(masked, start, limit) {
  let depth = 0;
  for (let index = start; index < limit; index += 1) {
    if (masked[index] === '(') depth += 1;
    else if (masked[index] === ')' && --depth === 0) return index + 1;
  }
  return limit;
}

/** Annotations in `masked` between `from` and `to`: name, offset, and the range inside their parentheses. */
function annotationsIn(masked, from, to) {
  const found = [];
  const segment = masked.slice(from, to);
  ANNOTATION.lastIndex = 0;
  for (let match = ANNOTATION.exec(segment); match; match = ANNOTATION.exec(segment)) {
    const start = from + match.index;
    const name = match[1].replace(/\s+/g, '').split('.').pop();
    let end = start + match[0].length;
    let args = null;
    const paren = /^\s*\(/.exec(masked.slice(end, Math.min(to, end + 64)));
    if (paren) {
      const open = end + paren[0].length - 1;
      const close = closingParen(masked, open, to);
      args = { start: open + 1, end: Math.max(open + 1, close - 1) };
      end = close;
    }
    found.push({ name, start, end, args });
    ANNOTATION.lastIndex = end - from;
  }
  return found;
}

/** Where the declaration ending at `start` began: after the last `;`, `{` or `}` outside parentheses, never before `floor`. */
function declarationStart(masked, start, floor = 0) {
  let parens = 0;
  for (let index = start - 1; index >= floor; index -= 1) {
    const character = masked[index];
    if (character === ')') parens += 1;
    else if (character === '(') parens -= 1;
    else if (parens <= 0 && (character === ';' || character === '{' || character === '}')) return index + 1;
  }
  return floor;
}

/** The `{` opening a class body after its head and before `limit`, or -1 when the class has none. */
function bodyOpenAfter(masked, from, limit, kotlin) {
  let parens = 0;
  let outside = '';
  for (let index = from; index < limit; index += 1) {
    const character = masked[index];
    if (character === '(') parens += 1;
    else if (character === ')') parens -= 1;
    else if (parens === 0 && (character === ';' || character === '}')) return -1;
    else if (parens === 0 && character === '{') {
      return kotlin && KOTLIN_NEXT_DECLARATION.test(outside) ? -1 : index;
    } else if (parens === 0) outside += character;
  }
  return -1;
}

/** The text with every `<...>` type argument list blanked, nested ones included, in one pass. */
function withoutGenerics(text) {
  let depth = 0;
  let result = '';
  for (const character of text) {
    if (character === '<') depth += 1;
    else if (character === '>' && depth > 0) depth -= 1;
    else if (depth === 0) result += character;
  }
  return result;
}

function typeNames(list) {
  return list
    .split(',')
    .map((item) => item.replace(/\bby\b[\s\S]*$/, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ''))
    .filter((item) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(item));
}

/** The supertypes a class head names: Java `extends` and `implements`, Kotlin `: Base(), Face`. */
function supertypesOf(head, kotlin) {
  const plain = withoutGenerics(head);
  if (kotlin) {
    let flat = '';
    let parens = 0;
    for (const character of plain) {
      if (character === '(') parens += 1;
      if (parens === 0) flat += character;
      if (character === ')') parens -= 1;
    }
    const colon = flat.indexOf(':');
    return colon < 0 ? [] : typeNames(flat.slice(colon + 1).replace(/\bwhere\b[\s\S]*$/, ''));
  }
  const extended = /\bextends\s+([\s\S]*?)(?=\bimplements\b|\bpermits\b|$)/.exec(plain)?.[1] ?? '';
  const implemented = /\bimplements\s+([\s\S]*?)(?=\bpermits\b|$)/.exec(plain)?.[1] ?? '';
  return [...typeNames(extended), ...typeNames(implemented)];
}

/**
 * The members of a class body: each declaration's head (annotations, modifiers,
 * signature) and its body when it has one, read at the body's own depth.
 */
function membersOf(masked, cls, closeOf) {
  const members = [];
  let headStart = cls.bodyOpen + 1;
  let parens = 0;
  for (let index = headStart; index < cls.bodyClose; index += 1) {
    const character = masked[index];
    if (character === '(') parens += 1;
    else if (character === ')') parens -= 1;
    else if (parens <= 0 && character === ';') {
      members.push({ headStart, headEnd: index, bodyOpen: -1, bodyClose: index });
      headStart = index + 1;
      parens = 0;
    } else if (parens <= 0 && character === '{') {
      const close = closeOf.get(index) ?? cls.bodyClose;
      members.push({ headStart, headEnd: index, bodyOpen: index, bodyClose: close });
      index = close;
      headStart = close + 1;
      parens = 0;
    }
  }
  if (headStart < cls.bodyClose) members.push({ headStart, headEnd: cls.bodyClose, bodyOpen: -1, bodyClose: cls.bodyClose });
  return members;
}

/** Method names in a member head with its annotations blanked, each with its offset. */
function methodNames(masked, member, annotations, kotlin) {
  const parts = [];
  let copied = member.headStart;
  for (const annotation of annotations) {
    parts.push(masked.slice(copied, annotation.start), ' '.repeat(annotation.end - annotation.start));
    copied = annotation.end;
  }
  parts.push(masked.slice(copied, member.headEnd));
  const head = parts.join('');
  const pattern = kotlin ? KOTLIN_FUNCTION_NAME : JAVA_METHOD_NAME;
  return [...head.matchAll(pattern)].map((match) => ({ name: match[1], offset: member.headStart + match.index }));
}

/** One string literal in `text` at `index`: its value and the offset after it, or null. */
function stringLiteral(text, index) {
  if (text[index] !== '"') return null;
  let value = '';
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === '\\') {
      value += text[cursor + 1] ?? '';
      cursor += 1;
    } else if (character === '"') {
      return { value, end: cursor + 1 };
    } else if (character === '\n') {
      return null;
    } else {
      value += character;
    }
  }
  return null;
}

function skipSpace(text, index) {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  return cursor;
}

/** A literal or a bracketed list of literals at `index`, or null when any item is not a literal. */
function literalList(text, index) {
  let cursor = skipSpace(text, index);
  const arrayOf = /^arrayOf\s*\(/.exec(text.slice(cursor));
  const close = arrayOf ? ')' : text[cursor] === '{' ? '}' : text[cursor] === '[' ? ']' : null;
  const end = (at) => {
    const next = skipSpace(text, at);
    return next >= text.length || text[next] === ',' || text[next] === ')';
  };
  if (!close) {
    const literal = stringLiteral(text, cursor);
    return literal && end(literal.end) ? [literal.value] : null;
  }
  cursor += arrayOf ? arrayOf[0].length : 1;
  const values = [];
  for (;;) {
    cursor = skipSpace(text, cursor);
    if (text[cursor] === close) return end(cursor + 1) ? values : null;
    const literal = stringLiteral(text, cursor);
    if (!literal) return null;
    values.push(literal.value);
    cursor = skipSpace(text, literal.end);
    if (text[cursor] === ',') cursor += 1;
    else if (text[cursor] !== close) return null;
  }
}

/**
 * The paths an annotation names: its `value` or `path` attribute, else its
 * positional argument; `['']` when it names none; null when a path is not a
 * literal and so cannot be decided.
 */
function annotationPaths(file, annotation) {
  if (!annotation?.args) return [''];
  const masked = file.masked.slice(annotation.args.start, annotation.args.end);
  const original = file.text.slice(annotation.args.start, annotation.args.end);
  if (!masked.trim()) return [''];
  const named = [...masked.matchAll(/(?:^|,)\s*([A-Za-z_]\w*)\s*=(?!=)/g)];
  if (named.length === 0) return literalList(original, 0);
  const attribute = named.find((match) => match[1] === 'value' || match[1] === 'path');
  if (!attribute) return [''];
  return literalList(original, attribute.index + attribute[0].length);
}

function joinRoute(...parts) {
  const path = parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
  return `/${path}`;
}

/** The newline offsets of `text`, for line numbers by binary search. */
function lineStarts(text) {
  const starts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) starts.push(index + 1);
  return starts;
}

function lineAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/**
 * Every class a file declares, with its annotations, supertypes, members and
 * enclosing class. A head is read only up to the next class head and a prefix
 * only back to the previous one, so the file costs one pass however its
 * declarations are shaped; classes nested deeper than the nesting limit are
 * left out.
 */
function readFile(path, text) {
  const kotlin = path.endsWith('.kt');
  const masked = maskJvmSource(text, { kotlin });
  const { packageName, imports } = jvmHeader(masked);
  const closeOf = closingBraces(masked);
  const starts = lineStarts(text);
  const heads = [...masked.matchAll(CLASS_HEAD)].filter((match) => {
    if (match[1] === 'object' && !kotlin) return false;
    if (/[.:]\s*$/.test(masked.slice(Math.max(0, match.index - 3), match.index))) return false;
    const nameEnd = match.index + match[0].length;
    return match[1] !== 'record' || /^\s*[(<]/.test(masked.slice(nameEnd, nameEnd + 8));
  });
  const classes = [];
  const open = [];
  heads.forEach((match, index) => {
    const [, keyword, name] = match;
    const nameEnd = match.index + match[0].length;
    while (open.length > 0 && open.at(-1).bodyClose < match.index) open.pop();
    if (open.length >= NESTING_LIMIT) return;
    const floor = index > 0 ? heads[index - 1].index + heads[index - 1][0].length : 0;
    const limit = heads[index + 1]?.index ?? masked.length;
    const bodyOpen = bodyOpenAfter(masked, nameEnd, limit, kotlin);
    const prefixStart = declarationStart(masked, match.index, floor);
    const annotations = annotationsIn(masked, prefixStart, match.index);
    const modifiers = masked.slice(prefixStart, match.index);
    const cls = {
      name,
      keyword,
      start: match.index,
      annotations,
      abstract: keyword === 'interface' || /\b(?:abstract|sealed)\b/.test(modifiers),
      supertypes: supertypesOf(masked.slice(nameEnd, bodyOpen < 0 ? limit : bodyOpen), kotlin),
      bodyOpen,
      bodyClose: bodyOpen < 0 ? -1 : closeOf.get(bodyOpen) ?? masked.length,
      outer: open.at(-1) ?? null,
    };
    cls.qualifiedName = cls.outer ? `${cls.outer.qualifiedName}.${name}` : [packageName, name].filter(Boolean).join('.');
    classes.push(cls);
    if (bodyOpen >= 0) open.push(cls);
  });
  const file = { path, text, masked, kotlin, packageName, imports, classes, starts, closeOf, byName: new Map(), importsOf: new Map(), wildcards: [], frameworks: new Map() };
  for (const row of imports) {
    if (row.wildcard) file.wildcards.push(row.spec);
    else if (!file.importsOf.has(row.spec.split('.').pop())) file.importsOf.set(row.spec.split('.').pop(), row.spec);
  }
  for (const cls of classes) {
    cls.file = file;
    if (!file.byName.has(cls.name)) file.byName.set(cls.name, cls);
    cls.members = cls.bodyOpen < 0 ? [] : membersOf(masked, cls, closeOf).map((member) => {
      const memberAnnotations = annotationsIn(masked, member.headStart, member.headEnd);
      return { ...member, annotations: memberAnnotations, names: methodNames(masked, member, memberAnnotations, kotlin) };
    });
  }
  return file;
}

/** The innermost class whose body holds `offset`: the last class opened before it, then outward. */
function classAt(file, offset) {
  let low = 0;
  let high = file.classes.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (file.classes[middle].start < offset) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  for (let cls = file.classes[found] ?? null; cls; cls = cls.outer) {
    if (cls.bodyOpen >= 0 && cls.bodyOpen < offset && offset < cls.bodyClose) return cls;
  }
  return null;
}

/** The method an annotation at `offset` sits on: the first method name after it in the same member head. */
function annotatedMethod(member, offset) {
  return member.names.find((entry) => entry.offset > offset)?.name ?? null;
}

/** The member of `cls` whose head or body holds `offset`, by binary search over the members in order. */
function memberAt(cls, offset) {
  let low = 0;
  let high = cls.members.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const member = cls.members[middle];
    if (offset < member.headStart) high = middle - 1;
    else if (offset > member.bodyClose) low = middle + 1;
    else return member;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Types across files
 * ------------------------------------------------------------------------- */

function importsFrom(file, pattern) {
  if (!file.frameworks.has(pattern)) file.frameworks.set(pattern, file.imports.some((row) => pattern.test(row.spec)));
  return file.frameworks.get(pattern);
}

/**
 * The qualified name a type reference in `file` means, or null when it cannot
 * be decided: a type declared in the file, an explicit import, a type of the
 * same package, a type in an imported package, and with no wildcard import
 * left open, the language's implicit package.
 */
function resolveType(reference, file, types) {
  const [head, ...rest] = reference.split('.');
  if (rest.length > 0 && /^[a-z]/.test(head)) return reference;
  const suffix = rest.length > 0 ? `.${rest.join('.')}` : '';
  const local = file.byName.get(head);
  if (local) return `${local.qualifiedName}${suffix}`;
  const imported = file.importsOf.get(head);
  if (imported) return `${imported}${suffix}`;
  const samePackage = file.packageName ? `${file.packageName}.${head}` : head;
  if (types.has(samePackage)) return `${samePackage}${suffix}`;
  if (file.wildcards.length > WILDCARD_LIMIT) return null;
  for (const spec of file.wildcards) {
    if (types.has(`${spec}.${head}`)) return `${spec}.${head}${suffix}`;
  }
  if (file.wildcards.length > 0) return null;
  return `${file.kotlin ? 'kotlin' : 'java.lang'}.${head}${suffix}`;
}

/** The resolved supertypes of a class; an unresolvable one is left out. */
function supertypes(cls, types) {
  cls.resolvedSupertypes ??= cls.supertypes.map((name) => resolveType(name, cls.file, types)).filter(Boolean);
  return cls.resolvedSupertypes;
}

/** Every type above `cls`, nearest first, followed through repository classes up to the ancestor limit. */
function ancestorsOf(cls, types) {
  if (cls.ancestors) return cls.ancestors;
  const found = new Set();
  let frontier = [cls];
  for (let level = 0; level < ANCESTOR_LIMIT && frontier.length > 0; level += 1) {
    const next = [];
    for (const current of frontier) {
      for (const name of supertypes(current, types)) {
        if (found.has(name)) continue;
        found.add(name);
        if (types.has(name)) next.push(types.get(name));
      }
    }
    frontier = next;
  }
  cls.ancestors = [...found];
  return cls.ancestors;
}

/* ---------------------------------------------------------------------------
 * Rows
 * ------------------------------------------------------------------------- */

function evidence(cls, offset = cls.start) {
  return { path: cls.file.path, line: lineAt(cls.file.starts, offset) };
}

function row(kind, fields, at) {
  return { kind, ...fields, path: at.path, line: at.line, evidence: `${at.path}:L${at.line}` };
}

/**
 * A class's member annotations grouped by the method each sits on: a Kotlin
 * function with an expression body has no braces, so one member head can hold
 * several functions.
 */
function annotationsByMethod(cls) {
  const groups = [];
  for (const member of cls.members) {
    const byMethod = new Map();
    let next = 0;
    for (const annotation of member.annotations) {
      while (next < member.names.length && member.names[next].offset <= annotation.start) next += 1;
      const method = member.names[next];
      if (!method) continue;
      if (!byMethod.has(method.offset)) byMethod.set(method.offset, []);
      byMethod.get(method.offset).push(annotation);
    }
    groups.push(...byMethod.values());
  }
  return groups;
}

/** The routes a class declares itself: `METHOD /path` relative to `base`, null routes left out. */
function ownRoutes(cls, base) {
  const routes = [];
  const jaxRs = importsFrom(cls.file, JAX_RS_PACKAGE);
  const spring = importsFrom(cls.file, SPRING_WEB_PACKAGE);
  for (const annotations of annotationsByMethod(cls)) {
    const methods = [];
    let paths = [''];
    let mapped = false;
    for (const annotation of annotations) {
      if (jaxRs && JAX_RS_METHODS.has(annotation.name)) {
        methods.push(annotation.name);
        mapped = true;
      } else if (jaxRs && annotation.name === 'Path') {
        paths = annotationPaths(cls.file, annotation);
      } else if (spring && SPRING_MAPPINGS.has(annotation.name)) {
        mapped = true;
        paths = annotationPaths(cls.file, annotation);
        const fixed = SPRING_MAPPINGS.get(annotation.name);
        if (fixed) methods.push(fixed);
        else {
          const args = annotation.args ? cls.file.masked.slice(annotation.args.start, annotation.args.end) : '';
          const named = /\bmethod\s*=\s*([^=]*?)(?:,\s*[A-Za-z_]\w*\s*=|$)/.exec(args)?.[1] ?? '';
          const listed = [...named.matchAll(/\bRequestMethod\.([A-Z]+)\b/g)].map((match) => match[1]);
          methods.push(...(listed.length > 0 ? listed : ['ANY']));
        }
      }
    }
    if (!mapped || !paths) continue;
    for (const method of methods) for (const path of paths) routes.push(`${method} ${joinRoute(base, path)}`);
  }
  return routes;
}

/** A resource class's base paths and the annotation line that sets them, or null when it is not one. */
function resourceBase(cls) {
  if (cls.keyword === 'interface' || cls.bodyOpen < 0) return null;
  const find = (name) => cls.annotations.find((annotation) => annotation.name === name);
  if (importsFrom(cls.file, JAX_RS_PACKAGE) && find('Path')) {
    return { paths: annotationPaths(cls.file, find('Path')), at: find('Path') };
  }
  const controller = cls.annotations.find((annotation) => SPRING_CONTROLLERS.has(annotation.name));
  if (!controller || !importsFrom(cls.file, SPRING_PACKAGE)) return null;
  const mapping = find('RequestMapping');
  return { paths: mapping ? annotationPaths(cls.file, mapping) : [''], at: mapping ?? controller };
}

function routeRows(classes, types) {
  const rows = [];
  for (const cls of classes) {
    const base = resourceBase(cls);
    if (!base?.paths) continue;
    const members = new Set();
    const inherited = ancestorsOf(cls, types).map((name) => types.get(name)).filter(Boolean);
    for (const path of base.paths) {
      for (const source of [cls, ...inherited]) {
        for (const route of ownRoutes(source, path)) members.add(route);
      }
    }
    if (members.size > 0) rows.push(row('route', { name: cls.name, members: [...members] }, evidence(cls, base.at.start)));
  }
  return rows;
}

/** Whether the method named at `offset` is `static void main(String[] args)` (or `String... args`). */
function isJavaMain(masked, headStart, offset) {
  const before = masked.slice(Math.max(headStart, offset - MAIN_HEAD_CHARS), offset);
  return /\bvoid\s+$/.test(before)
    && /\bstatic\b/.test(before)
    && JAVA_MAIN_PARAMETERS.test(masked.slice(offset, offset + MAIN_HEAD_CHARS));
}

/**
 * Java: a class member `static void main(String[] args)`. Kotlin: a top-level
 * `fun main`, named for its file, or a `@JvmStatic fun main` in an object.
 */
function executableRows(files) {
  const rows = [];
  for (const file of files) {
    if (file.kotlin) {
      let floor = 0;
      for (const match of file.masked.matchAll(KOTLIN_MAIN)) {
        const owner = classAt(file, match.index);
        const at = { path: file.path, line: lineAt(file.starts, match.index) };
        if (!owner) {
          rows.push(row('executable', { name: file.path.split('/').pop().replace(/\.kt$/, ''), symbol: 'main' }, at));
        } else if (/@JvmStatic\b/.test(file.masked.slice(declarationStart(file.masked, match.index, floor), match.index))) {
          rows.push(row('executable', { name: owner.name, symbol: `${owner.name}.main` }, at));
        }
        floor = match.index + match[0].length;
      }
      continue;
    }
    for (const cls of file.classes) {
      const main = cls.members
        .flatMap((member) => member.names.filter((entry) => entry.name === 'main').map((entry) => ({ member, offset: entry.offset })))
        .find(({ member, offset }) => isJavaMain(file.masked, member.headStart, offset));
      if (main) rows.push(row('executable', { name: cls.name, symbol: `${cls.name}.main` }, evidence(cls, main.offset)));
    }
  }
  return rows;
}

/** A repository type a scheduler runs: runnable, and its own body takes a scheduler. */
function isTaskType(cls, types) {
  if (!cls.abstract || cls.bodyOpen < 0) return false;
  if (!ancestorsOf(cls, types).some((name) => RUNNABLE_TYPES.has(name))) return false;
  return SCHEDULER_TYPE.test(cls.file.masked.slice(cls.bodyOpen, cls.bodyClose));
}

function workerRows(files, classes, types) {
  const rows = [];
  const named = new Set();
  // A row named for its class stands for the whole class; one named for a method is that method's own.
  const push = (cls, method, offset, name = cls?.name) => {
    if (!cls) return;
    const key = name === cls.name ? cls.qualifiedName : `${cls.qualifiedName}\0${name}`;
    if (named.has(key)) return;
    named.add(key);
    rows.push(row('worker', { name, symbol: method ? `${cls.name}.${method}` : cls.name }, evidence(cls, offset)));
  };
  for (const file of files) {
    for (const cls of file.classes) {
      // Each consumer is its own ability, named for its method; a class-level one takes the class name,
      // so the class's scheduled work is then named for its method too.
      const classListener = cls.annotations.find((annotation) => MESSAGE_LISTENERS.has(annotation.name));
      if (classListener) push(cls, null, classListener.start);
      for (const member of cls.members) {
        for (const listener of member.annotations.filter((annotation) => MESSAGE_LISTENERS.has(annotation.name))) {
          const method = annotatedMethod(member, listener.start);
          push(cls, method, listener.start, method ? `${cls.name}.${method}` : cls.name);
        }
        const scheduled = member.annotations.find((annotation) => annotation.name === 'Scheduled');
        if (scheduled) {
          const method = annotatedMethod(member, scheduled.start);
          push(cls, method, scheduled.start, classListener && method ? `${cls.name}.${method}` : cls.name);
        }
      }
    }
    for (const match of file.masked.matchAll(SCHEDULE_CALL)) {
      const cls = classAt(file, match.index);
      const member = cls ? memberAt(cls, match.index) : null;
      push(cls, member?.names[0]?.name ?? null, match.index);
    }
  }
  const taskTypes = new Set(classes.filter((cls) => isTaskType(cls, types)).map((cls) => cls.qualifiedName));
  if (taskTypes.size > 0) {
    for (const cls of classes) {
      if (cls.abstract || !ancestorsOf(cls, types).some((name) => taskTypes.has(name))) continue;
      push(cls, null, cls.start);
    }
  }
  return rows;
}

/**
 * The supertype a class's family is named for: its resolved supertype, raised
 * through repository supertypes declared in the same folder, so handlers under
 * a shared folder base join that base's family.
 */
function familyBases(cls, types) {
  const folder = posix.dirname(cls.file.path);
  return supertypes(cls, types).map((name) => {
    let base = name;
    for (let level = 0; level < ANCESTOR_LIMIT; level += 1) {
      const declared = types.get(base);
      if (!declared || posix.dirname(declared.file.path) !== folder) break;
      const above = supertypes(declared, types).filter((parent) => {
        const parentClass = types.get(parent);
        return parentClass && posix.dirname(parentClass.file.path) === folder;
      });
      if (above.length !== 1) break;
      base = above[0];
    }
    return base;
  });
}

function familyRows(classes, types) {
  const groups = new Map();
  for (const cls of classes) {
    if (cls.outer || cls.abstract || cls.keyword === 'enum' || cls.keyword === 'record') continue;
    const folder = posix.dirname(cls.file.path);
    for (const base of new Set(familyBases(cls, types))) {
      if (RUNTIME_TYPE.test(base)) continue;
      const key = `${folder}\0${base}`;
      if (!groups.has(key)) groups.set(key, { folder, base, members: [] });
      groups.get(key).members.push(cls);
    }
  }
  const rows = [];
  for (const { folder, base, members } of groups.values()) {
    if (members.length < FAMILY_SIZE) continue;
    members.sort((a, b) => a.file.path.localeCompare(b.file.path) || a.start - b.start);
    const first = evidence(members[0]);
    rows.push({
      kind: 'family',
      name: base.split('.').pop(),
      path: folder,
      symbol: base,
      evidence: `${first.path}:L${first.line}`,
      members: members.map((cls) => cls.name),
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name));
}

/**
 * Route, executable, worker and family rows for the Java and Kotlin files among
 * `files`, in that order. Each file is masked and read once; types resolve
 * through one map of every class the files declare, so the cost is linear in
 * the bytes read plus the classes times their supertype chains.
 *
 * @param {{ path: string }[]} files product files, repository-relative
 * @param {(path: string) => string} readText
 * @returns {{ kind: string, name: string, path: string, line: number, evidence: string, symbol?: string, members?: string[] }[]}
 */
export function jvmAbilities(files, readText) {
  const read = [];
  for (const { path } of files) {
    if (!JVM_FILE.test(path)) continue;
    const text = readText(path);
    if (text) read.push(readFile(path, text));
  }
  const classes = read.flatMap((file) => file.classes);
  const types = new Map();
  for (const cls of classes) if (!types.has(cls.qualifiedName)) types.set(cls.qualifiedName, cls);
  return [
    ...routeRows(classes, types),
    ...executableRows(read),
    ...workerRows(read, classes, types),
    ...familyRows(classes, types),
  ];
}
