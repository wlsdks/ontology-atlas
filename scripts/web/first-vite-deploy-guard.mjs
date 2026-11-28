#!/usr/bin/env node
/**
 * Stops the first deploy of the Vite-built website unless every page it changes is one the criterion-3 gate
 * report accepted. It also tells IndexNow which pages changed, from the same fetch of the live site.
 *   node scripts/web/first-vite-deploy-guard.mjs --out=out --base=https://ontologyatlas.com >> "$GITHUB_OUTPUT"
 *
 * stdout is `urls=<JSON array>` of every sitemap page whose visible text differs from the live page, or that the
 * live site lacks; stderr says whether the deploy may proceed. The exit code is 1 when it may not.
 *
 * The guard is armed while the live site is not positively Vite-built: its HTML names `/_next/`, or it looks like
 * neither build (an error page, a parked domain). It disarms only on Vite's own mark, a module script under
 * `/assets/`. It fails closed: a live site that cannot be read, or a page the live site did not answer, stops the
 * deploy unless the page is on the accepted list, because "no unaccepted change" must be seen, not assumed.
 *
 * The accepted list is `first-deploy-accepted-changes.json`: the gate report's pages, each with the commit that
 * changed it (docs/specs/2026-11-27-ui-on-vite.md, criteria 3 and 6).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { comparePages } from './indexnow.mjs';

const LIVE_PAGE = '/en/';
const NEXT_MARK = '/_next/';
const FETCH_TIMEOUT_MS = 15_000;
export const ACCEPTED_CHANGES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'first-deploy-accepted-changes.json');

/** The pages the gate report accepted as changed: `{ pages: [{ path: '/en/sample/', commit: '<sha>' }] }`. */
export function readAcceptedChanges(file = ACCEPTED_CHANGES_FILE) {
  const { pages } = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(pages)) throw new Error(`${file}: "pages" must be a list`);
  for (const page of pages) {
    if (typeof page?.path !== 'string' || !page.path.startsWith('/') || typeof page.commit !== 'string' || page.commit === '') {
      throw new Error(`${file}: each page needs a "path" starting with "/" and the "commit" that changed it`);
    }
  }
  return pages.map((page) => page.path);
}

/** Vite's own mark: a module script served from `/assets/`. Next's scripts are plain and live under `/_next/`. */
export function isViteBuilt(html) {
  return [...html.matchAll(/<script\b[^>]*>/gi)].some(([tag]) => /\btype="module"/i.test(tag) && /\bsrc="\/assets\//i.test(tag));
}

/**
 * What the guard decides. `armed` is false only once the live site is positively Vite-built; `ok` is whether
 * the deploy may proceed. `changed` lists every changed or new sitemap page for IndexNow, accepted or not.
 */
export async function judgeFirstViteDeploy({ outDir, base, accepted = [], fetchPage = fetch, log = console.error }) {
  let liveHtml;
  try {
    const response = await fetchPage(`${base}${LIVE_PAGE}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
    if (!response.ok) return { armed: true, ok: false, changed: [], reason: `the live ${LIVE_PAGE} answered ${response.status}, so the build it holds cannot be told` };
    liveHtml = await response.text();
  } catch (error) {
    return { armed: true, ok: false, changed: [], reason: `the live ${LIVE_PAGE} could not be read (${error.message}), so the build it holds cannot be told` };
  }
  const viteBuilt = isViteBuilt(liveHtml);
  if (!viteBuilt && !liveHtml.includes(NEXT_MARK)) {
    return { armed: true, ok: false, changed: [], reason: `the live ${LIVE_PAGE} looks like neither build, so what it replaces cannot be told` };
  }

  const { changed, unanswered } = await comparePages({ outDir, fetchPage, log });
  if (viteBuilt) return { armed: false, ok: true, changed, reason: 'the live site is Vite-built: the guard has done its one job' };

  const acceptedPaths = new Set(accepted);
  const unaccepted = (urls) => urls.filter((url) => !acceptedPaths.has(new URL(url).pathname));
  const unlistedChanges = unaccepted(changed);
  const unlistedUnanswered = unaccepted(unanswered);
  if (unlistedChanges.length > 0) return { armed: true, ok: false, changed, unlisted: unlistedChanges, reason: `${unlistedChanges.length} page(s) would change that the gate report did not accept` };
  if (unlistedUnanswered.length > 0) return { armed: true, ok: false, changed, unlisted: unlistedUnanswered, reason: `${unlistedUnanswered.length} page(s) were not answered by the live site, so "no unaccepted change" was not seen` };
  return { armed: true, ok: true, changed, reason: 'every page the Vite build changes on the live Next build is on the accepted list' };
}

function argument(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const base = (argument('base') ?? 'https://ontologyatlas.com').replace(/\/$/, '');
  const verdict = await judgeFirstViteDeploy({
    outDir: path.resolve(argument('out') ?? 'out'),
    base,
    accepted: readAcceptedChanges(argument('accepted') ?? ACCEPTED_CHANGES_FILE),
  });
  console.error(`[first-vite-deploy] ${verdict.ok ? 'proceed' : 'stop'}: ${verdict.reason}`);
  for (const url of verdict.unlisted ?? []) console.error(`  ${url}  (add it to ${path.basename(ACCEPTED_CHANGES_FILE)} with its commit, or fix the page)`);
  console.log(`urls=${JSON.stringify(verdict.changed)}`);
  process.exitCode = verdict.ok ? 0 : 1;
}
