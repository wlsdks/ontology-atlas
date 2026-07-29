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

// 사용자가 직접 진입 가능한 모든 정적 surface. /ontology/studio(나침 무대)는
// AGENTS.md routes 표의 1급 write surface 이고 데모 모드에서도 read-only 로
// 로드 가능 → 색인 가치 충분(은퇴한 /ontology/edit 빌더 자리를 대체).
// /project/new 는 vault-mode 진입 후만 의미 있어 제외.
const STATIC_ROUTES = [
  '',
  'projects',
  'download',
  'topology',
  'docs',
  // 'ontology' 는 제외 — `/topology` 로 보내는 리다이렉트라 정본이 자기가
  // 아니다(`app/[locale]/ontology/page.tsx`). 정본이 남을 가리키는 주소를
  // 사이트맵에 넣으면 두 신호가 서로 다른 말을 한다.
  'ontology/studio',
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
          // `x-default` 는 어느 언어도 아닌 사용자(예: 프랑스어 브라우저)에게
          // 무엇을 줄지 우리가 정하는 자리다. 없으면 검색엔진이 스스로 고른다.
          // 페이지 `<head>` 의 hreflang(`buildPageMetadata`)과 같은 말을 해야
          // 한다 — 두 곳이 갈라지면 둘 다 무시된다.
          languages: {
            ...Object.fromEntries(
              routing.locales.map((l) => [l, `${SITE_URL}${route ? `/${l}/${route}/` : `/${l}/`}`])
            ),
            'x-default': `${SITE_URL}${route ? `/${routing.defaultLocale}/${route}/` : `/${routing.defaultLocale}/`}`,
          },
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
          // 정적 라우트와 같은 규칙 — `x-default` 를 빼먹으면 이 항목만
          // 검색엔진이 기본 언어를 스스로 고른다.
          languages: {
            ...Object.fromEntries(
              routing.locales.map((l) => [l, `${SITE_URL}/${l}/project/${project.slug}/`])
            ),
            'x-default': `${SITE_URL}/${routing.defaultLocale}/project/${project.slug}/`,
          },
        },
      });
    }
  }

  return entries;
}
