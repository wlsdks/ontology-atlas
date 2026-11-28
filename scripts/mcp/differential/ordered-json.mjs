// A JSON reader that keeps what `JSON.parse` loses: object keys in emitted order (JavaScript lists
// integer-like keys first) and each number as the exact text the server wrote. The harness compares
// these trees, so a reordered key or `1e21` against `1000000000000000000000` is a difference.

/** @typedef {{ t: 'null' } | { t: 'bool', v: boolean } | { t: 'num', text: string } | { t: 'str', v: string, json?: Node } | { t: 'arr', items: Node[] } | { t: 'obj', entries: [string, Node][] }} Node */

export function parseOrdered(text) {
  let index = 0;
  const fail = (message) => {
    throw new SyntaxError(`${message} at ${index}`);
  };
  const skip = () => {
    while (index < text.length && ' \t\n\r'.includes(text[index])) index += 1;
  };
  const string = () => {
    const start = index;
    index += 1;
    while (index < text.length && text[index] !== '"') {
      if (text[index] === '\\') index += 1;
      index += 1;
    }
    if (text[index] !== '"') fail('unterminated string');
    index += 1;
    return JSON.parse(text.slice(start, index));
  };
  const value = () => {
    skip();
    const c = text[index];
    if (c === '{') {
      index += 1;
      const entries = [];
      skip();
      if (text[index] === '}') {
        index += 1;
        return { t: 'obj', entries };
      }
      for (;;) {
        skip();
        if (text[index] !== '"') fail('expected a key');
        const key = string();
        skip();
        if (text[index] !== ':') fail('expected a colon');
        index += 1;
        entries.push([key, value()]);
        skip();
        if (text[index] === ',') {
          index += 1;
          continue;
        }
        if (text[index] === '}') {
          index += 1;
          return { t: 'obj', entries };
        }
        fail('expected , or }');
      }
    }
    if (c === '[') {
      index += 1;
      const items = [];
      skip();
      if (text[index] === ']') {
        index += 1;
        return { t: 'arr', items };
      }
      for (;;) {
        items.push(value());
        skip();
        if (text[index] === ',') {
          index += 1;
          continue;
        }
        if (text[index] === ']') {
          index += 1;
          return { t: 'arr', items };
        }
        fail('expected , or ]');
      }
    }
    if (c === '"') return { t: 'str', v: string() };
    if (text.startsWith('true', index)) {
      index += 4;
      return { t: 'bool', v: true };
    }
    if (text.startsWith('false', index)) {
      index += 5;
      return { t: 'bool', v: false };
    }
    if (text.startsWith('null', index)) {
      index += 4;
      return { t: 'null' };
    }
    const match = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index, index + 64));
    if (!match) fail('unexpected character');
    index += match[0].length;
    return { t: 'num', text: match[0] };
  };
  const root = value();
  skip();
  if (index !== text.length) fail('trailing characters');
  return root;
}

export function serializeOrdered(node) {
  switch (node.t) {
    case 'null':
      return 'null';
    case 'bool':
      return node.v ? 'true' : 'false';
    case 'num':
      return node.text;
    case 'str':
      return JSON.stringify(node.v);
    case 'arr':
      return `[${node.items.map(serializeOrdered).join(',')}]`;
    default:
      return `{${node.entries.map(([k, v]) => `${JSON.stringify(k)}:${serializeOrdered(v)}`).join(',')}}`;
  }
}

function getEntry(node, key) {
  if (node?.t !== 'obj') return undefined;
  return node.entries.find(([name]) => name === key)?.[1];
}

/** The node at a path such as `a.b[2].c`, or undefined. */
export function nodeAtPath(node, pathText) {
  let current = node;
  for (const segment of pathText.match(/[^.[\]]+|\[\d+\]/g) ?? []) {
    if (current === undefined) return undefined;
    if (segment.startsWith('[')) current = current.t === 'arr' ? current.items[Number(segment.slice(1, -1))] : undefined;
    else current = getEntry(current, segment);
  }
  return current;
}

/**
 * The same tree with, on every string that holds a JSON object or array (`result.content[0].text`
 * is one), the tree of that text under `json`. A string that only starts with a bracket stays plain.
 */
export function withJsonTexts(node) {
  switch (node.t) {
    case 'arr':
      return { t: 'arr', items: node.items.map(withJsonTexts) };
    case 'obj':
      return { t: 'obj', entries: node.entries.map(([key, value]) => [key, withJsonTexts(value)]) };
    case 'str': {
      const json = parseJsonText(node.v);
      return json ? { t: 'str', v: node.v, json: withJsonTexts(json) } : node;
    }
    default:
      return node;
  }
}

function parseJsonText(text) {
  const first = text.trimStart()[0];
  if (first !== '{' && first !== '[') return null;
  try {
    return parseOrdered(text);
  } catch {
    return null;
  }
}
