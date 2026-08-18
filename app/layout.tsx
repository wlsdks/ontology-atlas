import type { Metadata, Viewport } from 'next';
import { AccentBootScript, JsonLd } from '@/shared/ui';
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
  /**
   * 검색 콘솔 소유권 확인 — **값은 환경변수로 받는다.**
   *
   * GitHub Pages 프로젝트 사이트(`user.github.io/repo/`)는 DNS 확인을 쓸 수
   * 없다(그 도메인이 우리 것이 아니다). 그래서 남는 방법은 둘이고, 이 메타
   * 태그가 그중 파일을 저장소에 커밋하지 않아도 되는 쪽이다.
   *
   * 코드는 **비밀이 아니지만 이 저장소의 사실도 아니다** — 포크한 사람의
   * 사이트에 우리 확인 코드가 박혀 나가면 그쪽 콘솔 등록이 막힌다. 그래서
   * 하드코딩하지 않고 빌드 환경에서 주입한다. 미설정이면 태그 자체가 안 나간다.
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
      suppressHydrationWarning
    >
      {/* 탭바 예약 패딩(pb-56px)을 지웠다 (2026-08-08) — 셸이 `h-dvh` 로
          뷰포트를 소유하기 전(2026-04-30 최초 임포트) 문서 스크롤 시대의
          유산이다. 지금 그 패딩은 아무것도 보호하지 않으면서 `<md` 전 페이지에
          56px 의 죽은 문서 스크롤을 만들었다. 탭바 예약은 각 페이지의 스크롤
          표면이 소유한다(.claude/rules/design.md) — body 가 아니다.
          게이트: document-scroll-lock.spec.ts + scroll-end-gap.spec.ts. */}
      <body className="flex min-h-full flex-col overflow-x-hidden">
        {/* 악센트 팔레트를 첫 페인트 전에 심는다 (2026-08-18). 자리를 세 번
            시도한 기록과 왜 `next/script` 인지는 그 컴포넌트의 주석에 있다.
            서버가 `data-accent` 를 모르므로 `<html>` 에 `suppressHydrationWarning`
            이 필요하다 — 속성 하나에 한정된 의도된 불일치다. */}
        <AccentBootScript />
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Ontology Atlas',
            alternateName: 'ontology-atlas',
            url: SITE_URL,
            description:
              'AI-native codebase ontology workbench. Humans and AI agents author the same vault.',
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
