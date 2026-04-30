import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { FirebaseProvider, MotionProvider } from '@/app-providers/providers';
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
    default: 'Narnia',
    template: '%s · Narnia',
  },
  description: '문서·프로젝트·허브·노드, 모든 컨텍스트를 하나의 지도로.',
  keywords: ['Narnia', 'Aslan', '프로젝트 맵', '토폴로지', 'AI Agent', 'Reactor', 'IAM'],
  authors: [{ name: 'Aslan' }],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: 'Narnia',
    title: 'Narnia',
    description: '문서·프로젝트·허브·노드, 모든 컨텍스트를 하나의 지도로.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Narnia',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Narnia',
    description: '문서·프로젝트·허브·노드, 모든 컨텍스트를 하나의 지도로.',
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
    >
      {/*
        라이트/다크 토큰 swap — React hydration 전에 localStorage 의 사용자
        설정을 html data-theme 으로 박아 첫 paint 부터 정확한 톤이 보이게.
        try/catch 로 private 모드 / storage 차단 환경에서도 silent fallback.
      */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('aslan:theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`,
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
              name: 'Narnia',
              alternateName: 'Aslan Project Map',
              url: SITE_URL,
              description:
                '문서·프로젝트·허브·노드, 모든 컨텍스트를 하나의 지도로.',
              inLanguage: 'ko-KR',
              publisher: {
                '@type': 'Organization',
                name: 'Aslan',
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
          <FirebaseProvider>
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
          </FirebaseProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
