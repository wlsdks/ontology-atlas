import type { Metadata, Viewport } from 'next';
import { AccentBootScript, JsonLd, WebviewErrorReporter } from '@/shared/ui';
import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { SITE_URL } from '@/shared/config';
import { withBasePath } from '@/shared/lib/base-path';
import './globals.css';

// Owner report (2026-07-23): only Inter's latin subset loaded, so Korean fell back to the system
// font (Apple SD Gothic) — the mismatched weight and x-height against latin and digits made button
// labels look "off". Pretendard is a Korean face designed metric-compatible with Inter, so the
// latin look is preserved while mixed Korean/English renders as one family. Self-hosted (an npm
// package, zero CDN — local-first).
const pretendard = localFont({
  src: '../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Metadata fields are not auto-prefixed by an optional next.config basePath.
  manifest: withBasePath('/manifest.webmanifest'),
  // Title template is owned by app/[locale]/layout.tsx so the locale-aware
  // string ends up in <title>. We only set a fallback default here for the
  // root `/` redirect page (which the user sees for ~50ms before redirect).
  title: 'Ontology Atlas',
  description: 'Understand what your codebase builds, why it is structured that way, and what a change will affect.',
  keywords: ['Ontology Atlas', 'ontology-atlas', 'codebase ontology', 'ontology', 'knowledge graph', 'markdown', 'frontmatter', 'AI agent', 'MCP', 'topology'],
  authors: [{ name: 'ontology-atlas contributors' }],
  /**
   * Search Console ownership verification — **the value comes from an environment variable.**
   *
   * A GitHub Pages project site (`user.github.io/repo/`) cannot use DNS verification (that domain
   * is not ours). Of the two remaining methods, this meta tag is the one that does not require
   * committing a file to the repository.
   *
   * The code is **not a secret, but it is not a fact about this repository either** — a fork
   * shipping our verification code on their site blocks their own Console registration. So it is
   * injected by the build environment rather than hardcoded. Unset, the tag is not emitted at all.
   */
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
  // The favicon and Apple touch icon are picked up automatically by the Next.js file convention
  // (app/icon.png, app/apple-icon.png) — declaring them again here produced a duplicate
  // <link rel="icon">, so it was removed.
};

export const viewport: Viewport = {
  themeColor: '#08090a',
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
      suppressHydrationWarning
    >
      {/* The tab-bar reserve padding (pb-56px) was removed (2026-08-08) — it is a relic of the
          document-scroll era, before the shell owned the viewport with `h-dvh`. That padding now
          protects nothing while creating 56px of dead document scroll on every page below `md`.
          The tab-bar reserve is owned by each page's scrolling surface
          (`.claude/rules/design.md`), not by body.
          Gates: document-scroll-lock.spec.ts + scroll-end-gap.spec.ts. */}
      <body className="flex min-h-full flex-col overflow-x-hidden">
        {/* Plants the accent palette before the first paint (2026-08-18). The record of three
            attempted placements, and why `next/script`, is in that component's comments. The server
            does not know `data-accent`, so `<html>` needs `suppressHydrationWarning` — an
            intentional mismatch limited to one attribute. */}
        <AccentBootScript />
        {/* Forwards a WebView script error or unhandled rejection to the app log. Inside the
            installed app nobody is watching a console, so without this a panel that dies in an
            async callback leaves no trace at all. No-op in a browser. */}
        <WebviewErrorReporter />
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Ontology Atlas',
            alternateName: 'ontology-atlas',
            url: SITE_URL,
            description:
              'Understand what your codebase builds, why it is structured that way, and what a change will affect.',
            inLanguage: ['en', 'ko'],
            publisher: {
              '@type': 'Organization',
              name: 'ontology-atlas contributors',
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
