import type { MetadataRoute } from 'next';
import { fetchAllProjectsAtBuild } from '@/entities/project/api';
import { SITE_URL } from '@/shared/config';

// 정적 export 모드에선 빌드 타임에 확정되어야 한다.
export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await fetchAllProjectsAtBuild();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/projects/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  for (const project of projects) {
    entries.push({
      url: `${SITE_URL}/project/${project.slug}/`,
      lastModified: project.updatedAt ?? now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  return entries;
}
