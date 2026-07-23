import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const allowedDevOrigins = [
  '127.0.0.1',
  'localhost',
  '*.localhost',
  ...(process.env.NEXT_DEV_ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []),
];

// GitHub Pages 프로젝트 사이트(`/ontology-atlas` 서브패스) 배포용 —
// 루트 배포(Firebase, dev)에서는 미설정. src/shared/lib/base-path.ts 와 짝.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins,
  output: 'export',
  basePath,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  // dev 전용 Next 인디케이터(N 원형)가 기본 top-right 에서 실제 크롬(설정
  // 기어·SETTINGS·Workspace 칩)을 가리고 클릭까지 가로챘다(겹침 소탕
  // 2026-07-23, 768 실측 — 소유자의 "N 아바타 겹침" 실보고의 정체).
  // 모든 페이지의 우상단은 유틸리티 크롬 소유라 좌하단으로 옮긴다.
  // 프로덕션 빌드에는 렌더되지 않는 dev 전용 표면.
  devIndicators: {
    position: 'bottom-left',
  },
};

export default withNextIntl(nextConfig);
