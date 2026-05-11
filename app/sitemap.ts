import type { MetadataRoute } from 'next';
import {
  deriveProjectsFromVault,
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from '@/entities/docs-vault';
import { SITE_URL } from '@/shared/config';
import { routing } from '@/i18n/routing';

// Static export — must resolve at build time.
export const dynamic = 'force-static';

// 사용자가 직접 진입 가능한 모든 정적 surface. /ontology/edit 빌더는
// 이전엔 빠져 있어 SEO 에 안 잡혔는데, AGENTS.md 의 routes 표에 1급
// surface 로 명시되어 있고 데모 모드에서도 read-only 로 로드 가능 → 색인
// 가치 충분. /project/new 는 vault-mode 진입 후만 의미 있어 제외.
const STATIC_ROUTES = [
  '',
  'projects',
  'topology',
  'docs',
  'ontology',
  'ontology/edit',
  'ontology/insights',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 빌드 타임 dogfood vault manifest 의 `kind: project` doc 만으로 sitemap
  // 합성. local-first 라 외부 fetch 없이 정적 export 가능.
  const projects = deriveProjectsFromVault(staticVaultManifestRaw as VaultManifest);
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
