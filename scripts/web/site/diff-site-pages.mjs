#!/usr/bin/env node
// Page-by-page parity of two website folders, the Next export and the Vite prerender:
//   node scripts/web/site/diff-site-pages.mjs --next=<out> --vite=<site folder> [--list-allowed]
// Exits 1 when the Vite folder differs from the Next one in anything the spec does not allow
// (docs/specs/2026-11-27-ui-on-vite.md, criterion 3). It reads two folders and nothing else.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { routing } from '../../../src/i18n/routing.ts';

/** What Next writes and Vite does not, or the other way round, and why neither side's own file counts as a difference. */
export const ALLOWED_DIFFERENCES = [
  { rule: 'bundle scripts', reason: "Next's scripts under /_next/ and its streaming scripts, and Vite's module scripts under /assets/ and the JSON record its page carries, are each side's own; the boot script is compared by its presence, JSON-LD by its content, and any other script is a difference" },
  { rule: 'bundle stylesheets and preloads', reason: "each side links its own bundle's files, under /_next/ on Next's side and under /assets/ on Vite's; a stylesheet or preload from anywhere else is compared like any other head element" },
  { rule: 'next-size-adjust', reason: 'Next adds this marker to every page; Vite has no counterpart' },
  { rule: 'icon query strings', reason: "Next appends a content hash to the icon links; Vite links the files plainly, compared without the query" },
  { rule: '404 robots', reason: "Next adds its own `noindex` beside the page's `noindex, follow`; Vite writes the page's one tag" },
  { rule: 'workbench face', reason: "on an app address Next server-renders the whole workbench; Vite writes the loading picture, as the spec's Decision 2 and 3 say" },
  { rule: 'image markers', reason: "`next/image` adds `data-nimg` and `style=\"color:transparent\"` (it hides the alt text until the file arrives); an `<img>` keeps the alt text" },
  { rule: 'locale entry text', reason: "at `/<language>/` Next's HTML holds the entry only in a streamed hidden boundary and shows no text without scripts; Vite writes the gateway entry text, which a script replaces by sending the visitor on" },
  { rule: 'hidden markup', reason: "Next keeps streamed boundaries in hidden elements (`<div hidden>`, `<template>`), which no reader sees" },
];

const SKIPPED_FOLDERS = new Set(['_next', 'assets', '_not-found', '404']);
const CSS_OR_SCRIPT_PRELOAD_AS = new Set(['script', 'style', 'font']);

function readPages(folder) {
  const pages = new Map();
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!(directory === folder && SKIPPED_FOLDERS.has(entry.name))) walk(join(directory, entry.name));
      } else if (entry.name === 'index.html' || (directory === folder && entry.name === '404.html')) {
        const rel = relative(folder, join(directory, entry.name)).split(sep).join('/');
        pages.set(rel, readFileSync(join(directory, entry.name), 'utf8'));
      }
    }
  };
  walk(folder);
  return pages;
}

function parse(html) {
  return new JSDOM(html).window.document;
}

const NEXT_IMAGE_MARKERS = new Set(['data-nimg', 'style=color:transparent']);

const attributesOf = (element) =>
  [...element.attributes]
    .filter((attribute) => element.localName !== 'img' || !NEXT_IMAGE_MARKERS.has(attribute.name === 'style' ? `style=${attribute.value}` : attribute.name))
    .map((attribute) => `${attribute.name.toLowerCase()}=${JSON.stringify(attribute.value)}`)
    .sort()
    .join(' ');

const signature = (element) => `<${element.localName} ${attributesOf(element)}>${element.localName === 'title' ? element.textContent.trim() : ''}`;

const bundleFolder = (side) => (side === 'next' ? '/_next/' : '/assets/');
const isBundleFile = (address, side) => (address ?? '').includes(bundleFolder(side));

function isAllowedHeadElement(element, side) {
  const name = element.localName;
  // Left out of the head's elements because `scriptFindings` judges every script of the document, head or body.
  if (name === 'script') return true;
  if (name === 'meta' && element.getAttribute('name') === 'next-size-adjust') return true;
  if (name === 'meta' && element.getAttribute('name') === 'robots' && element.getAttribute('content') === 'noindex' && side === 'next') return true;
  if (name === 'link' && isBundleFile(element.getAttribute('href'), side)) {
    const rel = element.getAttribute('rel');
    if (rel === 'stylesheet' || rel === 'modulepreload') return true;
    if (rel === 'preload' && CSS_OR_SCRIPT_PRELOAD_AS.has(element.getAttribute('as') ?? '')) return true;
  }
  return false;
}

