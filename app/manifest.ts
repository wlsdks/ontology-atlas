import type { MetadataRoute } from 'next';

// 정적 export 에서는 route 가 빌드 타임에 고정되어야 한다.
export const dynamic = 'force-static';

/**
 * Web App Manifest — iOS Safari "홈 화면에 추가" · Android Chrome 설치
 * prompt 에서 표시되는 앱 메타. display: 'standalone' 으로 브라우저 크롬
 * 없이 토폴로지 전체를 몰입감 있게 보여줄 수 있게 한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // id: PWA 정체성을 start_url 과 독립적으로 고정. 나중에 start_url 을 바꿔
    // 도 홈 화면 아이콘이 "다른 앱" 으로 취급돼 복사되는 회귀 방지 (Chrome
    // 가이드 권장). start_url 과 동일 경로로 지정.
    id: '/',
    // scope: PWA 가 담당하는 URL 범위. 루트부터 전체 앱을 포함. scope 밖으로
    // 이동하면 Chrome 이 외부 브라우저로 열기 옵션 제시.
    scope: '/',
    name: 'Narnia — Aslan Project Map',
    short_name: 'Narnia',
    description: '문서·프로젝트·허브·노드, 모든 컨텍스트를 하나의 지도로.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#08090a',
    theme_color: '#08090a',
    lang: 'ko-KR',
    dir: 'ltr',
    categories: ['productivity', 'utilities'],
    icons: [
      {
        src: '/logo.png',
        sizes: 'any',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
