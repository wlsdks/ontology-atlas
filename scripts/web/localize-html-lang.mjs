#!/usr/bin/env node
/**
 * The static export renders every page under one root layout whose `<html lang>` is English; a
 * script corrects it in the browser. Search and answer-engine crawlers read the HTML without
 * running scripts, so after the export each localized page's root element is given its own
 * language here, from the same table the app uses (`src/i18n/locales.ts`).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_TAG = /<html lang="en"/;

/** `{ locale: htmlLang }` read from the locale table, so this step never keeps a second copy. */
export function readHtmlLangs(source) {
  const langs = {};
  for (const match of source.matchAll(/(\w+):\s*\{\s*htmlLang:\s*"([^"]+)"/g)) langs[match[1]] = match[2];
  return langs;
}

export function localizeHtml(html, htmlLang) {
  return html.replace(ROOT_TAG, `<html lang="${htmlLang}"`);
}

function htmlFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...htmlFiles(path));
    else if (name.endsWith('.html')) files.push(path);
  }
  return files;
}

export function localizeExport(outDir, langs) {
  let changed = 0;
  for (const [locale, htmlLang] of Object.entries(langs)) {
    if (htmlLang === 'en') continue;
    let directory;
    try {
      if (!statSync(join(outDir, locale)).isDirectory()) continue;
      directory = join(outDir, locale);
    } catch {
      continue;
    }
    for (const file of htmlFiles(directory)) {
      const html = readFileSync(file, 'utf8');
      const next = localizeHtml(html, htmlLang);
      if (next !== html) {
        writeFileSync(file, next);
        changed += 1;
      }
    }
  }
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const langs = readHtmlLangs(readFileSync('src/i18n/locales.ts', 'utf8'));
  const changed = localizeExport(process.argv[2] ?? 'out', langs);
  console.log(`[html-lang] ${changed} localized pages declare their own language`);
}
