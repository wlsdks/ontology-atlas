import type { MetadataRoute } from 'next';
import { fetchAllProjectsAtBuild } from '@/entities/project/api';
import { SITE_URL } from '@/shared/config';
import { routing } from '@/i18n/routing';

// Static export — must resolve at build time.
export const dynamic = 'force-static';

const STATIC_ROUTES = ['', 'projects', 'topology', 'docs', 'ontology', 'ontology/insights', 'ontology/relations'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await fetchAllProjectsAtBuild();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [];

  // Per-locale entries for the static set + per-locale per-project entries.
  // Each entry advertises its hreflang siblings via `alternates.languages`,
  // which Google uses to pick the right localized URL for a user.
  for (const locale of routing.locales) {
    for (const route of STATIC_ROUTES) {
      const path = route ? `/${locale}/${route}/` : `/${locale}/`;
      entries.push({
        url: `${SITE_URL}${path}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: route === '' ? 1 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((l) => [l, `${SITE_URL}${route ? `/${l}/${route}/` : `/${l}/`}`])
          ),
        },
      });
    }

    for (const project of projects) {
      entries.push({
        url: `${SITE_URL}/${locale}/project/${project.slug}/`,
        lastModified: project.updatedAt ?? now,
        changeFrequency: 'weekly',
        priority: 0.7,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((l) => [l, `${SITE_URL}/${l}/project/${project.slug}/`])
          ),
        },
      });
    }
  }

  return entries;
}
