import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  deriveProjectsFromVault,
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from '@/entities/docs-vault';
import { ProjectDetailPage } from '@/views/project-detail';
import { absoluteUrl } from '@/shared/config';

const staticVaultManifest = staticVaultManifestRaw as VaultManifest;

interface Params {
  slug: string;
}

/**
 * 빌드 시점에 모든 프로젝트 slug 를 수집해 정적 페이지 생성.
 *
 * R10b (cloud surface 영구 제거) 이후 — vault 매니페스트의 `kind: project`
 * doc 만으로 정적 페이지 빌드. 사용자별 cloud 프로젝트 fetch 단계 사라짐.
 * 비어 있으면 fallback 1개 (빌드 실패 방지).
 */
export async function generateStaticParams(): Promise<Params[]> {
  const vaultProjects = deriveProjectsFromVault(staticVaultManifest);
  if (vaultProjects.length === 0) return [{ slug: 'iam' }];
  return vaultProjects.map((p) => ({ slug: p.slug }));
}

/**
 * 프로젝트별 메타데이터 생성 (Open Graph, Twitter card 포함).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const projects = deriveProjectsFromVault(staticVaultManifest);
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    return {
      title: 'Project not found',
    };
  }

  const title = project.name;
  const description = project.description || `${project.name} — ontology-atlas`;
  // Next.js 16 + output:'export' 환경에서 metadataBase 기반 상대경로가 실제
  // 빌드 HTML 에 canonical / og:url 로 emit 되지 않는 회귀가 있음 — 절대
  // URL 로 명시해 회피. 루트 layout 의 metadataBase 와 같은 SITE_URL 사용.
  const canonicalUrl = absoluteUrl(`/project/${slug}/`);

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
    title,
    description,
    keywords,
    alternates: {
      // canonical URL 명시 — 검색엔진 중복 SERP 방지. 지침서 T-01.
      canonical: canonicalUrl,
    },
    openGraph: {
      siteName: 'ontology-atlas',
      title,
      description,
      type: 'article',
      url: canonicalUrl,
      // og:image 는 동일 디렉터리의 opengraph-image.tsx 가 빌드 타임에 slug 별
      // 1200×630 PNG 를 생성해 자동 주입. 여기서 images 를 override 하면
      // 파일 기반 컨벤션 결과가 무시되므로 생략.
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      // twitter:image 역시 파일 기반 convention (twitter-image.tsx 또는
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
  const projects = deriveProjectsFromVault(staticVaultManifest);
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
    url: absoluteUrl(`/project/${slug}/`),
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
        item: absoluteUrl('/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: '프로젝트',
        item: absoluteUrl('/projects/'),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(creativeWorkLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <Suspense fallback={null}>
        <ProjectDetailPage slug={slug} initialProject={project} initialRelated={projects} />
      </Suspense>
    </>
  );
}
