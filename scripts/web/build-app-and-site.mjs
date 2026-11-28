#!/usr/bin/env node
// `pnpm build`: the two folders Vite writes, the installed app's and the website's.
//   node scripts/web/build-app-and-site.mjs [--only=app|site]
// Data both read comes first (`pnpm docs-vault:build` and `pnpm messages:build` read different folders, so they run
// together), then the type check, then the two bundles side by side: they share no output, and the prerender needs
// only the website's own bundle. `ATLAS_BUILD_SKIP_TYPECHECK=1` skips the type check for a commit the Checks gate
// already type-checked. Gates come last, on what was written: first-load sizes, the app folder's contents, and the
// committed route tree.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { APP_FOLDER, APP_MANIFEST, SITE_FOLDER } from '../lib/web/built-folders.mjs';

const SKIP_TYPECHECK = 'ATLAS_BUILD_SKIP_TYPECHECK';
/** The committed file Vite's router plugin writes; `.gitattributes` pins its line endings. */
export const ROUTE_TREE = 'src/app/route-tree.gen.ts';

/** First loads at or under these sizes, in KB of brotli: what the installed app's map and the download page cost. */
export const FIRST_LOAD_BUDGET_KB = Object.freeze({ app: 1001, site: 462 });
/** The route module whose chunks the app's map loads first, and the website page its budget reads. */
export const APP_MAP_ROUTE = 'src/app/routes/$locale/_app/topology';
export const SITE_BUDGET_PAGE = 'en/download';

const repositoryOf = (here) => resolve(dirname(here), '../..');

/** Runs one script from the repository root; resolves with its exit code, every output line named by `label`. */
function run(repository, env, label, script, args = []) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [resolve(repository, script), ...args], {
      cwd: repository,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const say = (stream, write) => {
      let rest = '';
      stream.setEncoding('utf8');
      stream.on('data', (text) => {
        const lines = (rest + text).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) write(`[${label}] ${line}\n`);
      });
      stream.on('end', () => rest && write(`[${label}] ${rest}\n`));
    };
    say(child.stdout, (line) => process.stdout.write(line));
    say(child.stderr, (line) => process.stderr.write(line));
    child.on('error', (error) => {
      console.error(`[${label}] ${error.message}`);
      resolveRun(1);
    });
    child.on('close', (code) => resolveRun(code ?? 1));
  });
}

/** The native TypeScript compiler's entry; the package's extensionless bin only imports it. */
function typescriptEntry(repository) {
  const require = createRequire(join(repository, 'package.json'));
  return join(dirname(require.resolve('@typescript/native/package.json')), 'lib', 'tsc.js');
}

const firstFailure = (codes) => codes.find((code) => code !== 0) ?? 0;

export async function build({ only = null, env = process.env, repository = repositoryOf(import.meta.filename) } = {}) {
  if (env.ATLAS_PUBLIC_BASE_PATH) {
    console.error("[build] ATLAS_PUBLIC_BASE_PATH is set, but the website is built to be served at the root of its host: a sub-path needs Vite's base, the router's basepath, the icon links and the boot script to carry it.");
    return 1;
  }
  const vite = 'node_modules/vite/bin/vite.js';
  const wantsApp = only !== 'site';
  const wantsSite = only !== 'app';
  const step = (label, script, args) => run(repository, env, label, script, args);
  const routeTree = join(repository, ROUTE_TREE);
  const routeTreeBefore = existsSync(routeTree) ? readFileSync(routeTree, 'utf8') : null;

  const data = firstFailure(await Promise.all([step('docs-vault', 'scripts/docs-vault/build-docs-vault.mjs'), step('messages', 'scripts/i18n/build-messages.mjs')]));
  if (data !== 0) return data;
  if (env[SKIP_TYPECHECK] !== '1') {
    const typed = await step('typecheck', typescriptEntry(repository), ['--noEmit']);
    if (typed !== 0) return typed;
  }

  const website = async () => {
    const bundled = await step('site', vite, ['build', '--mode', 'site']);
    return bundled === 0 ? step('prerender', 'scripts/web/site/prerender-site.mjs') : bundled;
  };
  const bundled = firstFailure(await Promise.all([wantsApp ? step('app', vite, ['build', '--manifest']) : 0, wantsSite ? website() : 0]));
  if (bundled !== 0) return bundled;

  if (wantsApp) {
    // The manifest is for the reports; the app folder holds only what the app uses.
    mkdirSync(dirname(join(repository, APP_MANIFEST)), { recursive: true });
    renameSync(join(repository, APP_FOLDER, '.vite', 'manifest.json'), join(repository, APP_MANIFEST));
    rmSync(join(repository, APP_FOLDER, '.vite'), { recursive: true, force: true });
  }
  const reports = [];
  if (wantsApp) reports.push(['first-load app', [`--max-brotli-kb=${FIRST_LOAD_BUDGET_KB.app}`, `--app-route=${APP_MAP_ROUTE}`, `--manifest=${APP_MANIFEST}`, APP_FOLDER]]);
  if (wantsSite) reports.push(['first-load site', [`--max-brotli-kb=${FIRST_LOAD_BUDGET_KB.site}`, `--allow-json=${SITE_BUDGET_PAGE}`, SITE_FOLDER, SITE_BUDGET_PAGE]]);
  for (const [label, args] of reports) {
    const reported = await step(label, 'scripts/web/first-load-report.mjs', args);
    if (reported !== 0) return reported;
  }

  if (wantsApp) {
    const checked = await step('app folder', 'scripts/desktop/check-app-folder.mjs');
    if (checked !== 0) return checked;
  }

  // The route tree Vite's router plugin writes is committed; a build that changes it means the commit is stale.
  if (routeTreeBefore !== null && readFileSync(routeTree, 'utf8') !== routeTreeBefore) {
    console.error(`[build] ${ROUTE_TREE} changed during the build: the committed route tree is out of date. Commit the file the build wrote.`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length) ?? null;
  if (only !== null && only !== 'app' && only !== 'site') {
    console.error(`[build] --only is "${only}"; expected "app" or "site".`);
    process.exit(2);
  }
  process.exit(await build({ only }));
}
