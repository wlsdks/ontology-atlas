import { createElement, lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { describe, expect, it } from 'vitest';

import { MetadataTags } from '../../../src/app/routes/-site/metadata-tags';
import { SiteDocument, type SiteDocumentProps } from '../../../scripts/web/site/SiteDocument';

/**
 * The prerender leans on one React 19 behaviour: a `<title>`, `<meta>` or `<link>` rendered anywhere below a
 * full `<html>` document is written into its `<head>`. If a React upgrade stopped hoisting, every page would
 * keep its tags in the body, where a crawler ignores them and the policy meta stops covering the scripts. The
 * probe renders the real document around a page that states its head in its body and reads where each tag landed.
 */

const assets = { stylesheets: ['/assets/app.css'], entryScript: '/assets/app.js', preloadedModules: ['/assets/chunk.js'] };

/** The website's document around `children`; the props are the document's, the children are passed the way createElement takes them. */
const documentAround = (props: Omit<SiteDocumentProps, 'children'>, child: ReactNode) =>
  createElement(SiteDocument, props as SiteDocumentProps, child);

async function render(element: ReactElement): Promise<string> {
  const { prelude } = await prerenderToNodeStream(element, { progressiveChunkSize: Number.POSITIVE_INFINITY });
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const page = () =>
  render(
    documentAround(
      {
        locale: 'en',
        assets,
        bootScript: 'document.documentElement.dataset.boot = "1";',
        entry: { recordedFacts: {}, hydratesPath: '/en/guide/' },
        head: createElement(MetadataTags, {
          resolved: { title: 'Guide · Atlas', metadata: { description: 'Reads the guide' } },
        }),
      },
      createElement('main', null, createElement('h1', null, 'Guide')),
    ),
  );

describe('React hoists a page head into the document head', () => {
  it('writes the title and meta tags inside <head>, once, and none in <body>', async () => {
    const html = await page();
    const [head = '', body = ''] = html.split('</head>');
    expect(head).toContain('<title>Guide · Atlas</title>');
    expect(head).toContain('<meta name="description" content="Reads the guide"/>');
    expect(body).not.toMatch(/<(title|meta)\b/);
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it('puts charset and the policy meta before every script and stylesheet', async () => {
    const html = await page();
    const policy = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(html.indexOf('<meta charSet="utf-8"/>')).toBeLessThan(policy);
    expect(policy).toBeGreaterThan(-1);
    for (const asset of ['<script', 'rel="stylesheet"', 'rel="modulepreload"']) {
      expect(html.indexOf(asset)).toBeGreaterThan(policy);
    }
  });

  it('writes a large suspended boundary in place, with no hidden segment a script would move into place', async () => {
    const Chapter = lazy(async () => ({
      default: () => createElement('article', null, Array.from({ length: 4000 }, (_, index) => createElement('p', { key: index }, `Line ${index} of a long chapter`))),
    }));
    const html = await render(
      documentAround({ locale: 'en', assets, bootScript: '' }, createElement(Suspense, { fallback: 'Loading' }, createElement(Chapter))),
    );
    expect(html).not.toContain('hidden=""');
    expect(html).not.toContain('<template');
    expect(html).toContain('Line 3999 of a long chapter');
  });
});
