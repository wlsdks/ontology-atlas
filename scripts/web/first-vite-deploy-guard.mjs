#!/usr/bin/env node
/**
 * Stops the first deploy of the Vite-built website unless it changes no page a reader or a crawler sees.
 *   node scripts/web/first-vite-deploy-guard.mjs --out=out --base=https://ontologyatlas.com
 *
 * The guard applies only while the live site is still the Next build (its HTML names `/_next/`); once a Vite
 * build is live it passes without comparing, so later deploys are not held by it. It fails closed: a live site
 * that cannot be read, or a page the live site did not answer, stops the deploy, because "nothing changed"
 * must be seen, not assumed. The comparison is `indexnow.mjs`'s: the visible text of every sitemap page.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { comparePages } from './indexnow.mjs';

const LIVE_PAGE = '/en/';
const NEXT_MARK = '/_next/';
const FETCH_TIMEOUT_MS = 15_000;

/** What the guard decides: `armed` while the live site is Next-built, `ok` when the deploy may proceed. */
export async function judgeFirstViteDeploy({ outDir, base, fetchPage = fetch, log = console.error }) {
  let liveHtml;
  try {
    const response = await fetchPage(`${base}${LIVE_PAGE}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
    if (!response.ok) return { armed: true, ok: false, reason: `the live ${LIVE_PAGE} answered ${response.status}, so the build it holds cannot be told` };
    liveHtml = await response.text();
  } catch (error) {
    return { armed: true, ok: false, reason: `the live ${LIVE_PAGE} could not be read (${error.message}), so the build it holds cannot be told` };
  }
  if (!liveHtml.includes(NEXT_MARK)) return { armed: false, ok: true, reason: 'the live site is not Next-built: the guard has done its one job' };

  const { changed, unanswered } = await comparePages({ outDir, fetchPage, log });
  if (changed.length > 0) return { armed: true, ok: false, reason: `${changed.length} page(s) would change`, changed, unanswered };
  if (unanswered.length > 0) return { armed: true, ok: false, reason: `${unanswered.length} page(s) were not answered by the live site, so "no change" was not seen`, changed, unanswered };
  return { armed: true, ok: true, reason: 'the Vite build changes no page of the live Next build', changed, unanswered };
}

function argument(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const base = (argument('base') ?? 'https://ontologyatlas.com').replace(/\/$/, '');
  const verdict = await judgeFirstViteDeploy({ outDir: path.resolve(argument('out') ?? 'out'), base });
  console.error(`[first-vite-deploy] ${verdict.ok ? 'proceed' : 'stop'}: ${verdict.reason}`);
  for (const url of [...(verdict.changed ?? []), ...(verdict.unanswered ?? [])]) console.error(`  ${url}`);
  process.exitCode = verdict.ok ? 0 : 1;
}
