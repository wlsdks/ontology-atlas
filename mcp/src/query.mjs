/**
 * Tiny filter DSL for `query_concepts` MCP tool.
 *
 * Goal: let AI agents (and humans) ask non-trivial vault questions
 * without learning Cypher / SPARQL. Tradeoffs: just enough for the
 * common "which X have/lack Y" cases — no path queries (use find_path),
 * no aggregations (use list_kinds / find_orphans).
 *
 * Grammar (case-insensitive keywords, whitespace-tolerant):
 *
 *   filter   := orExpr
 *   orExpr   := andExpr ( 'OR' andExpr )*
 *   andExpr  := atom ( 'AND' atom )*
 *   atom     := 'NOT'? primary
 *   primary  := '(' filter ')'
 *             | predicate
 *   predicate := key '=' value          // exact match: kind=capability
 *              | key '!=' value         // not equal
 *              | 'has' '(' key ')'      // array key non-empty
 *
 * Supported keys: `kind`, `domain`, `slug`, `title` (string equality),
 * and any frontmatter array key for `has(...)` (e.g. `has(elements)`,
 * `has(capabilities)`, `has(depends_on)`).
 *
 * Operator precedence (highest → lowest): NOT > AND > OR. Use parens
 * to override: `(kind=domain OR kind=capability) AND has(elements)`.
 *
 * Examples:
 *   kind=capability AND domain=auth AND NOT has(elements)
 *   kind=domain AND has(capabilities)
 *   slug!=README AND has(depends_on)
 *   (kind=domain OR kind=capability) AND has(elements)
 *
 * Returns: { match: (doc) => boolean, repr: string } — repr 은 디버그용.
 */

import { NODE_KIND_VALUES } from './ontology-engine.mjs';
import { formatAllowedValueError } from './suggestions.mjs';
import { GRAPH_ARRAY_KEYS } from './vault.mjs';

const KEY_RE = /^[a-z_][a-z0-9_]*$/i;
const EQUALITY_KEYS = Object.freeze(['kind', 'domain', 'slug', 'title']);
const HAS_KEY_ALIASES = Object.freeze({
  depends_on: 'dependencies',
});
const HAS_KEYS = Object.freeze([...GRAPH_ARRAY_KEYS]);

export function parseFilter(input) {
  if (typeof input !== 'string') {
    throw new Error(`filter must be a string, got ${typeof input}`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('filter is empty');
  }
  const tokens = tokenize(trimmed);
  const ast = parseExpr(tokens, 0);
  if (ast.next < tokens.length) {
    throw new Error(`unexpected token at position ${ast.next}: ${tokens[ast.next]?.value}`);
  }
  return {
    match: (doc) => evaluate(ast.node, doc),
    repr: formatAst(ast.node),
  };
}

// ── tokenizer ─────────────────────────────────────────────────────────────

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' });
      i += 1;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'op', value: '=' });
      i += 1;
      continue;
    }
    if (ch === '!' && input[i + 1] === '=') {
      tokens.push({ type: 'op', value: '!=' });
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // quoted string value — lets users include whitespace.
      const quote = ch;
      let j = i + 1;
      let buf = '';
      while (j < input.length && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < input.length) {
          buf += input[j + 1];
          j += 2;
        } else {
          buf += input[j];
          j += 1;
        }
      }
      if (j >= input.length) throw new Error(`unterminated string at position ${i}`);
      tokens.push({ type: 'value', value: buf });
      i = j + 1;
      continue;
    }
    // word — keyword or identifier or unquoted value
    let j = i;
    while (j < input.length && /[a-z0-9_/.\-가-힣]/i.test(input[j])) {
      j += 1;
    }
    if (j === i) {
      throw new Error(`unexpected character ${JSON.stringify(ch)} at position ${i}`);
    }
    const word = input.slice(i, j);
    const upper = word.toUpperCase();
    if (upper === 'AND' || upper === 'OR' || upper === 'NOT') {
      tokens.push({ type: 'logical', value: upper });
    } else if (upper === 'HAS') {
      tokens.push({ type: 'fn', value: 'has' });
    } else {
      tokens.push({ type: 'word', value: word });
    }
    i = j;
  }
  return tokens;
}

// ── parser ────────────────────────────────────────────────────────────────
//
// precedence 분리: parseExpr → parseOr → parseAnd → parseAtom → parsePrimary.
// 이전 단일-함수 구현은 AND / OR 를 동급 left-associative 로 처리해 문서가
// 광고하던 `NOT > AND > OR` 와 mismatch 였음.

function parseExpr(tokens, pos) {
  return parseOr(tokens, pos);
}

function parseOr(tokens, pos) {
  let { node: left, next } = parseAnd(tokens, pos);
  while (next < tokens.length) {
    const t = tokens[next];
    if (t.type !== 'logical' || t.value !== 'OR') break;
    const { node: right, next: after } = parseAnd(tokens, next + 1);
    left = { type: 'logical', op: 'OR', left, right };
    next = after;
  }
  return { node: left, next };
}

