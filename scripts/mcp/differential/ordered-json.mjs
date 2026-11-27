// A JSON reader that keeps what `JSON.parse` loses: object keys in emitted order (JavaScript lists
// integer-like keys first) and each number as the exact text the server wrote. The harness compares
// these trees, so a reordered key or `1e21` against `1000000000000000000000` is a difference.

/** @typedef {{ t: 'null' } | { t: 'bool', v: boolean } | { t: 'num', text: string } | { t: 'str', v: string } | { t: 'arr', items: Node[] } | { t: 'obj', entries: [string, Node][] }} Node */

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

function serializeOrdered(node) {
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
 * First difference between two trees, or null. `kind` is one of `value`, `number-format`,
 * `key-order`, `missing-field`, `extra-field`, `type`, `length`.
 */
export function firstTreeDifference(a, b, pathText = '') {
  if (a.t !== b.t) return { kind: 'type', path: pathText, a: serializeOrdered(a), b: serializeOrdered(b) };
  switch (a.t) {
    case 'null':
      return null;
    case 'bool':
      return a.v === b.v ? null : { kind: 'value', path: pathText, a: String(a.v), b: String(b.v) };
    case 'str':
      return a.v === b.v ? null : { kind: 'value', path: pathText, a: JSON.stringify(a.v), b: JSON.stringify(b.v) };
    case 'num':
      if (a.text === b.text) return null;
      return {
        kind: Number(a.text) === Number(b.text) ? 'number-format' : 'value',
        path: pathText,
        a: a.text,
        b: b.text,
      };
    case 'arr': {
      const common = Math.min(a.items.length, b.items.length);
      for (let i = 0; i < common; i += 1) {
        const found = firstTreeDifference(a.items[i], b.items[i], `${pathText}[${i}]`);
        if (found) return found;
      }
      if (a.items.length !== b.items.length) {
        return {
          kind: 'length',
          path: pathText,
          a: `${a.items.length} items`,
          b: `${b.items.length} items`,
        };
      }
      return null;
    }
    default: {
      const namesA = a.entries.map(([k]) => k);
      const namesB = b.entries.map(([k]) => k);
      for (const name of namesA) {
        if (!namesB.includes(name)) {
          return { kind: 'missing-field', path: join(pathText, name), a: 'present', b: 'absent' };
        }
      }
      for (const name of namesB) {
        if (!namesA.includes(name)) {
          return { kind: 'extra-field', path: join(pathText, name), a: 'absent', b: 'present' };
        }
      }
      if (namesA.join('\0') !== namesB.join('\0')) {
        return {
          kind: 'key-order',
          path: pathText,
          a: namesA.join(','),
          b: namesB.join(','),
        };
      }
      for (const [name, child] of a.entries) {
        const other = getEntry(b, name);
        const found = firstTreeDifference(child, other, join(pathText, name));
        if (found) return found;
      }
      return null;
    }
  }
}

function join(base, name) {
  return base ? `${base}.${name}` : name;
}
