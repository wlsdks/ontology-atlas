import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/shared/config';

// Under static export, a route must be fixed at build time.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        // The search crawlers of answer engines, named so a later wildcard change cannot drop them.
        userAgent: ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Google-Extended'],
        allow: '/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
