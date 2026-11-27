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

const page = ({ policy = POLICY, description = 'Ships a map', link = '/en/guide/', text = 'Hello reader' } = {}) =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>${policy}<title>Atlas</title>` +
  `<meta name="description" content="${description}"/><script src="/entry.js" type="module"></script></head>` +
  `<body><div id="root"><p>${text}</p><a href="${link}">Guide</a></div></body></html>`;

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

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('page-by-page diff of the Vite prerender against the Next export', () => {
  it('reads two equal pages as equal, whatever script each side links', () => {
    expect(differencesBetween(page().replace('/entry.js', '/_next/static/chunks/main.js'), page())).toEqual([]);
  });

  it('goes red when a Vite page loses its policy meta', () => {
    expect(differencesBetween(page(), page({ policy: '' }))).toContain('policy meta');
  });

  it('goes red when the policy meta comes after a script', () => {
    const late = page({ policy: '' }).replace('</head>', `${POLICY}</head>`);
    expect(differencesBetween(page(), late)).toContain('policy meta order');
  });

  it.each([
    ['a head tag changes', page({ description: 'Ships a different map' }), 'head element missing in Vite'],
    ['a link changes', page({ link: '/en/changelog/' }), 'a[href] attributes'],
    ['the visible text changes', page({ text: 'Hello again' }), 'visible text'],
  ])('goes red when %s', (_name, vite, aspect) => {
    expect(differencesBetween(page(), vite)).toContain(aspect);
  });

  it('goes red when a crawler file differs by one byte', () => {
    const next = writeSite({ 'en/download/index.html': page() });
    const vite = writeSite({ 'en/download/index.html': page(), 'robots.txt': 'User-agent: *\n\n' });
    expect(compareSites({ nextFolder: next, viteFolder: vite }).differences.map((difference: { page: string }) => difference.page)).toEqual([
      'robots.txt',
    ]);
  });
});
