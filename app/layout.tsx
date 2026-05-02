import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { MotionProvider } from '@/app-providers/providers';
// 콘솔 노이즈 패치 — firebase 의존 0. side-effect import 로 install.
// Firebase JS 자체는 cloud 모드 진입 시점에 dynamic import 경로로만 들어와
// local-first 첫 paint 를 firebase 청크 없이 유지한다.
import '@/shared/lib/firestore-noise-patch';
import { TaxonomyProvider } from '@/features/taxonomy';
import { BottomTabBar } from '@/widgets/bottom-tab-bar';
import { ToastProvider, TooltipProvider } from '@/shared/ui';
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
  title: {
    default: 'oh-my-ontology',
    template: '%s · oh-my-ontology',
  },
  description: '마크다운 문서에서 지식 그래프를 키우는 오픈소스 온톨로지 워크벤치.',
  keywords: ['oh-my-ontology', 'ontology', '온톨로지', '지식 그래프', 'knowledge graph', 'markdown', '토폴로지', 'AI agent'],
  authors: [{ name: 'oh-my-ontology contributors' }],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: 'oh-my-ontology',
    title: 'oh-my-ontology',
    description: '마크다운 문서에서 지식 그래프를 키우는 오픈소스 온톨로지 워크벤치.',
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
    description: '마크다운 문서에서 지식 그래프를 키우는 오픈소스 온톨로지 워크벤치.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
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
      lang="ko"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full overflow-x-hidden`}
      // 아래 inline script 가 hydration 전에 data-theme 속성을 박아주는데,
      // React 는 SSR HTML 과 client render 의 attribute set 차이를
      // hydration mismatch 로 보고 콘솔 error 를 찍는다. theme 라이브러리
      // 표준 패턴 (Next.js docs · next-themes) 대로 html element 에만
      // suppressHydrationWarning 을 켜 이 한 attribute 차이를 silent.
      suppressHydrationWarning
    >
      {/*
        라이트/다크 토큰 swap — React hydration 전에 localStorage 의 사용자
        설정을 html data-theme 으로 박아 첫 paint 부터 정확한 톤이 보이게.
        try/catch 로 private 모드 / storage 차단 환경에서도 silent fallback.
      */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('demo:theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`,
          }}
        />
      </head>
      {/*
        overflow-x-hidden은 모바일 작은 뷰포트(360px 등)에서 로그인/계정
        카드가 미세하게 뷰포트를 넘겨 가로 스크롤이 생기는 것을 최종
        방어선에서 막는다. 토폴로지는 내부 pan을 쓰므로 body 가로 스크롤과
        무관하다.
      */}
      <body className="flex min-h-full flex-col overflow-x-hidden pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        {/*
          모바일 한정 하단 탭바(BottomTabBar) 56px + safe-area 만큼의
          bottom padding. 마지막 카드/리스트 항목이 탭바 뒤에 숨지 않게.
          md 이상에서는 탭바가 hidden 이라 padding 도 0.
        */}
        {/*
          Firebase 주요 서비스 origin 에 대한 preconnect 힌트.
          HomePage 는 마운트 즉시 Firestore onSnapshot 을 연다 (projects 구독).
          TCP + TLS 핸드셰이크를 미리 체결해 첫 쿼리 RTT 200-400ms 단축.
          Auth 는 login/signup 경로가 아닌 곳에서도 Firebase Auth SDK 가 로드
          되며 internal ping 이 identitytoolkit 쪽으로 발사되므로 함께 dns-prefetch.
          React 19 는 children 의 <link rel="preconnect"> 를 document head 로
          자동 hoist 한다.
        */}
        <link rel="preconnect" href="https://firestore.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebaseinstallations.googleapis.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        {/*
          WebSite 구조화 데이터. Google Rich Results 에 site name 인식 +
          sitelinks 후보를 강화한다. SITE_URL 기반 절대 경로로 고정.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Demo',
              alternateName: 'oh-my-ontology',
              url: SITE_URL,
              description:
                '문서·프로젝트·허브·노드, 모든 컨텍스트를 하나의 지도로.',
              inLanguage: 'ko-KR',
              publisher: {
                '@type': 'Organization',
                name: 'Demo',
              },
            }),
          }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:border focus:border-[color:rgba(113,112,255,0.5)] focus:bg-[color:var(--color-panel)] focus:px-3 focus:py-2 focus:text-[13px] focus:text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:rgba(94,106,210,0.46)]"
        >
          메인 콘텐츠로 건너뛰기
        </a>
        <MotionProvider>
          <TaxonomyProvider>
            <ToastProvider>
              {/* Fire 5b — Tooltip Provider 전역 1회. 하위 모든
                  `<Tooltip withProvider={false}>` 가 이 Context 를 공유. */}
              <TooltipProvider delayDuration={300}>
                {children}
                <BottomTabBar />
              </TooltipProvider>
            </ToastProvider>
          </TaxonomyProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
