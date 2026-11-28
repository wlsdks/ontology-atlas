import { GRAPH_FRONTMATTER_KEYS } from './concept-evidence-pack';
import type { VaultReadDoc } from './vault-read-port';

/**
 * The predicate behind `list_concepts({ filter })`, the same grammar the MCP server reads:
 * `key=value`, `key!=value` and `has(key)` joined with AND, OR, NOT and parentheses.
 * AND binds tighter than OR; keywords are case-insensitive; a value with spaces is quoted.
 */

const EQUALITY_KEYS = ['kind', 'domain', 'slug', 'title', 'created_by'] as const;
const RELATION_KEY_ALIASES: Readonly<Record<string, string>> = { depends_on: 'dependencies' };

type Token = { type: 'word' | 'quoted' | 'symbol'; text: string };

export interface ConceptFilter {
  match(doc: VaultReadDoc): boolean;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (/\s/.test(ch)) {
      index += 1;
    } else if (ch === '(' || ch === ')' || ch === '=') {
      tokens.push({ type: 'symbol', text: ch });
      index += 1;
    } else if (ch === '!' && source[index + 1] === '=') {
      tokens.push({ type: 'symbol', text: '!=' });
      index += 2;
    } else if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, index + 1);
      if (end < 0) throw new Error(`filter has an unclosed quote at position ${index + 1}.`);
      tokens.push({ type: 'quoted', text: source.slice(index + 1, end) });
      index = end + 1;
    } else {
      let end = index;
      while (end < source.length && !/[\s()=]/.test(source[end]) && !(source[end] === '!' && source[end + 1] === '=')) end += 1;
      tokens.push({ type: 'word', text: source.slice(index, end) });
      index = end;
    }
  }
  return tokens;
}

function valueOfKey(doc: VaultReadDoc, key: string): string {
  if (key === 'kind') return doc.kind;
  if (key === 'domain') return doc.domain ?? '';
  if (key === 'slug') return doc.slug;
  if (key === 'title') return doc.title;
  const raw = doc.frontmatter[key];
  return typeof raw === 'string' ? raw : '';
}

function hasRelationKey(doc: VaultReadDoc, key: string): boolean {
  const canonical = RELATION_KEY_ALIASES[key] ?? key;
  return [canonical, ...Object.keys(RELATION_KEY_ALIASES).filter((alias) => RELATION_KEY_ALIASES[alias] === canonical)].some((name) => {
    const value = doc.frontmatter[name];
    return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '';
  });
}

export function parseConceptFilter(source: string): ConceptFilter {
  const tokens = tokenize(source);
  let position = 0;
  const isWord = (text: string) => tokens[position]?.type === 'word' && tokens[position].text.toUpperCase() === text;
  const isSymbol = (text: string) => tokens[position]?.type === 'symbol' && tokens[position].text === text;

  function parseOr(): (doc: VaultReadDoc) => boolean {
    let left = parseAnd();
    while (isWord('OR')) {
      position += 1;
      const previous = left;
      const right = parseAnd();
      left = (doc) => previous(doc) || right(doc);
    }
    return left;
  }

  function parseAnd(): (doc: VaultReadDoc) => boolean {
    let left = parseNot();
    while (isWord('AND')) {
      position += 1;
      const previous = left;
      const right = parseNot();
      left = (doc) => previous(doc) && right(doc);
    }
    return left;
  }

  function parseNot(): (doc: VaultReadDoc) => boolean {
    if (isWord('NOT')) {
      position += 1;
      const inner = parseNot();
      return (doc) => !inner(doc);
    }
    return parseAtom();
  }

  function parseAtom(): (doc: VaultReadDoc) => boolean {
    if (isSymbol('(')) {
      position += 1;
      const inner = parseOr();
      if (!isSymbol(')')) throw new Error('filter is missing a closing parenthesis.');
      position += 1;
      return inner;
    }
    const head = tokens[position];
    if (!head || head.type !== 'word') throw new Error(`filter expects a key or has(key) at token ${position + 1}.`);
    position += 1;
    if (head.text.toLowerCase() === 'has' && isSymbol('(')) {
      position += 1;
      const keyToken = tokens[position];
      if (!keyToken || keyToken.type !== 'word') throw new Error('has() needs a relation key.');
      position += 1;
      if (!isSymbol(')')) throw new Error('has( is missing its closing parenthesis.');
      position += 1;
      const key = RELATION_KEY_ALIASES[keyToken.text] ?? keyToken.text;
      if (!(GRAPH_FRONTMATTER_KEYS as readonly string[]).includes(key)) {
        throw new Error(`has key must be one of: ${GRAPH_FRONTMATTER_KEYS.join(', ')}; Received: "${keyToken.text}".`);
      }
      return (doc) => hasRelationKey(doc, key);
    }
    const key = head.text;
    if (!(EQUALITY_KEYS as readonly string[]).includes(key)) {
      throw new Error(`key must be one of: ${EQUALITY_KEYS.join(', ')}; Received: "${key}".`);
    }
    const operator = tokens[position];
    if (!operator || operator.type !== 'symbol' || (operator.text !== '=' && operator.text !== '!=')) {
      throw new Error(`filter expects = or != after ${key}.`);
    }
    position += 1;
    const value = tokens[position];
    if (!value || value.type === 'symbol') throw new Error(`filter expects a value after ${key}${operator.text}.`);
    position += 1;
    const wanted = value.text.toLowerCase();
    const negate = operator.text === '!=';
    return (doc) => (valueOfKey(doc, key).toLowerCase() === wanted) !== negate;
  }

  if (tokens.length === 0) throw new Error('filter must not be empty.');
  const predicate = parseOr();
  if (position < tokens.length) throw new Error(`filter has unexpected "${tokens[position].text}" at token ${position + 1}.`);
  return { match: predicate };
}
