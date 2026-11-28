import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

import { buildBootScript } from '../../src/i18n/boot-script';
import { LOCALE_META } from '../../src/i18n/locales';
import { routing } from '../../src/i18n/routing';
import { WEB_CONTENT_SECURITY_POLICY } from '../../src/shared/config/site/web-content-security-policy';

const BOOT_SCRIPT_MARK = '<!--atlas:boot-script-->';
const LOADING_PICTURE_MARK = '<!--atlas:loading-picture-->';
const BOOT_CSS_ID = 'virtual:atlas-boot.css';
const STORAGE_KEY = 'ontology-atlas:locale';

type LocaleCode = keyof typeof LOCALE_META;

interface LoadingWords {
  title: string;
  detail: string;
}

function readLoadingWords(root: string, code: string): LoadingWords {
  const file = path.join(root, 'messages', code, 'mapEntry.json');
  const { mapComing, loadingDetail } = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  if (!mapComing || !loadingDetail) throw new Error(`${file} lacks mapComing or loadingDetail`);
  return { title: mapComing, detail: loadingDetail };
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One span per language; `bootPictureCss` shows the one that matches `<html lang>`. */
function inLanguages(words: Record<string, string>) {
  return Object.entries(words)
    .map(([code, text]) => `<span data-boot-lang="${code}" lang="${LOCALE_META[code as LocaleCode].htmlLang}">${escapeHtml(text)}</span>`)
    .join('');
}

const ORBIT_POINTS = [
  [35, 41, 1.4],
  [54, 72, 1.1],
  [72, 30, 1.2],
  [106, 25, 1],
  [121, 68, 1.35],
  [145, 43, 1.05],
] as const;

/** The map's loading mark and words, the picture the installed app shows from its first frame. */
function loadingPicture(words: Record<string, LoadingWords>) {
  const titles = Object.fromEntries(Object.entries(words).map(([code, { title }]) => [code, title]));
  const details = Object.fromEntries(Object.entries(words).map(([code, { detail }]) => [code, detail]));
  const rings = [-24, 42, 110]
    .map(
      (angle, index) =>
        `<g transform="translate(180 120) rotate(${angle})"><ellipse rx="${84 + index * 14}" ry="${30 + index * 5}" stroke="var(--color-indigo-line-a32)"/>` +
        `<g transform="scale(1 0.36)"><g class="map-wait-orbit map-wait-orbit-${index}"><circle cx="${84 + index * 14}" r="5" fill="var(--color-indigo-text-soft)"/>` +
        `<circle cx="${84 + index * 14}" r="13" fill="var(--color-indigo-line-a13)"/></g></g></g>`,
    )
    .join('');
  const points = ORBIT_POINTS.map(
    ([cx, cy, radius]) => `<circle class="map-wait-point" cx="${cx * 2}" cy="${cy * 2}" r="${radius}" fill="var(--color-text-quaternary)"/>`,
  ).join('');
  return [
    '<div id="boot" class="fixed inset-0 z-[var(--z-dialog)] bg-[color:var(--color-canvas)]">',
    '<main id="main" tabindex="-1" data-route-loading="true" data-testid="map-entry-fallback" class="relative flex h-full min-h-full flex-1 bg-[color:var(--color-canvas)]">',
    '<div class="pointer-events-none absolute inset-0 grid place-items-center">',
    '<div data-wait-stage="" data-map-loading-layout="centered" role="status" class="pointer-events-auto map-overlay-in flex w-[min(26rem,calc(100%-3rem))] flex-col items-center text-center">',
    '<div aria-hidden="true" data-testid="map-wait-cluster" data-map-wait-motion="running" class="map-wait-cluster relative h-56 w-80 max-w-full"><span class="map-wait-halo absolute inset-0"></span>',
    '<svg class="absolute inset-0 size-full" viewBox="0 0 360 240" fill="none">',
    '<defs><radialGradient id="boot-glow"><stop stop-color="var(--color-indigo-text-soft)" stop-opacity="0.65"/><stop offset="0.18" stop-color="var(--color-indigo-accent)" stop-opacity="0.22"/><stop offset="1" stop-color="var(--color-indigo-accent)" stop-opacity="0"/></radialGradient></defs>',
    '<ellipse cx="180" cy="120" rx="138" ry="80" fill="url(#boot-glow)"/>',
    rings,
    points,
    '<circle cx="180" cy="120" r="20" fill="var(--color-indigo-line-a06)"/><circle cx="180" cy="120" r="7" fill="var(--color-indigo-text-soft)"/><circle cx="180" cy="120" r="3" fill="var(--color-text-primary)"/>',
    '<path d="M180 98V142M158 120H202" stroke="var(--color-indigo-text-soft)" stroke-width="0.7"/>',
    '</svg></div>',
    `<p class="mt-5 break-words text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">${inLanguages(titles)}</p>`,
    `<p class="mt-1.5 break-keep text-body text-[color:var(--color-text-tertiary)]">${inLanguages(details)}</p>`,
    '</div></div></main></div>',
  ].join('');
}

/** `<html lang>` carries the language; a bare prefix match covers `zh-Hans`. */
function bootPictureCss(codes: readonly string[]): string {
  const shown = codes.map((code) => `html:lang(${code}) [data-boot-lang="${code}"]`).join(',');
  return `[data-boot-lang]{display:none}${shown}{display:inline}`;
}

export function listLocaleCodes(root: string): string[] {
  const declared = new Set<string>(routing.locales);
  const codes = fs
    .readdirSync(path.join(root, 'messages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && declared.has(entry.name))
    .map((entry) => entry.name);
  if (codes.length === 0) throw new Error('no language folder under messages/');
  return codes;
}

/** The loading picture in every language the project has, for a document that is not `index.html`. */
export function loadingPictureFor(root: string): string {
  return loadingPicture(Object.fromEntries(listLocaleCodes(root).map((code) => [code, readLoadingWords(root, code)])));
}

/** The one inline script of a document: the window's language, the installed app and the text size, before first paint. */
export function bootScriptFor(codes: readonly string[]): string {
  return buildBootScript({
    htmlLang: Object.fromEntries(codes.map((code) => [code, LOCALE_META[code as LocaleCode].htmlLang])),
    defaultLocale: routing.defaultLocale,
    storageKey: STORAGE_KEY,
  });
}

/**
 * Fills the two marks of `index.html`: the boot script, and the loading picture in every language.
 * The picture's words are the `mapEntry` messages; its stylesheet is a virtual module so the list of
 * languages is written once, in `messages/`, and CSS reaches the page as a file, never an inline style.
 */
export function atlasIndexHtml(root: string): Plugin {
  const codes = listLocaleCodes(root);
  return {
    name: 'atlas-index-html',
    resolveId: (id) => (id === BOOT_CSS_ID ? `\0${BOOT_CSS_ID}` : null),
    load: (id) => (id === `\0${BOOT_CSS_ID}` ? bootPictureCss(codes) : null),
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const script = bootScriptFor(codes);
        const words = Object.fromEntries(codes.map((code) => [code, readLoadingWords(root, code)]));
        const page = html
          .replace(BOOT_SCRIPT_MARK, `<script>${script}</script>`)
          .replace(LOADING_PICTURE_MARK, loadingPicture(words));
        // The built document states its own policy, as the website's export does; the dev server's
        // hot-reload client would break under it.
        if (context.server) return page;
        return {
          html: page,
          tags: [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: WEB_CONTENT_SECURITY_POLICY },
              injectTo: 'head-prepend' as const,
            },
          ],
        };
      },
    },
  };
}
