import type { MetadataRoute } from 'next';
import { sitemapEntries } from '../scripts/web/site/sitemap';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries();
}
