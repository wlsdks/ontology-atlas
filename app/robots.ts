import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/shared/config';

// 정적 export 모드에선 route 가 빌드 타임에 고정되어야 한다.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/account',
          '/dev',
          '/dev/*',
          '/diagnostics',
          '/diagnostics/*',
          '/knowledge',
          '/knowledge/*',
          '/review',
          '/review/*',
          '/settings',
          '/settings/*',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
