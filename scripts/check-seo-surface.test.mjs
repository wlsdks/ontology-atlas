import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateLocaleCluster, evaluateSeoSurface, parseHead } from './check-seo-surface.mjs';

const ORIGIN = 'https://example.test';
const LOCALES = ['en', 'ko'];
const messages = {
  en: { rootEntry: { redirectBody: 'Desktop placeholder.' }, download: { heroTitleLine1: 'Gateway headline.' } },
  ko: { rootEntry: { redirectBody: '데스크톱 자리.' }, download: { heroTitleLine1: '게이트웨이 제목.' } },
};

function alternates(route) {
  return {
    ...Object.fromEntries(LOCALES.map((l) => [l, `${ORIGIN}/${l}/${route}/`])),
    'x-default': `${ORIGIN}/en/${route}/`,
  };
}

function sitemap(routes) {
  const urls = LOCALES.flatMap((locale) =>
    routes.map((route) => {
      const links = Object.entries(alternates(route))
        .map(([lang, href]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${href}" />`)
        .join('');
      return `<url><loc>${ORIGIN}/${locale}/${route}/</loc>${links}</url>`;
    }),
  );
  return `<urlset>${urls.join('')}</urlset>`;
}

function page({ canonical, route, title, description, body = '', robots = 'index, follow' }) {
  const links = route
    ? Object.entries(alternates(route))
        .map(([lang, href]) => `<link rel="alternate" hrefLang="${lang}" href="${href}"/>`)
        .join('')
    : '';
  return `<!doctype html><html><head><title>${title}</title>
<meta name="description" content="${description}"/><meta name="robots" content="${robots}"/>
${canonical ? `<link rel="canonical" href="${canonical}"/>` : ''}${links}</head><body>${body}</body></html>`;
}

function greenExport() {
  const pages = new Map();
  pages.set('/', page({ canonical: `${ORIGIN}/en/download/`, title: 'Root', description: 'Root' }));
  for (const l of LOCALES) {
    const home = { canonical: `${ORIGIN}/${l}/download/`, route: 'download', title: `Home ${l}`, description: `Home ${l}` };
    pages.set(`/${l}/`, page(home));
    pages.set(`/${l}/download/`, page({ ...home, body: `<h1>${messages[l].download.heroTitleLine1}</h1>` }));
    pages.set(
      `/${l}/guide/`,
      page({ canonical: `${ORIGIN}/${l}/guide/`, route: 'guide', title: `Guide ${l}`, description: `Guide ${l}` }),
    );
  }
  pages.set('/404/', page({ title: 'Missing', description: 'Missing', robots: 'noindex' }));
  return { sitemapXml: sitemap(['download', 'guide']), pages, messages };
}

const rules = (input) => [...new Set(evaluateSeoSurface(input).map((f) => f.rule))].sort();

test('a coherent export is green', () => {
  assert.deepEqual(evaluateSeoSurface(greenExport()), []);
});

test('rule 1: a sitemap URL whose canonical points elsewhere fails', () => {
  const input = greenExport();
  input.pages.set('/ko/guide/', page({ canonical: `${ORIGIN}/en/guide/`, route: 'guide', title: 'G', description: 'G' }));
  assert.deepEqual(rules(input), ['1-sitemap-self-canonical', '2-no-foreign-canonical-in-sitemap']);
});

test('rule 1: hreflang that disagrees with the sitemap fails', () => {
  const input = greenExport();
  input.pages.set(
    '/en/guide/',
    page({ canonical: `${ORIGIN}/en/guide/`, title: 'Guide en', description: 'Guide en' }),
  );
  assert.deepEqual(rules(input), ['1-sitemap-self-canonical']);
});

test('rule 1: a noindex sitemap URL fails', () => {
  const input = greenExport();
  input.pages.set(
    '/en/guide/',
    page({ canonical: `${ORIGIN}/en/guide/`, route: 'guide', title: 'Guide en', description: 'Guide en', robots: 'noindex' }),
  );
  assert.deepEqual(rules(input), ['1-sitemap-self-canonical']);
});

test('rule 3: a root without a canonical fails', () => {
  const input = greenExport();
  input.pages.set('/', page({ title: 'Root', description: 'Root' }));
  assert.deepEqual(rules(input), ['3-root-canonical', '6-indexable-has-canonical']);
});

test('rule 4: desktop copy in an indexed page fails, read from the catalog', () => {
  const input = greenExport();
  input.pages.set(
    '/ko/guide/',
    page({ canonical: `${ORIGIN}/ko/guide/`, route: 'guide', title: 'Guide ko', description: 'Guide ko', body: `<div hidden>${messages.ko.rootEntry.redirectBody}</div>` }),
  );
  assert.deepEqual(rules(input), ['4-desktop-copy']);
});

test('rule 4: a canonical home without the gateway headline fails', () => {
  const input = greenExport();
  input.pages.set('/en/download/', page({ canonical: `${ORIGIN}/en/download/`, route: 'download', title: 'Home en', description: 'Home en' }));
  assert.deepEqual(rules(input), ['4-desktop-copy']);
});

test('rule 4: a renamed-away needle fails instead of passing', () => {
  const input = greenExport();
  input.messages = { ...messages, ko: { download: messages.ko.download } };
  assert.deepEqual(rules(input), ['4-desktop-copy']);
});

test('rule 5: an empty sitemap fails', () => {
  const input = greenExport();
  input.sitemapXml = '<urlset></urlset>';
  assert.ok(rules(input).includes('5-sitemap-not-empty'));
});

test('Fix 2 rule: an indexable page without a canonical fails; noindex pages are exempt', () => {
  const input = greenExport();
  input.pages.set('/en/library/', page({ title: 'Library', description: 'Library' }));
  assert.deepEqual(rules(input), ['6-indexable-has-canonical']);
});

test('Fix 3 rule: a repeated or empty description within a locale fails', () => {
  const input = greenExport();
  input.pages.set(
    '/en/guide/',
    page({ canonical: `${ORIGIN}/en/guide/`, route: 'guide', title: 'Guide en', description: 'Home en' }),
  );
  input.pages.set(
    '/ko/guide/',
    page({ canonical: `${ORIGIN}/ko/guide/`, route: 'guide', title: 'Guide ko', description: '' }),
  );
  const failures = evaluateSeoSurface(input).filter((f) => f.rule === '7-unique-title-description');
  assert.equal(failures.length, 2);
});

test('the same text in two locales is not a duplicate', () => {
  const input = greenExport();
  for (const l of LOCALES) {
    input.pages.set(
      `/${l}/guide/`,
      page({ canonical: `${ORIGIN}/${l}/guide/`, route: 'guide', title: 'Guide', description: 'Guide' }),
    );
  }
  assert.deepEqual(evaluateSeoSurface(input), []);
});

test('evaluateLocaleCluster reports a missing x-default', () => {
  const head = parseHead(page({ canonical: `${ORIGIN}/en/guide/`, route: 'guide', title: 't', description: 'd' }));
  const entry = { loc: `${ORIGIN}/en/guide/`, alternates: { en: `${ORIGIN}/en/guide/` } };
  assert.ok(evaluateLocaleCluster({ label: 'x', head, entry }).some((p) => p.includes('x-default')));
});
