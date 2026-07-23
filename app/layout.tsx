import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { SITE_URL } from '@/shared/config';
import { withBasePath } from '@/shared/lib/base-path';
import './globals.css';

// 소유자 실보고 (2026-07-23): Inter latin 서브셋만 로드되어 한글이 시스템
// 폴백(Apple SD Gothic)으로 떨어짐 — 라틴/숫자와 한글의 굵기·x-height 가
// 어긋나 버튼 라벨이 "이상하게" 보였다. Pretendard 는 Inter 와 메트릭
// 호환으로 설계된 한글 폰트라 라틴 룩은 유지하면서 한·영 혼용이 한 가족으로
// 렌더된다. 셀프호스팅(npm 패키지, CDN 0 — local-first).
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
  // metadata 필드는 next.config basePath 자동 프리픽스 대상이 아니다.
  manifest: withBasePath('/manifest.webmanifest'),
  // Title template is owned by app/[locale]/layout.tsx so the locale-aware
  // string ends up in <title>. We only set a fallback default here for the
  // root `/` redirect page (which the user sees for ~50ms before redirect).
  title: 'Ontology Atlas',
  description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault. Markdown frontmatter is the graph.',
  keywords: ['Ontology Atlas', 'ontology-atlas', 'ontology', 'knowledge graph', 'markdown', 'frontmatter', 'AI agent', 'MCP', 'topology'],
  authors: [{ name: 'ontology-atlas contributors' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Ontology Atlas',
    title: 'Ontology Atlas',
    description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault.',
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
    description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  // 파비콘/애플 터치 아이콘은 Next.js 파일 컨벤션(app/icon.svg,
  // app/apple-icon.png)이 자동으로 잡는다 — 여기서 다시 선언하면 <link
  // rel="icon"> 중복이 생겨 제거. 새 브랜드 마크(헥사 별자리, 후보 A)로 교체.
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
    >
      <body className="flex min-h-full flex-col overflow-x-hidden pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Ontology Atlas',
              alternateName: 'ontology-atlas',
              url: SITE_URL,
              description: 'AI-native codebase ontology workbench. Humans and AI agents author the same vault.',
              inLanguage: ['en', 'ko'],
              publisher: {
                '@type': 'Organization',
                name: 'ontology-atlas contributors',
              },
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
