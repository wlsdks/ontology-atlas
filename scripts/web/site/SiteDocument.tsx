import type { ReactNode } from 'react';

import { LOCALE_META, type AppLocale } from '@/i18n/locales';
import { siteEntityGraph } from '@/shared/config/site/site-entity';
import { WEB_CONTENT_SECURITY_POLICY } from '@/shared/config/site/web-content-security-policy';
import { JsonLd, serializeJsonForHtml } from '@/shared/ui/document/json-ld';
import { EMBEDDED_FACTS_ID } from '../../../src/app/routes/-site/build-facts';

/** The files the client build wrote that a page links: its stylesheets, its entry script and what that script imports first. */
export interface SiteAssets {
  stylesheets: readonly string[];
  entryScript: string;
  preloadedModules: readonly string[];
}

/** The icons `app/` holds beside its routes; each page names them in `<head>`. */
const SITE_ICONS = [
  { rel: 'icon', href: '/favicon.ico', sizes: '256x256', type: 'image/x-icon' },
  { rel: 'icon', href: '/icon.png', sizes: '512x512', type: 'image/png' },
  { rel: 'apple-touch-icon', href: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
] as const;

export interface SiteDocumentProps {
  locale: AppLocale;
  /** The page's own head: React hoists a `<title>`, `<meta>` or `<link>` found anywhere below into `<head>`. */
  head?: ReactNode;
  assets: SiteAssets;
  bootScript: string;
  /**
   * A page that runs in the browser carries the entry script and the record of what the build knew. It
   * hydrates only at the address it was written for: a 404 page is served at any address, so it does not.
   */
  entry?: { recordedFacts: Record<string, unknown>; hydratesPath?: string };
  /** Script that must run in the page itself, after the boot script has chosen the language. */
  inlineScript?: string;
  children: ReactNode;
}

/**
 * The document every website page shares. Charset, the content security policy and the viewport come first in
 * `<head>`, before any script or stylesheet, so the policy covers everything that follows; the page's own
 * head follows them. The body's one `#root` holds what the router renders, which is what the browser
 * hydrates.
 */
export function SiteDocument({ locale, head, assets, bootScript, entry, inlineScript, children }: SiteDocumentProps) {
  return (
    <html lang={LOCALE_META[locale].htmlLang} className="h-full overflow-x-hidden">
      {/* eslint-disable-next-line @next/next/no-head-element -- this document is written by React's prerender, not by Next */}
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="Content-Security-Policy" content={WEB_CONTENT_SECURITY_POLICY} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0b0a" />
        <meta name="color-scheme" content="dark" />
        {head}
        {SITE_ICONS.map((icon) => (
          <link key={icon.href} {...icon} />
        ))}
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        {assets.stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- a module script is deferred by the browser */}
        {entry ? <script type="module" src={assets.entryScript} /> : null}
        {entry ? assets.preloadedModules.map((href) => <link key={href} rel="modulepreload" href={href} />) : null}
      </head>
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <JsonLd data={siteEntityGraph(Object.values(LOCALE_META).map((meta) => meta.htmlLang))} />
        <div id="root" className="contents" {...(entry?.hydratesPath ? { 'data-prerendered': entry.hydratesPath } : {})}>
          {children}
        </div>
        {inlineScript ? <script dangerouslySetInnerHTML={{ __html: inlineScript }} /> : null}
        {entry ? (
          <script id={EMBEDDED_FACTS_ID} type="application/json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(entry.recordedFacts) }} />
        ) : null}
      </body>
    </html>
  );
}
