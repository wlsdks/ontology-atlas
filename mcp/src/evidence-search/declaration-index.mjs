/**
 * Where each declared name lives across a repository's product files, so a symbol
 * read can say which file a callee is in and the next read can follow it by name.
 * Built lazily on the first symbol read that needs it, from the same walk the
 * breadth map uses (no symlinks, no hidden or credential files), and kept per file
 * by size and mtime so a later call outlines only what changed.
 */

import { readFileSync } from 'node:fs';

import { collectSourceUnits } from '../analyze/source-units.mjs';
import { outlineSource } from './source-outline.mjs';

const MAX_INDEXED_BYTES = 256 * 1024;
const OUTLINES = new Map();

function declarationsOf(file) {
  const key = `${file.abs}\0${file.size}\0${file.mtimeMs}`;
  const cached = OUTLINES.get(key);
  if (cached) return cached;
  let declarations = [];
  if (file.size <= MAX_INDEXED_BYTES) {
    try {
      declarations = outlineSource(readFileSync(file.abs, 'utf8'), file.path).declarations
        .filter((declaration) => declaration.kind !== 'section' && declaration.kind !== 'export')
        .map(({ name, line }) => ({ name, line }));
    } catch {
      declarations = [];
    }
  }
  if (OUTLINES.size > 20000) OUTLINES.clear();
  OUTLINES.set(key, declarations);
  return declarations;
}

/**
 * name -> [{ path, line }] over every product source file under `rootPath`; a
 * `Receiver.method` declaration is also listed under `*.method`.
 *
 * @param {string} rootPath absolute repository root
 * @param {{ ignore?: string[] }} [options]
 */
export function declarationIndex(rootPath, { ignore = [] } = {}) {
  const index = new Map();
  let collection;
  try {
    collection = collectSourceUnits(rootPath, { ignore });
  } catch {
    return index;
  }
  for (const file of collection.files) {
    if (file.class !== 'product') continue;
    for (const { name, line } of declarationsOf(file)) {
      // A Go method `Node.Subscribe` is also found by the bare name its callers write.
      const keys = name.includes('.') ? [name, `*.${name.split('.').pop()}`] : [name];
      for (const key of keys) {
        const rows = index.get(key);
        if (rows) rows.push({ path: file.path, line });
        else index.set(key, [{ path: file.path, line }]);
      }
    }
  }
  return index;
}