/** Keys sorted all the way down, so two blocks that say the same thing in another order compare equal. */
const canonicalJson = (value) =>
  JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1))) : inner,
  );

/** The framework's own inline scripts on Next's side: its flight data, its bundler runtime and its streaming boundaries. */
const NEXT_INLINE_SCRIPT = /^\s*(?:\(self\.__next_f|self\.__next_f|\(globalThis\["TURBOPACK"\]|requestAnimationFrame\(function\(\)\{\$RT|\$R[A-Z]|\$R\[)/;
const BOOT_SCRIPT_MARK = 'data-shell';
/** The history key the router's scroll restoration script reads; no other script of the site mentions it. */
const ROUTER_SCROLL_KEY = '__TSR_key';

/**
 * What a document's scripts say, sorted into what the diff may ignore and what it must compare:
 * the parsed JSON-LD blocks, whether the boot script that sets the language and marks the app is there,
 * and every script that is neither a side's bundle file nor its own known inline script.
 */
export function scriptFindings(document, side) {
  const found = { jsonLd: [], boot: false, unexplained: [] };
  for (const script of document.querySelectorAll('script')) {
    const source = script.getAttribute('src');
    const text = script.textContent ?? '';
    if (script.getAttribute('type') === 'application/ld+json') {
      try {
        found.jsonLd.push(canonicalJson(JSON.parse(text)));
      } catch {
        found.unexplained.push('JSON-LD that does not parse');
      }
    } else if (source !== null) {
      const own = side === 'vite' ? script.getAttribute('type') === 'module' && isBundleFile(source, side) : isBundleFile(source, side);
      if (!own) found.unexplained.push(`script src=${source}`);
    } else if (text.includes(BOOT_SCRIPT_MARK)) {
      found.boot = true;
    } else if (side === 'next' && (NEXT_INLINE_SCRIPT.test(text) || (text.startsWith('try{') && text.includes('location.replace')))) {
      // Next's own: its framework scripts, and its hand-over of a language root to the download page.
    } else if (side === 'vite' && script.id === 'atlas-page' && script.getAttribute('type') === 'application/json') {
      // The record of what the build knew, which the page carries for its first browser render.
    } else if (side === 'vite' && text.startsWith('try{') && text.includes('location.replace')) {
      // The one script at `/` that sends a visitor to a language.
    } else if (side === 'vite' && text.includes('sessionStorage') && text.includes(ROUTER_SCROLL_KEY)) {
      // The router's own scroll restoration, inlined before first paint on every page that has a router.
    } else {
      found.unexplained.push(`inline script ${JSON.stringify(text.slice(0, 60))}`);
    }
  }
  return found;
}

/** The head as a sorted list of elements with sorted attributes, minus what each side owns. */
export function headSignatures(document, side) {
  return [...document.head.children]
    .filter((element) => !isAllowedHeadElement(element, side))
    .map((element) => {
      const copy = element.cloneNode(true);
      if (copy.localName === 'link' && /icon/.test(copy.getAttribute('rel') ?? '')) copy.setAttribute('href', (copy.getAttribute('href') ?? '').split('?')[0]);
      return signature(copy);
    })
    .sort();
}

/** What a reader sees: the body without scripts, styles, streamed boundaries and anything marked hidden. */
function readableRoot(document, selector) {
  const root = (selector ? document.querySelector(selector) : document.body)?.cloneNode(true);
  if (!root) return null;
  root.querySelectorAll('script, style, template, [hidden]').forEach((element) => element.remove());
  return root;
}

const visibleText = (root) => (root ? root.textContent.replace(/\s+/g, ' ').trim() : null);
const attributeSets = (root, selector) => (root ? [...root.querySelectorAll(selector)].map(attributesOf) : null);

function isAppAddress(document) {
  return document.querySelector('[data-face="app-only"]') !== null;
}

/** The text files crawlers read must be byte for byte the same. */
const SAME_FILES = ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt'];

export function compareSites({ nextFolder, viteFolder }) {
  const differences = [];
  const differ = (page, aspect, next, vite) => differences.push({ page, aspect, next, vite });
  const nextPages = readPages(nextFolder);
  const vitePages = readPages(viteFolder);

  for (const page of nextPages.keys()) if (!vitePages.has(page)) differ(page, 'page missing in Vite', 'present', 'absent');
  for (const page of vitePages.keys()) if (!nextPages.has(page)) differ(page, 'page only in Vite', 'absent', 'present');

  for (const [page, nextHtml] of nextPages) {
    const viteHtml = vitePages.get(page);
    if (viteHtml === undefined) continue;
    const next = parse(nextHtml);
    const vite = parse(viteHtml);

    const nextHead = headSignatures(next, 'next');
    const viteHead = headSignatures(vite, 'vite');
    for (const element of nextHead) if (!viteHead.includes(element)) differ(page, 'head element missing in Vite', element, '');
    for (const element of viteHead) if (!nextHead.includes(element)) differ(page, 'head element only in Vite', '', element);

    const nextScripts = scriptFindings(next, 'next');
    const viteScripts = scriptFindings(vite, 'vite');
    for (const script of nextScripts.unexplained) differ(page, 'script only in Next', script, '');
    for (const script of viteScripts.unexplained) differ(page, 'script only in Vite', '', script);
    if (!viteScripts.boot) differ(page, 'boot script', 'present', 'absent');
    if (JSON.stringify([...nextScripts.jsonLd].sort()) !== JSON.stringify([...viteScripts.jsonLd].sort())) {
      const missing = nextScripts.jsonLd.filter((block) => !viteScripts.jsonLd.includes(block));
      const extra = viteScripts.jsonLd.filter((block) => !nextScripts.jsonLd.includes(block));
      differ(page, 'JSON-LD', (missing[0] ?? `(${nextScripts.jsonLd.length} blocks)`).slice(0, 300), (extra[0] ?? `(${viteScripts.jsonLd.length} blocks)`).slice(0, 300));
    }

    if (next.documentElement.lang !== vite.documentElement.lang) differ(page, 'html lang', next.documentElement.lang, vite.documentElement.lang);

    const region = isAppAddress(next) && isAppAddress(vite) ? '[data-face="app-only"]' : null;
    const nextRoot = readableRoot(next, region);
    const viteRoot = readableRoot(vite, region);
    const isLocaleEntry = new RegExp(`^(${routing.locales.join('|')})/index\\.html$`).test(page);
    if (!isLocaleEntry && visibleText(nextRoot) !== visibleText(viteRoot)) differ(page, 'visible text', visibleText(nextRoot)?.slice(0, 160) ?? null, visibleText(viteRoot)?.slice(0, 160) ?? null);
    for (const selector of isLocaleEntry ? [] : ['a[href]', 'img']) {
      const nextSets = attributeSets(nextRoot, selector);
      const viteSets = attributeSets(viteRoot, selector);
      if (JSON.stringify(nextSets) !== JSON.stringify(viteSets)) {
        const index = (nextSets ?? []).findIndex((set, position) => set !== viteSets?.[position]);
        differ(page, `${selector} attributes`, nextSets?.[index] ?? `(${nextSets?.length ?? 0} found)`, viteSets?.[index] ?? `(${viteSets?.length ?? 0} found)`);
      }
    }

    if (Buffer.byteLength(viteHtml) > Buffer.byteLength(nextHtml)) differ(page, 'html bytes', `${Buffer.byteLength(nextHtml)}`, `${Buffer.byteLength(viteHtml)}`);

    // The policy meta must come before any script or stylesheet, or it does not cover them.
    const policy = vite.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const firstAsset = vite.querySelector('script, link[rel="stylesheet"]');
    if (!policy) differ(page, 'policy meta', 'present', 'absent');
    else if (firstAsset && firstAsset.compareDocumentPosition(policy) & 4 /* the policy follows the asset */) differ(page, 'policy meta order', 'before every script and stylesheet', 'after one');
  }

  for (const file of SAME_FILES) {
    const nextFile = join(nextFolder, file);
    const viteFile = join(viteFolder, file);
    if (!existsSync(nextFile) || !existsSync(viteFile)) differ(file, 'file missing', String(existsSync(nextFile)), String(existsSync(viteFile)));
    else if (readFileSync(nextFile, 'utf8') !== readFileSync(viteFile, 'utf8')) differ(file, 'file bytes', `${statSync(nextFile).size} bytes`, `${statSync(viteFile).size} bytes`);
  }
  return { pages: nextPages.size, differences };
}

function main() {
  const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (process.argv.includes('--list-allowed')) {
    for (const { rule, reason } of ALLOWED_DIFFERENCES) console.log(`${rule}: ${reason}`);
    return;
  }
  const nextFolder = option('next');
  const viteFolder = option('vite');
  if (!nextFolder || !viteFolder) {
    console.error('usage: diff-site-pages.mjs --next=<Next out folder> --vite=<Vite site folder>');
    process.exit(2);
  }
  const { pages, differences } = compareSites({ nextFolder, viteFolder });
  for (const { page, aspect, next, vite } of differences) console.log(`${page}\n  ${aspect}\n  next: ${next}\n  vite: ${vite}`);
  console.log(`[site-diff] ${pages} Next pages compared, ${differences.length} difference(s)`);
  process.exit(differences.length > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
