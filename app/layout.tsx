import type { Metadata, Viewport } from 'next';
import { LangBootScript, JsonLd, WebviewErrorReporter } from '@/shared/ui';
import { GatewayHandOverScript } from '@/app-providers/providers/GatewayHandOverScript';
import { SITE_URL } from '@/shared/config';
import { SITE_NAME, siteEntityGraph } from '@/shared/config/site/site-entity';
import { WEB_CONTENT_SECURITY_POLICY } from '@/shared/config/site/web-content-security-policy';
import { jetbrainsMono, pretendard, pretendardLatinStack } from '@/shared/config/fonts';
import { LOCALE_META } from '@/i18n/locales';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { StandaloneMessagesProvider } from '@/views/terminal-state';
import { ROUTE_ERROR_PICK, pickStandaloneMessages } from '@/i18n/standalone-messages';
// Pretendard's 92 dynamic subsets as one family, `Pretendard Variable`, for Korean pages
// (`app/styles/lang-cjk.css`); a face is fetched only when a page renders one of its characters.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Metadata fields are not auto-prefixed by an optional next.config basePath.
  manifest: withBasePath('/manifest.webmanifest'),
  // Only the fallback: `app/[locale]/layout.tsx` owns the locale-aware title template.
  title: 'Ontology Atlas',
  description: 'Understand what your codebase builds, why it is structured that way, and what a change will affect.',
  keywords: ['Ontology Atlas', 'ontology-atlas', 'codebase ontology', 'ontology', 'knowledge graph', 'markdown', 'frontmatter', 'AI agent', 'MCP', 'topology'],
  authors: [{ name: SITE_NAME, url: `${SITE_URL}/` }],
  // Not hardcoded: a fork shipping this site's verification code would block its own Console
  // registration. Unset, the tag is not emitted.
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } }
      : {}),
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Ontology Atlas',
    title: 'Ontology Atlas',
    description: 'Understand what your codebase builds, why it is structured that way, and what a change will affect.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Ontology Atlas',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ontology Atlas',
    description: 'Understand what your codebase builds, why it is structured that way, and what a change will affect.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
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
        <StandaloneMessagesProvider messages={pickStandaloneMessages(ROUTE_ERROR_PICK)}>
          {children}
        </StandaloneMessagesProvider>
      </body>
    </html>
  );
}
