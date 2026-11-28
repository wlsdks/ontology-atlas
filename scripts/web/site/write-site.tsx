import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { IntlProvider } from 'use-intl';

import { routing } from '@/i18n/routing';
import { loadWorkbenchCatalog } from '@/i18n/workbench-catalog';
import type { AppLocale } from '@/i18n/locales';
import { LocaleRedirect } from '@/shared/ui/routing/locale-redirect';
import { GatewayEntryFallback } from '@/shared/ui/fallbacks/gateway-entry-fallback';
import { AppOnlyPage } from '@/views/app-only';
import { absoluteUrl } from '@/shared/config';
import { SiteDocument, type SiteAssets, type SiteDocumentPage } from '../../../src/app/document/SiteDocument';
import { APP_ONLY_FACE_CLASS, workbenchFaceClass } from '../../../src/app/providers/AppAddressFaces';
import { createAtlasRouter } from '../../../src/app/router/create-atlas-router';
import { MetadataTags } from '../../../src/app/routes/-site/metadata-tags';
import { messageReader, screenMetadata, siteMetadata } from '../../../src/app/routes/-site/screen-metadata';
import { bootScriptFor, listLocaleCodes, loadingPictureFor } from '../../vite/atlas-index-html';
import { listSitePages, type SitePage } from './list-site-pages';
import { llmsFullTxt, llmsTxt } from './llms';
import { recordBuildFacts } from './record-build-facts';
import { robotsTxt } from './robots';
import { rootRedirectScript } from './root-redirect-script';
import { sitemapEntries, sitemapXml } from './sitemap';

export type { SiteAssets } from '../../../src/app/document/SiteDocument';

/** The files every page links, and what a page adds for the routes it renders (`read-site-assets.mjs`). */
export interface SiteAssetsReader extends SiteAssets {
  forRoutes(routeIds: string[]): SiteAssets;
}

/** One written file: its path inside the site folder, with `/` on every platform, and its text. */
export interface SiteFile {
  path: string;
  text: string;
}

