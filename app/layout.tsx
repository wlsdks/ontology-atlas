import type { Metadata, Viewport } from 'next';
import { LangBootScript, JsonLd, WebviewErrorReporter } from '@/shared/ui';
import { GatewayHandOverScript } from '@/app-providers/providers/GatewayHandOverScript';
import { SITE_URL } from '@/shared/config';
import { siteEntityGraph } from '@/shared/config/site/site-entity';
import { WEB_CONTENT_SECURITY_POLICY } from '@/shared/config/site/web-content-security-policy';
import { jetbrainsMono, pretendard, pretendardLatinStack } from '@/shared/config/fonts';
import { LOCALE_META } from '@/i18n/locales';
import { siteMetadata } from '@/shared/lib/public-pages/site-metadata';
import { StandaloneMessagesProvider } from '@/views/terminal-state';
import { ROUTE_ERROR_MESSAGES } from '@/i18n/route-error-messages';
// Pretendard's 92 dynamic subsets as one family, `Pretendard Variable`, for Korean pages
// (`app/styles/lang-cjk.css`); a face is fetched only when a page renders one of its characters.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Only the fallback: `app/[locale]/layout.tsx` owns the locale-aware title template.
  ...siteMetadata(),
};

export const viewport: Viewport = {
  themeColor: '#0b0b0a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${pretendard.variable} ${jetbrainsMono.variable} h-full overflow-x-hidden`}
      // The Latin subsets are one family per file, so their stack is composed here (`fonts.ts`).
      style={{ '--font-pretendard-latin': pretendardLatinStack } as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        {process.env.NODE_ENV === 'production' ? (
          <meta httpEquiv="Content-Security-Policy" content={WEB_CONTENT_SECURITY_POLICY} />
        ) : null}
      </head>
      {/* The tab-bar reserve is owned by each page's scrolling surface (`.claude/rules/design.md`), not
         by body; padding here would add dead document scroll. */}
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <LangBootScript />
        <GatewayHandOverScript />
        <WebviewErrorReporter />
        <JsonLd data={siteEntityGraph(Object.values(LOCALE_META).map((meta) => meta.htmlLang))} />
        {/* The root error boundary replaces the locale layout, so its copy is handed down as props; a client import of the message files would ship them all in every page. */}
        <StandaloneMessagesProvider messages={ROUTE_ERROR_MESSAGES}>
          {children}
        </StandaloneMessagesProvider>
      </body>
    </html>
  );
}
