import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { compareSites } from '../../../scripts/web/site/diff-site-pages.mjs';

/**
 * The page-by-page diff is only worth its exit code if it goes red when a Vite page loses something the
 * Next page has. These tests plant exactly that in a pair of small folders: the policy meta, a link, a
 * word of text. A diff that stayed green on any of them would let the real comparison pass by being blind.
 */

const POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'"/>`;
const BOOT = `<script>try{document.documentElement.setAttribute("data-shell","desktop")}catch(e){}</script>`;
const jsonLd = (modified = '2026-11-01') =>
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'Atlas', dateModified: modified })}</script>`;

interface PageOptions {
  side?: 'next' | 'vite';
  policy?: string;
  description?: string;
  link?: string;
  text?: string;
  headExtra?: string;
  boot?: string;
  ld?: string;
}

/** A page as one side writes it: that side's own bundle script, the boot script, and the page's JSON-LD. */
const page = ({
  side = 'vite',
  policy = POLICY,
  description = 'Ships a map',
  link = '/en/guide/',
  text = 'Hello reader',
  headExtra = '',
  boot = BOOT,
  ld = jsonLd(),
}: PageOptions = {}) => {
  const bundle = side === 'next' ? '<script src="/_next/static/chunks/main.js" async=""></script>' : '<script src="/assets/entry.js" type="module"></script>';
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>${policy}<title>Atlas</title>` +
    `<meta name="description" content="${description}"/>${boot}${bundle}${headExtra}</head>` +
    `<body><div id="root"><p>${text}</p><a href="${link}">Guide</a></div>${ld}</body></html>`
  );
};

const sameFiles = { 'robots.txt': 'User-agent: *\n', 'sitemap.xml': '<urlset/>', 'llms.txt': 'Atlas', 'llms-full.txt': 'Atlas, in full' };

const folders: string[] = [];

function writeSite(pages: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), 'site-diff-'));
  folders.push(folder);
  for (const [path, text] of Object.entries({ ...sameFiles, ...pages })) {
    const target = join(folder, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, text);
  }
  return folder;
}

const differencesBetween = (next: string, vite: string) =>
  compareSites({ nextFolder: writeSite({ 'en/download/index.html': next }), viteFolder: writeSite({ 'en/download/index.html': vite }) }).differences.map(
    (difference: { aspect: string }) => difference.aspect,
  );
const nextPage = (options: PageOptions = {}) => page({ ...options, side: 'next' });

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('page-by-page diff of the Vite prerender against the Next export', () => {
  it("reads two equal pages as equal, each with its own bundle's script", () => {
    expect(differencesBetween(nextPage(), page())).toEqual([]);
  });

  it('goes red when a Vite page loses its policy meta', () => {
    expect(differencesBetween(nextPage(), page({ policy: '' }))).toContain('policy meta');
  });

  it('goes red when the policy meta comes after a script', () => {
    const late = page({ policy: '' }).replace('</head>', `${POLICY}</head>`);
    expect(differencesBetween(nextPage(), late)).toContain('policy meta order');
  });

  it.each([
    ['a head tag changes', page({ description: 'Ships a different map' }), 'head element missing in Vite'],
    ['a link changes', page({ link: '/en/changelog/' }), 'a[href] attributes'],
    ['the visible text changes', page({ text: 'Hello again' }), 'visible text'],
  ])('goes red when %s', (_name, vite, aspect) => {
    expect(differencesBetween(nextPage(), vite)).toContain(aspect);
  });

  it.each([
    ['a script from another site is planted', page({ headExtra: '<script src="https://evil.example/x.js"></script>' }), 'script only in Vite'],
    ['an inline script nobody wrote is planted', page({ headExtra: '<script>steal()</script>' }), 'script only in Vite'],
    ['the boot script is deleted', page({ boot: '' }), 'boot script'],
    ['the JSON-LD loses dateModified', page({ ld: jsonLd().replace(/,"dateModified":"[^"]*"/, '') }), 'JSON-LD'],
    ['a stylesheet from another site is linked', page({ headExtra: '<link rel="stylesheet" href="https://evil.example/x.css"/>' }), 'head element only in Vite'],
    ["a preload of another site's script is linked", page({ headExtra: '<link rel="preload" as="script" href="https://evil.example/x.js"/>' }), 'head element only in Vite'],
  ])('goes red when %s', (_name, vite, aspect) => {
    expect(differencesBetween(nextPage(), vite)).toContain(aspect);
  });

  it('reads JSON-LD blocks by their content, not by key order', () => {
    const reordered = page({
      ld: `<script type="application/ld+json">{"dateModified":"2026-11-01","headline":"Atlas","@type":"TechArticle","@context":"https://schema.org"}</script>`,
    });
    expect(differencesBetween(nextPage(), reordered)).toEqual([]);
  });

  it('goes red when a crawler file differs by one byte', () => {
    const next = writeSite({ 'en/download/index.html': nextPage() });
    const vite = writeSite({ 'en/download/index.html': page(), 'robots.txt': 'User-agent: *\n\n' });
    expect(compareSites({ nextFolder: next, viteFolder: vite }).differences.map((difference: { page: string }) => difference.page)).toEqual([
      'robots.txt',
    ]);
  });
});