async function renderToHtml(element: ReactElement): Promise<string> {
  // Without a limit React sets a large boundary aside as a hidden segment that a script moves into place, which a
  // reader without scripts would never see.
  const { prelude } = await prerenderToNodeStream(element, { progressiveChunkSize: Number.POSITIVE_INFINITY });
  const chunks: Buffer[] = [];
  for await (const chunk of prelude) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

interface WriterContext {
  root: string;
  assets: SiteAssetsReader;
  bootScript: string;
  loadingPicture: string;
}

const matchedRoutes = (router: ReturnType<typeof createAtlasRouter>) => router.state.matches.map((match) => match.routeId as string);

const documentPage = (
  locale: AppLocale,
  context: WriterContext,
  entry?: SiteDocumentPage['entry'],
  routeIds: string[] = [],
): SiteDocumentPage => ({ locale, assets: context.assets.forRoutes(routeIds), bootScript: context.bootScript, ...(entry ? { entry } : {}) });

/** A page of the public site: loaded through the router, written with the record of what the build knew, hydrated in the browser. */
async function writeRouterPage(page: Extract<SitePage, { kind: 'router' }>, context: WriterContext): Promise<string> {
  const { facts, recorded } = recordBuildFacts();
  const router = createAtlasRouter({ history: createMemoryHistory({ initialEntries: [page.path] }), buildFacts: facts });
  await router.load();
  const failed = router.state.matches.find((match) => match.status !== 'success');
  if (failed) throw new Error(`${page.path} did not load: ${failed.routeId} is ${failed.status}${failed.error ? ` (${String(failed.error)})` : ''}`);
  return renderToHtml(
    <SiteDocument page={documentPage(page.locale, context, { recordedFacts: recorded, hydratesPath: page.path }, matchedRoutes(router))}>
      <RouterProvider router={router} />
    </SiteDocument>,
  );
}

/**
 * An address of the installed app, as a browser opens it: the page that says the app is needed, and beside it the
 * loading picture the app paints first. Neither runs a screen, so the map never runs in Node and the page needs no
 * script. `AppAddressFaces` shows one face by `data-shell` before the first paint.
 */
async function writeAppAddress(page: Extract<SitePage, { kind: 'app-address' | 'locale-entry' }>, context: WriterContext): Promise<string> {
  const messages = await loadWorkbenchCatalog(page.locale);
  const resolved = screenMetadata(page.head, page.locale, messageReader(page.locale, messages));
  const atEntry = page.kind === 'locale-entry';
  return renderToHtml(
    <SiteDocument page={documentPage(page.locale, context)} head={<MetadataTags resolved={resolved} />}>
      {atEntry ? (
        <div data-face="workbench" className={workbenchFaceClass(true)}>
          <IntlProvider locale={page.locale} messages={{ download: messages.download }} timeZone="UTC">
            <GatewayEntryFallback locale={page.locale} />
          </IntlProvider>
        </div>
      ) : (
        <>
          <div data-face="app-only" className={APP_ONLY_FACE_CLASS}>
            <IntlProvider locale={page.locale} messages={{ appOnly: messages.appOnly }} timeZone="UTC">
              <AppOnlyPage locale={page.locale} />
            </IntlProvider>
          </div>
          <div data-face="workbench" className={workbenchFaceClass(false)} dangerouslySetInnerHTML={{ __html: context.loadingPicture }} />
        </>
      )}
    </SiteDocument>,
  );
}

/** `/`: it decides the language and nothing else; query and hash carry deep links and arrive unchanged. */
function writeRoot(context: WriterContext): Promise<string> {
  const defaultLocale = routing.defaultLocale as AppLocale;
  const metadata = { ...siteMetadata(), alternates: { canonical: absoluteUrl(`/${defaultLocale}/download/`) } };
  return renderToHtml(
    <SiteDocument
      page={documentPage(defaultLocale, context)}
      head={<MetadataTags resolved={{ metadata, title: 'Ontology Atlas' }} />}
      inlineScript={rootRedirectScript()}
    >
      <LocaleRedirect />
    </SiteDocument>,
  );
}

/**
 * The page any unknown address is served: a hosted site answers every missing path with this file, so it
 * cannot know the address it stands at and the browser renders the router at the real one instead of hydrating.
 */
async function writeNotFound(context: WriterContext): Promise<string> {
  const { facts, recorded } = recordBuildFacts();
  const router = createAtlasRouter({ history: createMemoryHistory({ initialEntries: ['/not-found/'] }), buildFacts: facts });
  await router.load();
  const defaultLocale = routing.defaultLocale as AppLocale;
  const metadata = { ...siteMetadata(), robots: { index: false, follow: true } };
  return renderToHtml(
    <SiteDocument
      page={documentPage(defaultLocale, context, { recordedFacts: recorded }, matchedRoutes(router))}
      head={<MetadataTags resolved={{ metadata, title: 'Ontology Atlas' }} />}
    >
      <RouterProvider router={router} />
    </SiteDocument>,
  );
}

const pagePath = (path: string) => (path === '/' ? 'index.html' : `${path.slice(1)}index.html`);

/**
 * The whole website as files: one HTML page for every address the router holds, the root and the 404 page,
 * and the four text files crawlers read. Nothing here touches the disk, so a test can read any page.
 */
export async function writeSite({ root, assets }: { root: string; assets: SiteAssetsReader }): Promise<SiteFile[]> {
  const context: WriterContext = {
    root,
    assets,
    bootScript: bootScriptFor(listLocaleCodes(root)),
    loadingPicture: loadingPictureFor(root),
  };
  const router = createAtlasRouter({ history: createMemoryHistory({ initialEntries: ['/'] }) });
  // Together, not one after another: most of a page's wait is Git answering when its source was changed, and
  // those questions run as processes beside the one that renders.
  const files: SiteFile[] = await Promise.all(
    listSitePages(router).map(async (page) => ({
      path: pagePath(page.path),
      text: page.kind === 'router' ? await writeRouterPage(page, context) : await writeAppAddress(page, context),
    })),
  );
  files.push(
    { path: pagePath('/'), text: await writeRoot(context) },
    { path: '404.html', text: await writeNotFound(context) },
    { path: 'sitemap.xml', text: sitemapXml(sitemapEntries()) },
    { path: 'robots.txt', text: robotsTxt() },
    { path: 'llms.txt', text: llmsTxt() },
    { path: 'llms-full.txt', text: llmsFullTxt() },
  );
  return files;
}
