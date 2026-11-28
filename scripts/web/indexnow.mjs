#!/usr/bin/env node
/**
 * Tells the IndexNow engines (Bing, which also feeds ChatGPT search, and Naver, Yandex, Seznam)
 * which pages of the deployed site changed, so they recrawl those within minutes. Google does not
 * take IndexNow; it reads the sitemap.
 *
 *   node scripts/web/indexnow.mjs changed --out=out
 *     Before deploy: prints `urls=<JSON array>` of the sitemap pages whose visible text in the new
 *     build differs from the live page, or that the live site does not have yet.
 *   node scripts/web/indexnow.mjs submit --urls='<JSON array>' --base=https://ontologyatlas.com
 *     After deploy: posts them to api.indexnow.org.
 *
 * Only changed pages are sent, because the site deploys on every merge and IndexNow is for change.
 * The key is public by design: an engine fetches `/<key>.txt` to prove the host is ours.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeEntities } from './check-seo-surface.mjs';

export const INDEXNOW_KEY = '39b8c5bebbe326f89097083d57514dcc';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const FETCH_TIMEOUT_MS = 15_000;
const PARALLEL_FETCHES = 8;
/** The whole comparison's ceiling, well inside the build job's budget; pages not reached are left out. */
const DEADLINE_MS = 40_000;

/** What a reader and a crawler's index see: title, description and body text, without scripts or markup. */
export function visibleText(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  const description = /<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? '';
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(`${title}\n${description}\n${body}`).replace(/\s+/g, ' ').trim();
}

const digest = (text) => createHash('sha256').update(text).digest('hex');

export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

/** The exported file that serves a sitemap URL: `/en/download/` is `out/en/download/index.html`. */
export function exportedFileOf(url, outDir) {
  const { pathname } = new URL(url);
  return path.join(outDir, decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : '');
}

/**
 * The sitemap pages whose visible text changed against the live site, and the pages the live site
 * did not answer (or the deadline did not reach): neither changed nor unchanged, so never guessed.
 * A page the live site lacks (404) is new and counts as changed.
 */
export async function comparePages({ outDir, fetchPage = fetch, log = console.error, deadlineMs = DEADLINE_MS }) {
  const urls = sitemapUrls(fs.readFileSync(path.join(outDir, 'sitemap.xml'), 'utf8'));
  const verdicts = new Map();
  const deadline = AbortSignal.timeout(deadlineMs);
  const check = async (url) => {
    try {
      const file = exportedFileOf(url, outDir);
      if (!fs.existsSync(file)) return;
      const built = digest(visibleText(fs.readFileSync(file, 'utf8')));
      const response = await fetchPage(url, { signal: AbortSignal.any([deadline, AbortSignal.timeout(FETCH_TIMEOUT_MS)]), redirect: 'follow' });
      if (response.status === 404) verdicts.set(url, true);
      else if (response.ok) verdicts.set(url, digest(visibleText(await response.text())) !== built);
      else log(`[indexnow] ${url}: live answered ${response.status}; left out`);
    } catch (error) {
      log(`[indexnow] ${url}: ${error.message}; left out`);
    }
  };
  // A few at a time, so the deploy's build job stays inside its budget without flooding the host.
  for (let start = 0; start < urls.length && !deadline.aborted; start += PARALLEL_FETCHES) {
    await Promise.all(urls.slice(start, start + PARALLEL_FETCHES).map(check));
  }
  return {
    changed: urls.filter((url) => verdicts.get(url)),
    unanswered: urls.filter((url) => fs.existsSync(exportedFileOf(url, outDir)) && !verdicts.has(url)),
  };
}

/** The sitemap pages whose visible text changed against the live site; one it could not answer is left out. */
export async function changedUrls(options) {
  return (await comparePages(options)).changed;
}

export function submissionOf(urls, base) {
  const host = new URL(base).host;
  return { host, key: INDEXNOW_KEY, keyLocation: `${base}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

/** Posts the URLs; a refusal is reported, never fatal, since the site is already deployed. */
export async function submit({ urls, base, post = fetch, log = console.error }) {
  if (urls.length === 0) return 'nothing changed';
  const response = await post(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(submissionOf(urls, base)),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const outcome = `${urls.length} URL(s): IndexNow answered ${response.status}`;
  // A refusal (a moved key, a rejected host) must show in the run, though it never fails the deploy.
  if (response.status !== 200 && response.status !== 202) log(`::warning::[indexnow] ${outcome}`);
  return outcome;
}

function argument(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const base = (argument('base') ?? 'https://ontologyatlas.com').replace(/\/$/, '');
  const mode = process.argv[2];
  if (mode === 'changed') {
    const urls = await changedUrls({ outDir: path.resolve(argument('out') ?? 'out') });
    console.error(`[indexnow] ${urls.length} changed page(s)`);
    console.log(`urls=${JSON.stringify(urls)}`);
  } else if (mode === 'submit') {
    console.log(`[indexnow] ${await submit({ urls: JSON.parse(argument('urls') ?? '[]'), base }).catch((error) => `not sent: ${error.message}`)}`);
  } else {
    console.error('usage: indexnow.mjs changed --out=<dir> | submit --urls=<json>');
    process.exitCode = 2;
  }
}
