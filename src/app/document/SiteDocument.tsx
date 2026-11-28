import type { ReactNode } from 'react';

import { LOCALE_META, type AppLocale } from '@/i18n/locales';
import { siteEntityGraph } from '@/shared/config/site/site-entity';
import { WEB_CONTENT_SECURITY_POLICY } from '@/shared/config/site/web-content-security-policy';
import { JsonLd, serializeJsonForHtml } from '@/shared/ui/document/json-ld';

import { workbenchFaceClass } from '../providers/app-address-face-class';
import type { RecordedFacts } from '../routes/-site/build-facts';

/** The files the client build wrote that a page links: its stylesheets, its entry script and what that script imports first. */
export interface SiteAssets {
  stylesheets: readonly string[];
  entryScript: string;
  preloadedModules: readonly string[];
  /** The script an app address carries instead of the entry: it runs no screen. */
  oldFolderCleanupScript: string;
}

/**
 * Everything a page's document is made of besides the screen: what the prerender knew when it wrote the page.
 * A page that runs in the browser carries this record in itself (`EMBEDDED_PAGE_ID`), so the browser renders
 * the same document around the same screen, which is what lets React adopt the whole document.
 */
export interface SiteDocumentPage {
  locale: AppLocale;
  assets: SiteAssets;
  bootScript: string;
  /**
   * A page that runs in the browser carries the entry script and the record of what the build knew. It
   * hydrates only at the address it was written for: a 404 page is served at any address, so it does not.
   */
  entry?: { recordedFacts: RecordedFacts; hydratesPath?: string };
}

export interface SiteDocumentProps {
  page: SiteDocumentPage;
  /** The page's own head: React hoists a `<title>`, `<meta>` or `<link>` found anywhere below into `<head>`. */
  head?: ReactNode;
  /** Script that must run in the page itself, after the boot script has chosen the language. */
  inlineScript?: string;
  /** The loading picture an app address shows to the installed app in the workbench's place, as the HTML `index.html` holds. */
  loadingPicture?: string;
  children: ReactNode;
}

/** The id of the script that carries a page's `SiteDocumentPage`. */
export const EMBEDDED_PAGE_ID = 'atlas-page';

/** The icons `app/` holds beside its routes; each page names them in `<head>`. */
const SITE_ICONS = [
  { rel: 'icon', href: '/favicon.ico', sizes: '256x256', type: 'image/x-icon' },
  { rel: 'icon', href: '/icon.png', sizes: '512x512', type: 'image/png' },
  { rel: 'apple-touch-icon', href: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
] as const;

/**
 * The document every website page shares, written by the prerender and rendered again by the browser around
 * the same screen. Charset, the content security policy and the viewport come first in `<head>`, before any
 * script or stylesheet, so the policy covers everything that follows; the page's own head follows them. The
 * body's one `#root` holds what the router renders.
 */
export function SiteDocument({ page, head, inlineScript, loadingPicture, children }: SiteDocumentProps) {
  const { locale, assets, bootScript, entry } = page;
  return (
    <html lang={LOCALE_META[locale].htmlLang} className="h-full overflow-x-hidden">
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
        <script type="module" defer src={entry ? assets.entryScript : assets.oldFolderCleanupScript} />
        {entry ? assets.preloadedModules.map((href) => <link key={href} rel="modulepreload" href={href} />) : null}
      </head>
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <JsonLd data={siteEntityGraph(Object.values(LOCALE_META).map((meta) => meta.htmlLang))} />
        <div id="root" className="contents" {...(entry?.hydratesPath ? { 'data-prerendered': entry.hydratesPath } : {})}>
          {children}
          {loadingPicture ? <div data-face="workbench" className={workbenchFaceClass(false)} dangerouslySetInnerHTML={{ __html: loadingPicture }} /> : null}
        </div>
        {inlineScript ? <script dangerouslySetInnerHTML={{ __html: inlineScript }} /> : null}
        {entry ? <script id={EMBEDDED_PAGE_ID} type="application/json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(page) }} /> : null}
      </body>
    </html>
  );
}

/** The record a prerendered page carries, or none in the dev server and in a plain `index.html`. */
export function readEmbeddedPage(root: Pick<Document, 'querySelector'> = document): SiteDocumentPage | undefined {
  const text = root.querySelector(`script#${EMBEDDED_PAGE_ID}[type="application/json"]`)?.textContent;
  return text ? (JSON.parse(text) as SiteDocumentPage) : undefined;
}
