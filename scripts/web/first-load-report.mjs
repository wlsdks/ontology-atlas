#!/usr/bin/env node
/**
 * Reports what a route's HTML makes the browser download before the page runs: the sum of the
 * JavaScript chunks it names, and every chunk module that is a large `JSON.parse("...")` literal
 * (generated vault data bundled as JSON). Usage:
 *   node scripts/web/first-load-report.mjs [--json-limit-kb=50] [--allow-json=<route>] <dir> <route>...
 * `<dir>` is the static export (`out`); a route is a path under it, e.g. `en`, `en/topology`. 1 KB = 1,024 bytes. Exits 1 when
 * a route that is not named by `--allow-json` loads a JSON literal over the limit, so a vault
 * manifest creeping back into a shared chunk fails a script instead of waiting for a review.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

const KB = 1024;

/** `/_next/...js` paths the HTML makes the browser fetch up front, in document order, no duplicates. */
export function firstLoadChunkPaths(html) {
  const paths = [];
  const seen = new Set();
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
    if (/\bnomodule\b/i.test(tag)) continue;
    const isScript = tag.startsWith('<script');
    if (!isScript && !/\bas=["']script["']/.test(tag)) continue;
    const ref = /\b(?:src|href)=["']([^"']+\.js)(?:\?[^"']*)?["']/.exec(tag)?.[1];
    if (!ref) continue;
    const path = ref.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

/** Length of the JS string literal opening at `start` (the quote), or -1 when it never closes. */
function literalLength(code, start) {
  const quote = code[start];
  for (let i = start + 1; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '\\') i += 1;
    else if (ch === quote) return i - start + 1;
  }
  return -1;
}

/** The `JSON.parse("...")` literals in a chunk that are at least `minBytes` long. */
export function findJsonParseModules(code, minBytes) {
  const found = [];
  const opener = /JSON\.parse\(\s*(["'`])/g;
  for (let match = opener.exec(code); match; match = opener.exec(code)) {
    const quoteAt = match.index + match[0].length - 1;
    const length = literalLength(code, quoteAt);
    if (length < 0) continue;
    opener.lastIndex = quoteAt + length;
    if (length >= minBytes) found.push({ bytes: length, head: code.slice(quoteAt + 1, quoteAt + 41) });
  }
  return found;
}

export function reportRoute(outDir, route, { jsonLimitBytes }) {
  const htmlPath = join(outDir, route, 'index.html');
  if (!existsSync(htmlPath)) throw new Error(`no exported page at ${htmlPath}`);
  const chunks = [];
  for (const path of firstLoadChunkPaths(readFileSync(htmlPath, 'utf8'))) {
    const file = join(outDir, path);
    if (!existsSync(file)) continue;
    const buffer = readFileSync(file);
    const jsonModules = findJsonParseModules(buffer.toString('utf8'), jsonLimitBytes);
    chunks.push({ path, bytes: buffer.length, brotli: brotliCompressSync(buffer).length, jsonModules });
  }
  return {
    route,
    chunks,
    rawBytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
    brotliBytes: chunks.reduce((sum, c) => sum + c.brotli, 0),
    jsonModules: chunks.flatMap((c) => c.jsonModules.map((m) => ({ ...m, chunk: c.path }))),
  };
}

const kb = (bytes) => `${(bytes / KB).toFixed(0)} KB`;

export function formatReport(report) {
  const lines = [
    `${report.route}: ${kb(report.rawBytes)} raw, ${kb(report.brotliBytes)} brotli, ${report.chunks.length} chunks`,
  ];
  for (const m of report.jsonModules) lines.push(`  JSON.parse ${kb(m.bytes)} in ${m.chunk} ("${m.head}...")`);
  return lines.join('\n');
}

export function main(argv, { log = console.log } = {}) {
  let jsonLimitKb = 50;
  const allowJson = new Set();
  const positional = [];
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--json-limit-kb=')) jsonLimitKb = Number(arg.slice(16));
    else if (arg.startsWith('--allow-json=')) allowJson.add(arg.slice(13).replace(/^\/|\/$/g, ''));
    else positional.push(arg);
  }
  const [outDir, ...rawRoutes] = positional;
  const routes = rawRoutes.map((route) => route.replace(/^\/|\/$/g, ''));
  if (!outDir || routes.length === 0) throw new Error('usage: <dir> <route>..., e.g. out en en/topology');
  let failed = false;
  for (const route of routes) {
    const report = reportRoute(outDir, route, { jsonLimitBytes: jsonLimitKb * KB });
    log(formatReport(report));
    if (report.jsonModules.length > 0 && !allowJson.has(route)) failed = true;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
