// What a V8 heap snapshot is made of: shallow size by constructor, and the strings by kind.
// Run as `node --max-old-space-size=12000 heap-composition.mjs <file.heapsnapshot> [top]`; prints
// one JSON object. A 50,000-document snapshot is over a gigabyte, so the file is scanned as bytes
// and only the node array is decoded.
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function readAll(file) {
  const fd = openSync(file, 'r');
  const size = fstatSync(fd).size;
  const out = Buffer.allocUnsafe(size);
  let at = 0;
  while (at < size) at += readSync(fd, out, at, Math.min(1 << 30, size - at), at);
  closeSync(fd);
  return out;
}

function find(buf, needle, from = 0) {
  const CHUNK = 1 << 28;
  for (let base = from; base < buf.length; base += CHUNK) {
    const at = buf.subarray(base, Math.min(buf.length, base + CHUNK + needle.length)).indexOf(needle);
    if (at >= 0) return base + at;
  }
  throw new Error(`snapshot has no ${needle}`);
}

function readNumbers(buf, start, count) {
  const out = new Float64Array(count);
  let n = 0;
  let value = 0;
  let inNumber = false;
  for (let at = start; n < count; at += 1) {
    const c = buf[at];
    if (c >= 48 && c <= 57) {
      value = value * 10 + (c - 48);
      inNumber = true;
    } else if (inNumber) {
      out[n++] = value;
      value = 0;
      inNumber = false;
      if (c === 93) break;
    } else if (c === 93) break;
  }
  return out;
}

/** The names a node array refers to, decoded only for the indexes it uses. */
function readStrings(buf, wanted) {
  const start = find(buf, '"strings":[') + 11;
  const out = new Map();
  let index = 0;
  let at = start;
  const end = buf.length;
  while (at < end) {
    while (at < end && buf[at] !== 34 && buf[at] !== 93) at += 1;
    if (at >= end || buf[at] === 93) break;
    let close = at + 1;
    while (buf[close] !== 34) close += buf[close] === 92 ? 2 : 1;
    if (wanted.has(index)) {
      const token = buf.subarray(at, close + 1);
      try {
        out.set(index, token.length > 400 ? JSON.parse(`${token.subarray(0, 200).toString('utf8').replace(/\\?$/, '')}"`) : JSON.parse(token.toString('utf8')));
      } catch {
        out.set(index, '(unparsed)');
      }
    }
    index += 1;
    at = close + 1;
  }
  return out;
}

export function heapComposition(file, top = 15) {
  const buf = readAll(file);
  const nodesAt = find(buf, '"nodes":[');
  const header = JSON.parse(`${buf.subarray(0, nodesAt).toString('utf8').replace(/,\s*$/, '')}}`);
  const meta = header.snapshot.meta;
  const NF = meta.node_fields.length;
  const nodes = readNumbers(buf, nodesAt + 9, header.snapshot.node_count * NF);
  const typeOff = meta.node_fields.indexOf('type');
  const nameOff = meta.node_fields.indexOf('name');
  const selfOff = meta.node_fields.indexOf('self_size');
  const types = meta.node_types[0];
  const named = new Set(['object', 'native', 'closure']);
  const byKey = new Map();
  const wanted = new Set();
  let total = 0;
  for (let i = 0; i < nodes.length; i += NF) {
    const type = types[nodes[i + typeOff]];
    const self = nodes[i + selfOff];
    total += self;
    const key = named.has(type) ? `${type}#${nodes[i + nameOff]}` : `(${type})`;
    const row = byKey.get(key) ?? { count: 0, bytes: 0 };
    row.count += 1;
    row.bytes += self;
    byKey.set(key, row);
  }
  const rows = [...byKey.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, top);
  for (const [key] of rows) if (key.includes('#')) wanted.add(Number(key.split('#')[1]));
  const names = readStrings(buf, wanted);
  const MB = 1048576;
  const label = (key) => {
    if (!key.includes('#')) return key;
    const [type, index] = key.split('#');
    return `${type}: ${String(names.get(Number(index)) ?? '?').slice(0, 70)}`;
  };
  const strings = ['(string)', '(concatenated string)', '(sliced string)']
    .map((key) => ({ kind: key, count: byKey.get(key)?.count ?? 0, mb: +((byKey.get(key)?.bytes ?? 0) / MB).toFixed(1) }));
  return {
    totalMb: +(total / MB).toFixed(1),
    nodes: nodes.length / NF,
    strings,
    top: rows.map(([key, row]) => ({ what: label(key), count: row.count, mb: +(row.bytes / MB).toFixed(1) })),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, top] = process.argv.slice(2);
  console.log(JSON.stringify(heapComposition(file, Number(top ?? 15))));
}
