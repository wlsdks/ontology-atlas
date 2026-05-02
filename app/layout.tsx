import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { SITE_URL } from '@/shared/config';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  axes: ['opsz'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Title template is owned by app/[locale]/layout.tsx so the locale-aware
  // string ends up in <title>. We only set a fallback default here for the
  // root `/` redirect page (which the user sees for ~50ms before redirect).
  title: 'oh-my-ontology',
  description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault. Markdown frontmatter is the graph.',
  keywords: ['oh-my-ontology', 'ontology', 'knowledge graph', 'markdown', 'frontmatter', 'AI agent', 'MCP', 'topology'],
  authors: [{ name: 'oh-my-ontology contributors' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'oh-my-ontology',
    title: 'oh-my-ontology',
    description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'oh-my-ontology',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'oh-my-ontology',
    description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png' }],
    apple: '/logo.png',
  },
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full overflow-x-hidden`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('demo:theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col overflow-x-hidden pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        <link rel="preconnect" href="https://firestore.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebaseinstallations.googleapis.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'oh-my-ontology',
              alternateName: 'oh-my-ontology',
              url: SITE_URL,
              description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault.',
              inLanguage: ['en', 'ko'],
              publisher: {
                '@type': 'Organization',
                name: 'oh-my-ontology',
              },
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
