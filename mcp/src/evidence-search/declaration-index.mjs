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
const FILES = new Map();

/** One product file's text and declarations, kept by size and mtime. */
function factsOf(file) {
  const key = `${file.abs}\0${file.size}\0${file.mtimeMs}`;
  const cached = FILES.get(key);
  if (cached) return cached;
  let facts = { text: '', declarations: [] };
  if (file.size <= MAX_INDEXED_BYTES) {
    try {
      const text = readFileSync(file.abs, 'utf8');
      facts = {
        text,
        declarations: outlineSource(text, file.path).declarations
          .filter((declaration) => declaration.kind !== 'section' && declaration.kind !== 'export')
          .map(({ name, line, kind }) => ({ name, line, kind })),
      };
    } catch {
      facts = { text: '', declarations: [] };
    }
  }
  if (FILES.size > 20000) FILES.clear();
  FILES.set(key, facts);
  return facts;
}

function productFiles(rootPath, ignore) {
  try {
    return collectSourceUnits(rootPath, { ignore }).files.filter((file) => file.class === 'product');
  } catch {
    return [];
  }
}

/**
 * name -> [{ path, line, kind }] over every product source file under `rootPath`; a
 * `Receiver.method` declaration is also listed under `*.method`.
 *
 * @param {string} rootPath absolute repository root
 * @param {{ ignore?: string[] }} [options]
 */
export function declarationIndex(rootPath, { ignore = [] } = {}) {
  const index = new Map();
  for (const file of productFiles(rootPath, ignore)) {
    for (const { name, line, kind } of factsOf(file).declarations) {
      // A Go method `Node.Subscribe` is also found by the bare name its callers write.
      const keys = name.includes('.') ? [name, `*.${name.split('.').pop()}`] : [name];
      for (const key of keys) {
        const rows = index.get(key);
        if (rows) rows.push({ path: file.path, line, kind });
        else index.set(key, [{ path: file.path, line, kind }]);
      }
    }
  }
  return index;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Where product code calls `name(`: each call line outside a declaration line, at
 * most `limit` (the rest only counted), so a symbol read can show the guard its
 * caller puts around it.
 *
 * @returns {{ sites: { path: string, line: number }[], total: number }}
 */
export function callSitesOf(rootPath, name, { ignore = [], limit = 8 } = {}) {
  const pattern = new RegExp(`(?:^|[^\\w$])${escapeRegExp(name)}\\s*\\(`, 'u');
  const sites = [];
  let total = 0;
  for (const file of productFiles(rootPath, ignore)) {
    const { text, declarations } = factsOf(file);
    if (!text.includes(name)) continue;
    const declared = new Set(declarations.map((declaration) => declaration.line));
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (declared.has(index + 1) || !pattern.test(lines[index])) continue;
      if (/^\s*(?:\/\/|#|\*|\/\*)/.test(lines[index])) continue;
      total += 1;
      if (sites.length < limit) sites.push({ path: file.path, line: index + 1 });
    }
  }
  return { sites, total };
}
