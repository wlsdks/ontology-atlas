import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { bundledProjectSlugs, deriveBundledProjects } from '@/entities/docs-vault';
import { ProjectDetailPage } from '@/views/project-detail';
import { absoluteUrl } from '@/shared/config';
import { buildPageMetadata } from '@/shared/lib/page-metadata';
import { JsonLd, RouteLoadingFallback } from '@/shared/ui';

interface Params {
  slug: string;
}

/**
 * 빌드 시점에 모든 프로젝트 slug 를 수집해 정적 페이지 생성.
 *
 * R10b (cloud surface 영구 제거) 이후 — vault 매니페스트의 `kind: project`
 * doc 만으로 정적 페이지 빌드. 사용자별 cloud 프로젝트 fetch 단계 사라짐.
 *
 * ⚠️ **번들된 샘플 전부**에서 뽑는다(2026-08-01). dogfood 매니페스트만 보던
 * 시절 `/ko/project/storefront/` 가 404 였다 — 앱 곳곳이 홍보하는 유일한
 * 데모가 자기 정본 주소를 못 가졌다. 전집 산정의 단일 출처는
 * `bundledProjectSlugs()`, 게이트는
 * `tests/contract/bundled-project-routes.contract.test.ts`.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return bundledProjectSlugs().map((slug) => ({ slug }));
}

/**
 * 프로젝트별 메타데이터 생성 (Open Graph, Twitter card 포함).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const projects = deriveBundledProjects();
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    return {
      title: 'Project not found',
    };
  }

  const title = project.name;
  const description = project.description || `${project.name} — ontology-atlas`;
  // ⚠️ **canonical 에 로케일이 빠지면 존재하지 않는 URL 을 가리킨다.**
  // 예전 `absoluteUrl('/project/<slug>/')` 는 `/ko/` · `/en/` 접두어가 없어
  // 실제로 404 인 주소를 정본으로 선언했다(2026-07-29 실측: `/projects/` ·
  // `/topology/` 도 같은 결함, 둘 다 404). 검색엔진에 "이 페이지의 정본은
  // 없는 페이지"라고 말하는 셈이라 색인에서 통째로 빠진다.
  // `buildPageMetadata` 가 로케일 + hreflang + x-default 를 한 곳에서 조립한다.
  const base = buildPageMetadata({
    locale,
    path: `project/${slug}`,
    title,
    description,
  });

  // 태그·스택·카테고리 등을 keywords 로 묶어 SEO 신호 강화. 중복 제거.
  const keywords = Array.from(
    new Set(
      [
        ...(project.tags ?? []),
        ...(project.stack ?? []),
        project.category,
        project.isHub ? '허브' : '서비스',
      ].filter(
        (token): token is string =>
          typeof token === 'string' && token.trim().length > 0,
      ),
    ),
  );

  return {
    ...base,
    keywords,
    openGraph: {
      ...base.openGraph,
      siteName: 'ontology-atlas',
      // 프로젝트 상세는 사이트 소개가 아니라 한 대상에 대한 글이다.
      type: 'article',
      // og:image 는 동일 디렉터리의 opengraph-image.tsx 가 빌드 타임에 slug 별
      // 1200×630 PNG 를 생성해 자동 주입. 여기서 images 를 override 하면
      // 파일 기반 컨벤션 결과가 무시되므로 생략.
    },
    twitter: {
      ...base.twitter,
      // twitter:image 는 파일 기반 convention (twitter-image.tsx 또는
      // opengraph-image.tsx fallback) 가 주입. 생략.
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const projects = deriveBundledProjects();
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    notFound();
  }

  // CreativeWork 구조화 데이터 — Google rich snippet 에서 프로젝트 이름·
  // 설명·작성자·키워드 인식. CreativeWork 가 SoftwareApplication 보다 일반적
  // (포트폴리오 항목이 꼭 실행 가능한 software 만은 아니므로).
  const inLanguage = locale === 'ko' ? 'ko-KR' : 'en-US';
  const creativeWorkLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.name,
    description: project.description || `${project.name} — ontology-atlas`,
    // 메타의 canonical 과 **같은 주소**여야 한다 — 구조화 데이터가 다른
    // 주소를 말하면 검색엔진이 둘 중 무엇을 믿을지 우리가 정하지 못한다.
    url: absoluteUrl(`/${locale}/project/${slug}/`),
    inLanguage,
    author: {
      '@type': 'Organization',
      name: 'ontology-atlas',
    },
    keywords: Array.from(
      new Set(
        [
          ...(project.tags ?? []),
          ...(project.stack ?? []),
          project.category,
        ].filter(
          (token): token is string =>
            typeof token === 'string' && token.trim().length > 0,
        ),
      ),
    ).join(', ') || undefined,
    dateModified: project.updatedAt ?? undefined,
  };

  // BreadcrumbList — SERP 에서 "홈 › 프로젝트 › {이름}" 경로가 노출되게 한다.
  // Google 가이드상 마지막 아이템은 item URL 을 생략해도 무방.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: '홈',
        item: absoluteUrl(`/${locale}/`),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: '프로젝트',
        item: absoluteUrl(`/${locale}/projects/`),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: project.name,
      },
    ],
  };

  // ProjectDetailPage 내부에서 useSearchParams()를 쓰므로 정적 export 시
  // prerender가 통과하려면 Suspense 경계가 필요.
  return (
    <>
      <JsonLd data={creativeWorkLd} />
      <JsonLd data={breadcrumbLd} />
      <Suspense fallback={<RouteLoadingFallback />}>
        <ProjectDetailPage slug={slug} initialProject={project} initialRelated={projects} />
      </Suspense>
    </>
  );
}
