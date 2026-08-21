import type { MetadataRoute } from 'next';
import { deriveBundledProjects } from '@/entities/docs-vault';
import { SITE_URL } from '@/shared/config';
import { routing } from '@/i18n/routing';

// Static export — must resolve at build time.
export const dynamic = 'force-static';

// 사용자가 직접 진입 가능한 정본 surface. 호환 redirect와 /project/new 같은
// vault-mode 전용 진입점은 제외한다.
const STATIC_ROUTES = [
  '',
  'projects',
  'download',
  'topology',
  'docs',
  // 'ontology' 는 제외 — `/topology` 로 보내는 리다이렉트라 정본이 자기가
  // 아니다(`app/[locale]/ontology/page.tsx`). 정본이 남을 가리키는 주소를
  // 사이트맵에 넣으면 두 신호가 서로 다른 말을 한다.
  'ontology/insights',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * 사이트맵의 프로젝트 목록은 **라우트 생성과 같은 출처**여야 한다 —
   * `bundledProjectSlugs()` 가 만드는 주소 전집과 정확히 같은 집합.
   *
   * 종전엔 dogfood 매니페스트만 봤다. 그래서 `/project/storefront/` 의 404 를
   * 고치면서 라우트 생성만 전집으로 바꿨을 때, **빌드에는 있는데 사이트맵에는
   * 없는** 주소가 생겼다(2026-08-01 실측: `public-routes-coherence` 가
   * `en: HTML 은 있지만 sitemap 누락된 슬러그: storefront` 로 잡았다). 앱
   * 곳곳이 홍보하는 유일한 데모가 크롤러에게는 여전히 존재하지 않았다.
   *
   * 값이 두 곳에서 파생되면 반쪽 수리가 통과한다. 하나로 합친다.
   */
  const projects = deriveBundledProjects();
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
