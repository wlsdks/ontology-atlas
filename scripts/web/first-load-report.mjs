#!/usr/bin/env node
/**
 * Reports what the browser downloads before a screen runs: the sum of the JavaScript chunks, and every
 * chunk module that is a large `JSON.parse("...")` literal (generated vault data bundled as JSON). Usage:
 *   node scripts/web/first-load-report.mjs [--json-limit-kb=50] [--allow-json=<route>] [--max-brotli-kb=<n>] <dir> <route>...
 *   node scripts/web/first-load-report.mjs [...] --app-route=<route module source> [--manifest=<file>] <app folder>
 * A website page is a path under the site folder, e.g. `en`, `en/download`: the chunks its HTML names. The app has one
 * document for every address, so its screen is a route module (`src/app/routes/$locale/_app/topology`): the
 * chunks the document names plus the ones that module loads, read from the build's manifest
 * (`vite build --manifest`, by default `<app folder>/.vite/manifest.json`). 1 KB = 1,024 bytes. Exits 1 when a screen that is not named by `--allow-json` loads a
 * JSON literal over the limit, so a vault manifest creeping back into a shared chunk fails a script instead of waiting
 * for a review, and when a screen's brotli size is over `--max-brotli-kb`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

import { entryKeys, routeKeys, scriptFilesFrom } from '../lib/web/vite-manifest.mjs';

const KB = 1024;

/** The script paths the HTML makes the browser fetch up front (scripts, preloads, module preloads), in document order, no duplicates. */
export function firstLoadChunkPaths(html) {
  const paths = [];
  const seen = new Set();
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
    if (/\bnomodule\b/i.test(tag)) continue;
    const isScript = tag.startsWith('<script');
    if (!isScript && !/\bas=["']script["']/.test(tag) && !/\brel=["']modulepreload["']/.test(tag)) continue;
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

/** A chunk is shared by many routes, so it is read, compressed and scanned once per run. */
const chunkCache = new Map();

function analyzeChunk(file, jsonLimitBytes) {
  const key = `${file}:${jsonLimitBytes}`;
  let found = chunkCache.get(key);
  if (!found) {
    const buffer = readFileSync(file);
    found = {
      bytes: buffer.length,
      brotli: brotliCompressSync(buffer).length,
      jsonModules: findJsonParseModules(buffer.toString('utf8'), jsonLimitBytes),
    };
    chunkCache.set(key, found);
  }
  return found;
}

function reportChunks(dir, label, htmlPath, named, { jsonLimitBytes }) {
  const chunks = [];
  // A report that reads nothing would pass for a page with nothing to load, so it refuses instead.
  if (named.length === 0) throw new Error(`${htmlPath} names no script chunks`);
  for (const path of named) {
    const file = join(dir, path);
    if (!existsSync(file)) throw new Error(`${htmlPath} names ${path}, which is not under ${dir}`);
    chunks.push({ path, ...analyzeChunk(file, jsonLimitBytes) });
  }
  return {
    route: label,
    chunks,
    rawBytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
    brotliBytes: chunks.reduce((sum, c) => sum + c.brotli, 0),
    jsonModules: chunks.flatMap((c) => c.jsonModules.map((m) => ({ ...m, chunk: c.path }))),
  };
}

export function reportRoute(outDir, route, { jsonLimitBytes }) {
  const htmlPath = join(outDir, route, 'index.html');
  if (!existsSync(htmlPath)) throw new Error(`no exported page at ${htmlPath}`);
  return reportChunks(outDir, route, htmlPath, firstLoadChunkPaths(readFileSync(htmlPath, 'utf8')), { jsonLimitBytes });
}

export function reportAppRoute(appFolder, manifestPath, routeSource, { jsonLimitBytes }) {
  if (!existsSync(manifestPath)) throw new Error(`no build manifest at ${manifestPath}; build the app with \`vite build --manifest\``);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // What loads first: the document's entry and the route module's chunks, each with what they import statically.
  // A chunk the screen loads later (`dynamicImports`) is not first load.
  const named = scriptFilesFrom(manifest, [...entryKeys(manifest), ...routeKeys(manifest, routeSource)]);
  return reportChunks(appFolder, routeSource, manifestPath, named, { jsonLimitBytes });
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
  let maxBrotliKb = Infinity;
  let appRoute = null;
  let manifest = null;
  const allowJson = new Set();
  const positional = [];
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--json-limit-kb=')) jsonLimitKb = Number(arg.slice(16));
    else if (arg.startsWith('--max-brotli-kb=')) maxBrotliKb = Number(arg.slice(16));
    else if (arg.startsWith('--app-route=')) appRoute = arg.slice(12);
    else if (arg.startsWith('--manifest=')) manifest = arg.slice(11);
    else if (arg.startsWith('--allow-json=')) allowJson.add(arg.slice(13).replace(/^\/|\/$/g, ''));
    else positional.push(arg);
  }
  const [outDir, ...rawRoutes] = positional;
  const routes = rawRoutes.map((route) => route.replace(/^\/|\/$/g, ''));
  if (!outDir || (appRoute === null && routes.length === 0)) {
    throw new Error('usage: <dir> <route>..., e.g. out en en/download; or --app-route=<route module> <app folder>');
  }
  const options = { jsonLimitBytes: jsonLimitKb * KB };
  const reports = appRoute === null ? routes.map((route) => reportRoute(outDir, route, options)) : [reportAppRoute(outDir, manifest ?? join(outDir, '.vite', 'manifest.json'), appRoute, options)];
  let failed = false;
  for (const report of reports) {
    log(formatReport(report));
    if (report.jsonModules.length > 0 && !allowJson.has(report.route)) failed = true;
    if (report.brotliBytes > maxBrotliKb * KB) {
      log(`  over the first-load budget: ${kb(report.brotliBytes)} brotli > ${maxBrotliKb} KB`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
