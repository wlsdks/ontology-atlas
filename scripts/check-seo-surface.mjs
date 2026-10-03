#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function attributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? '');
  }
  return attrs;
}

export function parseHead(html) {
  const canonicals = [];
  const alternates = {};
  let robots = '';
  let description = null;
  for (const match of html.matchAll(/<(link|meta)\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (match[1].toLowerCase() === 'link') {
      const rel = (attrs.rel ?? '').toLowerCase();
      if (rel === 'canonical') canonicals.push(attrs.href ?? '');
      else if (rel === 'alternate' && attrs.hreflang) alternates[attrs.hreflang] = attrs.href ?? '';
    } else if ((attrs.name ?? '').toLowerCase() === 'robots') {
      robots += ` ${attrs.content ?? ''}`;
    } else if ((attrs.name ?? '').toLowerCase() === 'description' && description === null) {
      description = attrs.content ?? '';
    }
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return {
    canonicals,
    alternates,
    noindex: /\bnoindex\b/i.test(robots),
    title: title ? decodeEntities(title[1]).trim() : '',
    description: (description ?? '').trim(),
  };
}

export function staticText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function headingNames(html) {
  return [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)].flatMap((match) => [
    attributes(`<h1 ${match[1]}>`)['aria-label'] ?? '',
    decodeEntities(match[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(),
  ]).filter(Boolean);
}

export function parseSitemap(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => {
    const loc = decodeEntities(match[1].match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? '');
    const alternates = {};
    for (const link of match[1].matchAll(/<xhtml:link\b[^>]*>/g)) {
      const attrs = attributes(link[0]);
      if (attrs.hreflang) alternates[attrs.hreflang] = attrs.href ?? '';
    }
    return { loc, alternates };
  });
}

function sameMap(a, b) {
  const keys = Object.keys(a).sort();
  return JSON.stringify(keys) === JSON.stringify(Object.keys(b).sort()) && keys.every((k) => a[k] === b[k]);
}

export function evaluateLocaleCluster({ label, head, entry }) {
  const problems = [];
  if (head.canonicals.length !== 1) {
    problems.push(`${label}: expected one rel="canonical", found ${head.canonicals.length}`);
  } else if (head.canonicals[0] !== entry.loc) {
    problems.push(`${label}: canonical ${head.canonicals[0]} is not ${entry.loc}`);
  }
  if (!('x-default' in entry.alternates)) {
    problems.push(`${label}: sitemap entry ${entry.loc} declares no x-default`);
  }
  if (!sameMap(head.alternates, entry.alternates)) {
    problems.push(
      `${label}: hreflang ${JSON.stringify(head.alternates)} differs from the sitemap's ${JSON.stringify(entry.alternates)}`,
    );
  }
  return problems;
}

export function evaluateSeoSurface({ sitemapXml, pages, messages }) {
  const failures = [];
  const fail = (rule, message) => failures.push({ rule, message });
  const entries = parseSitemap(sitemapXml ?? '');
  const heads = new Map([...pages].map(([urlPath, html]) => [urlPath, parseHead(html)]));
  const locales = Object.keys(messages);

  if (entries.length === 0) fail('5-sitemap-not-empty', 'sitemap.xml lists zero URLs');
  if (pages.size === 0) fail('5-sitemap-not-empty', 'the export contains no HTML pages');

  const origin = entries[0] ? new URL(entries[0].loc).origin : '';
  const byLoc = new Map(entries.map((entry) => [entry.loc, entry]));

  for (const entry of entries) {
    const urlPath = new URL(entry.loc).pathname;
    const head = heads.get(urlPath);
    if (!head) {
      fail('1-sitemap-self-canonical', `${entry.loc} has no exported HTML`);
      continue;
    }
    if (head.noindex) fail('1-sitemap-self-canonical', `${entry.loc} is noindex`);
    for (const problem of evaluateLocaleCluster({ label: entry.loc, head, entry })) {
      fail('1-sitemap-self-canonical', problem);
    }
  }

  for (const [urlPath, head] of heads) {
    const self = `${origin}${urlPath}`;
    if (head.canonicals.length > 0 && head.canonicals[0] !== self && byLoc.has(self)) {
      fail('2-no-foreign-canonical-in-sitemap', `${self} is in the sitemap but canonicalizes to ${head.canonicals[0]}`);
    }
  }

  const rootHead = heads.get('/');
  if (!rootHead) fail('3-root-canonical', 'the export has no root index.html');
  else if (rootHead.canonicals.length !== 1) {
    fail('3-root-canonical', `/ carries ${rootHead.canonicals.length} rel="canonical" (expected 1)`);
  } else if (!byLoc.has(rootHead.canonicals[0])) {
    fail('3-root-canonical', `/ canonicalizes to ${rootHead.canonicals[0]}, which is not a sitemap URL`);
  }

  const desktopNeedles = locales.map((l) => [l, messages[l]?.rootEntry?.redirectBody]);
  for (const [l, needle] of desktopNeedles) {
    if (typeof needle !== 'string' || needle.length === 0) {
      fail('4-desktop-copy', `messages/${l}.json has no rootEntry.redirectBody; the needle is unusable`);
    }
  }
  const texts = new Map();
  const textOf = (urlPath) => {
    if (!texts.has(urlPath)) texts.set(urlPath, staticText(pages.get(urlPath) ?? ''));
    return texts.get(urlPath);
  };
  for (const entry of entries) {
    const urlPath = new URL(entry.loc).pathname;
    if (!pages.has(urlPath)) continue;
    for (const [l, needle] of desktopNeedles) {
      if (needle && textOf(urlPath).includes(needle)) {
        fail('4-desktop-copy', `${entry.loc} static HTML contains the desktop copy rootEntry.redirectBody (${l})`);
      }
    }
  }
  for (const l of locales) {
    const head = heads.get(`/${l}/`);
    if (!head) continue;
    const home = head.canonicals[0];
    const headline = messages[l]?.download?.heroTitleLine1;
    if (typeof headline !== 'string' || headline.length === 0) {
      fail('4-desktop-copy', `messages/${l}.json has no download.heroTitleLine1; the needle is unusable`);
      continue;
    }
    if (!home || !byLoc.has(home)) {
      fail('4-desktop-copy', `/${l}/ does not canonicalize to a sitemap URL (${home ?? 'none'})`);
      continue;
    }
    const homePath = new URL(home).pathname;
    if (!headingNames(pages.get(homePath) ?? '').some((name) => name.includes(headline))) {
      fail('4-desktop-copy', `${home} (canonical home of /${l}/) has no h1 carrying the gateway headline download.heroTitleLine1`);
    }
  }

  for (const [urlPath, head] of heads) {
    if (!head.noindex && head.canonicals.length === 0) {
      fail('6-indexable-has-canonical', `${urlPath} is indexable but has no rel="canonical"`);
    }
  }

  const seen = new Map();
  for (const entry of entries) {
    const urlPath = new URL(entry.loc).pathname;
    const head = heads.get(urlPath);
    if (!head) continue;
    const locale = urlPath.split('/')[1] ?? '';
    for (const field of ['title', 'description']) {
      const value = head[field];
      if (!value) {
        fail('7-unique-title-description', `${entry.loc} has an empty ${field}`);
        continue;
      }
      const key = `${locale}\u0000${field}\u0000${value}`;
      if (seen.has(key)) {
        fail('7-unique-title-description', `${entry.loc} repeats the ${field} of ${seen.get(key)}: "${value}"`);
      } else {
        seen.set(key, entry.loc);
      }
    }
  }

  return failures;
}

function collectPages(outDir) {
  const pages = new Map();
  const walk = (dir) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dirent.name.startsWith('_next')) continue;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) walk(full);
      else if (dirent.name === 'index.html') {
        const rel = path.relative(outDir, path.dirname(full)).split(path.sep).join('/');
        pages.set(rel ? `/${rel}/` : '/', fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(outDir);
  return pages;
}

function readMessages() {
  const dir = path.join(REPO_ROOT, 'messages');
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
      .map((name) => [name.slice(0, -'.json'.length), JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))]),
  );
}

function main() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--out='));
  const outDir = path.resolve(arg ? arg.slice('--out='.length) : path.join(REPO_ROOT, 'out'));
  const sitemapPath = path.join(outDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.error(`[seo-surface] ${sitemapPath} does not exist; run pnpm build first`);
    process.exit(1);
  }
  const pages = collectPages(outDir);
  const failures = evaluateSeoSurface({
    sitemapXml: fs.readFileSync(sitemapPath, 'utf8'),
    pages,
    messages: readMessages(),
  });
  if (failures.length > 0) {
    for (const { rule, message } of failures) console.error(`[seo-surface] ${rule}: ${message}`);
    const rules = [...new Set(failures.map((f) => f.rule))].join(', ');
    console.error(`[seo-surface] ${failures.length} failure(s) in ${rules}`);
    process.exit(1);
  }
  const count = parseSitemap(fs.readFileSync(sitemapPath, 'utf8')).length;
  console.log(`[seo-surface] ${count} sitemap URLs and ${pages.size} pages agree ✓`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
