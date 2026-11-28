#!/usr/bin/env node
/**
 * Fails when the folder the installed app embeds (`build.frontendDist`) holds anything it does not use.
 * Tauri compiles every file into the executable and the updater ships it whole, so a stray file costs every
 * install. The folder holds `index.html`, and each other file is one the bundle or the document names; none is a
 * file only the website serves. Usage: `node scripts/desktop/check-app-folder.mjs [--folder=<path>]`.
 *
 * A file is named when its address appears in the document or a chunk: a hashed file in `assets/` by its
 * name, a file of `public/` by its own address or by a prefix the code builds its name after
 * (`PREFIXES_THE_CODE_BUILDS_NAMES_AFTER`, such as `/brand/mascot-`). A website-only file is refused even when a chunk names it, because the website's page
 * head names `/og-image.png` in code the app bundles too, and the window never asks for it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_FOLDER } from '../lib/web/built-folders.mjs';
import { isWebsiteOnlyFile } from '../lib/web/website-only-files.mjs';

const CODE_FILE = /\.(?:html|js|css)$/;
/**
 * The chunks of the pages the app's route tree leaves out (`vite.config.ts`): `/download` and `/sample`, and the
 * sample's two data files. The build names a chunk after its module, then a hash.
 */
const WEBSITE_ONLY_CHUNK = /^assets\/(?:download|sample|sample-storefront\.(?:manifest|content))-[\w-]+\.js$/;
/** Where the build puts what it bundles; every other top-level file or folder came from `public/`. */
const BUNDLE_FOLDER = 'assets';

/**
 * The addresses the code builds file names after, and the kind of file it builds there. A chunk that names the
 * prefix covers the files of that kind below it and nothing else in the folder; any other file is covered only by
 * its own address, so naming `/brand/` for the mascot's rows does not cover an old logo beside them.
 */
const PREFIXES_THE_CODE_BUILDS_NAMES_AFTER = [
  { prefix: '/brand/mascot-', kind: /\.png$/ }, // `/brand/mascot-${row}-row-128.png`
  { prefix: '/brand/moru-emote-', kind: /\.svg$/ }, // `/brand/moru-emote-${glyph}.svg`
  { prefix: '/acp-icons/', kind: /\.svg$/ }, // the registry's `/acp-icons/${agent.id}.svg`
];

function builtAfterNamedPrefix(file, named) {
  const address = `/${file}`;
  return PREFIXES_THE_CODE_BUILDS_NAMES_AFTER.some(({ prefix, kind }) => address.startsWith(prefix) && !address.slice(prefix.length).includes('/') && kind.test(address) && named(prefix));
}

function filesUnder(folder) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(folder, path).split(sep).join('/'));
    }
  };
  walk(folder);
  return found.sort();
}

/** The problems with an app folder, each a sentence naming the file; empty when it holds only what the app uses. */
export function appFolderProblems(folder) {
  if (!existsSync(join(folder, 'index.html'))) return [`${folder} has no index.html: build the app first (pnpm build:app)`];
  const files = filesUnder(folder);
  const document = readFileSync(join(folder, 'index.html'), 'utf8');
  const problems = [];

  // The WebView adds a nonce to every inline style, which disables 'unsafe-inline'; CSS arrives as files.
  if (/<style[\s>]/i.test(document) || /\sstyle\s*=/i.test(document)) {
    problems.push('index.html holds a <style> element or a style attribute: the app\'s policy ignores inline styles, so its CSS must be a file');
  }

  const code = files.filter((file) => CODE_FILE.test(file) && (file === 'index.html' || file.startsWith(`${BUNDLE_FOLDER}/`)));
  const corpus = new Map(code.map((file) => [file, readFileSync(join(folder, file), 'utf8')]));
  const named = (needle, except) => [...corpus].some(([file, text]) => file !== except && text.includes(needle));

  for (const file of files) {
    const top = file.split('/')[0];
    if (isWebsiteOnlyFile(file)) {
      problems.push(`${file} is a file only the website serves; the app never asks for it`);
    } else if (WEBSITE_ONLY_CHUNK.test(file)) {
      problems.push(`${file} is the code of a page only the website serves; the app's route tree should not reach it`);
    } else if (file === 'index.html') {
      continue;
    } else if (top === BUNDLE_FOLDER) {
      const name = file.slice(BUNDLE_FOLDER.length + 1);
      if (!named(name, file)) problems.push(`${file} is in the bundle folder and no chunk or the document names it`);
    } else if (!named(`/${file}`) && !builtAfterNamedPrefix(file, named)) {
      problems.push(`${file} is a public file that no chunk or the document names`);
    }
  }
  return problems;
}

function main(argv) {
  const folderArgument = argv.find((argument) => argument.startsWith('--folder='))?.slice('--folder='.length);
  const folder = resolve(folderArgument ?? join(fileURLToPath(new URL('../..', import.meta.url)), APP_FOLDER));
  const problems = appFolderProblems(folder);
  if (problems.length > 0) {
    console.error(`[app-folder] ${problems.length} problem(s) in ${folder}:`);
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  const files = filesUnder(folder);
  const bytes = files.reduce((sum, file) => sum + statSync(join(folder, file)).size, 0);
  console.log(`[app-folder] ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB: index.html and what it names`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
