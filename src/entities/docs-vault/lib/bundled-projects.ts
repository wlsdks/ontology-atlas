import type { Project } from '@/entities/project';
import type { SampleSource } from '@/shared/lib/sample-source';
import { deriveProjectsFromVault } from './derive-projects-from-vault';
import { resolveStaticVaultSource } from './static-vault-source';

/**
 * 번들된 **모든** 샘플 볼트의 project 노드 — 정적 export 가 생성해야 하는
 * `/project/[slug]/` 주소의 전집.
 *
 * ## 왜 dogfood 하나로는 안 되는가 (2026-08-01 실측)
 *
 * `app/[locale]/project/[slug]/page.tsx` 의 `generateStaticParams` 가 dogfood
 * 매니페스트에서만 slug 를 뽑고 있었다. 그래서 `/ko/project/ontology-atlas/`
 * 는 있고 **`/ko/project/storefront/` 는 404** 였다 — 앱 곳곳이 홍보하는
 * 유일한 데모가 자기 정본 주소를 못 가졌고, 공유·북마크·크롤러가 전부 막혔다.
 *
 * 번들 샘플은 사용자가 무엇을 고르든 **둘 다 빌드 시점에 존재**한다. 어느
 * 쪽을 보고 있느냐는 런타임 선호(`demo:sample-source:v1`)이고, 그 선호는
 * 주소가 존재하는지와 무관하다. 그래서 라우트 생성은 선호를 묻지 않고 전집을
 * 만든다.
 *
 * ⚠️ 이 함수는 **라우트 생성과 SSR 씨앗**에만 쓴다. 화면이 "지금 어떤 볼트인가"
 * 를 물을 때는 여전히 `useStaticVaultSource()` / `resolveStaticVaultSource()`
 * 다 — 두 볼트를 한 화면에 섞는 것이 바로 그 리졸버가 막으려던 결함이다.
 */
const BUNDLED_SOURCES: SampleSource[] = ['dogfood', 'storefront'];

export function deriveBundledProjects(): Project[] {
  const bySlug = new Map<string, Project>();
  for (const source of BUNDLED_SOURCES) {
    for (const project of deriveProjectsFromVault(resolveStaticVaultSource(source).manifest)) {
      // 먼저 온 쪽이 이긴다 — slug 가 겹치면 dogfood 가 정본이다.
      if (!bySlug.has(project.slug)) bySlug.set(project.slug, project);
    }
  }
  return [...bySlug.values()];
}

/** 정적 export 가 만들어야 하는 project slug 전집. 비면 빌드가 깨지지 않게 fallback 1개. */
export function bundledProjectSlugs(): string[] {
  const slugs = deriveBundledProjects().map((p) => p.slug);
  return slugs.length > 0 ? slugs : ['iam'];
}
