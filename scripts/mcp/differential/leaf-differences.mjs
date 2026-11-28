// Every place two answer trees differ, not the first. A string that holds a JSON object or array
// (`withJsonTexts` marks them) is compared as that tree, keys in emitted order, and its places are
// written after a `#` as a JSON pointer: `result.content[0].text#/checks/2/status`. A text inside a
// text adds another `#`.
import { serializeOrdered } from './ordered-json.mjs';

/**
 * Where a node sits: `prefix` is the dotted path to the nearest text, `pointer` the JSON pointer
 * inside that text, or null while no text has been entered.
 */
const ROOT = Object.freeze({ prefix: '', pointer: null });

const escapePointer = (name) => name.replaceAll('~', '~0').replaceAll('/', '~1');

function formatLocation({ prefix, pointer }) {
  return pointer === null ? prefix : `${prefix}#${pointer}`;
}

function member(location, name) {
  if (location.pointer !== null) return { prefix: location.prefix, pointer: `${location.pointer}/${escapePointer(name)}` };
  return { prefix: location.prefix ? `${location.prefix}.${name}` : name, pointer: null };
}

function item(location, index) {
  if (location.pointer !== null) return { prefix: location.prefix, pointer: `${location.pointer}/${index}` };
  return { prefix: `${location.prefix}[${index}]`, pointer: null };
}

const insideText = (location) => ({ prefix: formatLocation(location), pointer: '' });

function entryOf(node, name) {
  return node.entries.find(([key]) => key === name)?.[1];
}

/**
 * Every difference between two trees, in the order of the first tree. `kind` is one of `value`,
 * `bytes` (the same JSON in other text), `number-format`, `key-order`, `missing-field`,
 * `extra-field`, `type`, `length`.
 * @returns {{ kind: string, path: string, a: string, b: string }[]}
 */
export function leafDifferences(a, b) {
  const found = [];
  walk(a, b, ROOT, found);
  return found;
}

function walk(a, b, location, found) {
  const report = (kind, a2, b2, at = location) => found.push({ kind, path: formatLocation(at), a: a2, b: b2 });
  if (a.t !== b.t) {
    report('type', serializeOrdered(a), serializeOrdered(b));
    return;
  }
  switch (a.t) {
    case 'null':
      return;
    case 'bool':
      if (a.v !== b.v) report('value', String(a.v), String(b.v));
      return;
    case 'num':
      if (a.text !== b.text) report(Number(a.text) === Number(b.text) ? 'number-format' : 'value', a.text, b.text);
      return;
    case 'str':
      walkText(a, b, location, found);
      return;
    case 'arr': {
      const common = Math.min(a.items.length, b.items.length);
      for (let i = 0; i < common; i += 1) walk(a.items[i], b.items[i], item(location, i), found);
      if (a.items.length !== b.items.length) report('length', `${a.items.length} items`, `${b.items.length} items`);
      return;
    }
    default:
      walkObject(a, b, location, found);
  }
}

function walkText(a, b, location, found) {
  if (a.v === b.v) return;
  if (a.json && b.json) {
    const before = found.length;
    walk(a.json, b.json, insideText(location), found);
    if (found.length === before) found.push({ kind: 'bytes', path: formatLocation(location), a: JSON.stringify(a.v), b: JSON.stringify(b.v) });
    return;
  }
  found.push({ kind: 'value', path: formatLocation(location), a: JSON.stringify(a.v), b: JSON.stringify(b.v) });
}

function walkObject(a, b, location, found) {
  const namesA = a.entries.map(([name]) => name);
  const namesB = b.entries.map(([name]) => name);
  for (const name of namesA) {
    if (!namesB.includes(name)) found.push({ kind: 'missing-field', path: formatLocation(member(location, name)), a: 'present', b: 'absent' });
  }
  for (const name of namesB) {
    if (!namesA.includes(name)) found.push({ kind: 'extra-field', path: formatLocation(member(location, name)), a: 'absent', b: 'present' });
  }
  const sharedA = namesA.filter((name) => namesB.includes(name));
  const sharedB = namesB.filter((name) => namesA.includes(name));
  if (sharedA.join('\0') !== sharedB.join('\0')) {
    found.push({ kind: 'key-order', path: formatLocation(location), a: sharedA.join(','), b: sharedB.join(',') });
  }
  for (const name of sharedA) walk(entryOf(a, name), entryOf(b, name), member(location, name), found);
}