function parseAnd(tokens, pos) {
  let { node: left, next } = parseAtom(tokens, pos);
  while (next < tokens.length) {
    const t = tokens[next];
    if (t.type !== 'logical' || t.value !== 'AND') break;
    const { node: right, next: after } = parseAtom(tokens, next + 1);
    left = { type: 'logical', op: 'AND', left, right };
    next = after;
  }
  return { node: left, next };
}

function parseAtom(tokens, pos) {
  const t = tokens[pos];
  if (!t) throw new Error('unexpected end of filter');
  if (t.type === 'logical' && t.value === 'NOT') {
    const { node, next } = parseAtom(tokens, pos + 1);
    return { node: { type: 'not', child: node }, next };
  }
  return parsePrimary(tokens, pos);
}

function parsePrimary(tokens, pos) {
  const t = tokens[pos];
  if (!t) throw new Error('unexpected end of filter');
  // parenthesized sub-expression — operator precedence override.
  if (t.type === 'paren' && t.value === '(') {
    const { node, next } = parseExpr(tokens, pos + 1);
    const closing = tokens[next];
    if (!closing || closing.type !== 'paren' || closing.value !== ')') {
      throw new Error('expected `)` to close group');
    }
    return { node, next: next + 1 };
  }
  if (t.type === 'fn' && t.value === 'has') {
    // has ( key )
    if (tokens[pos + 1]?.value !== '(') throw new Error('expected `(` after has');
    const keyTok = tokens[pos + 2];
    if (!keyTok || keyTok.type !== 'word') throw new Error('expected key inside has(...)');
    if (tokens[pos + 3]?.value !== ')') throw new Error('expected `)` to close has(...)');
    if (!KEY_RE.test(keyTok.value)) throw new Error(`invalid key: ${keyTok.value}`);
    const key = normalizeHasKey(keyTok.value);
    return { node: { type: 'has', key }, next: pos + 4 };
  }
  if (t.type === 'word') {
    // key = value or key != value
    if (!KEY_RE.test(t.value)) throw new Error(`invalid key: ${t.value}`);
    validateEqualityKey(t.value);
    const opTok = tokens[pos + 1];
    if (!opTok || opTok.type !== 'op') {
      throw new Error(`expected = or != after key ${t.value}`);
    }
    const valTok = tokens[pos + 2];
    if (!valTok || (valTok.type !== 'word' && valTok.type !== 'value')) {
      throw new Error(`expected value after ${t.value} ${opTok.value}`);
    }
    if (t.value === 'kind') validateKindValue(valTok.value);
    return {
      node: { type: 'cmp', op: opTok.value, key: t.value, value: valTok.value },
      next: pos + 3,
    };
  }
  throw new Error(`unexpected token: ${t.value}`);
}

function validateEqualityKey(key) {
  if (!EQUALITY_KEYS.includes(key)) {
    throw new Error(formatAllowedValueError('key', key, EQUALITY_KEYS));
  }
}

function normalizeHasKey(key) {
  const canonical = HAS_KEY_ALIASES[key] || key;
  if (!HAS_KEYS.includes(key) && !HAS_KEYS.includes(canonical)) {
    throw new Error(formatAllowedValueError('has key', key, HAS_KEYS));
  }
  return canonical;
}

function validateKindValue(value) {
  const normalized = String(value).toLowerCase();
  if (!NODE_KIND_VALUES.includes(normalized)) {
    throw new Error(formatAllowedValueError('kind', value, NODE_KIND_VALUES));
  }
}

// ── evaluator ─────────────────────────────────────────────────────────────

function evaluate(node, doc) {
  switch (node.type) {
    case 'logical':
      if (node.op === 'AND') return evaluate(node.left, doc) && evaluate(node.right, doc);
      return evaluate(node.left, doc) || evaluate(node.right, doc);
    case 'not':
      return !evaluate(node.child, doc);
    case 'cmp': {
      const actual = readField(doc, node.key);
      const target = node.value;
      // Panel E T1-2 (2026-05-02): 대소문자 무시 비교. 사용자 / LLM 둘 다
      // `kind=Capability` 같은 표기를 자주 쓰는데 frontmatter 는 `kind: capability`
      // 라 silent 0-match 됐던 foot-gun 제거.
      const matches =
        String(actual ?? '').toLowerCase() === target.toLowerCase();
      return node.op === '=' ? matches : !matches;
    }
    case 'has': {
      const v = readField(doc, node.key);
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'string') return v.trim().length > 0;
      return v != null;
    }
    default:
      throw new Error(`unknown node type: ${node.type}`);
  }
}

function readField(doc, key) {
  // doc is { slug, frontmatter }. Special-case `slug` field.
  if (key === 'slug') return doc.slug;
  if (key === 'dependencies') {
    return doc.frontmatter?.dependencies ?? doc.frontmatter?.depends_on;
  }
  return doc.frontmatter?.[key];
}

function formatAst(node) {
  switch (node.type) {
    case 'logical':
      return `(${formatAst(node.left)} ${node.op} ${formatAst(node.right)})`;
    case 'not':
      return `NOT ${formatAst(node.child)}`;
    case 'cmp':
      return `${node.key} ${node.op} ${node.value}`;
    case 'has':
      return `has(${node.key})`;
    default:
      return '?';
  }
}
