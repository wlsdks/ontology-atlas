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
 * Collects every project slug at build time to generate static pages.
 *
 * Since the permanent removal of the cloud surface, static pages are built from the vault
 * manifest's `kind: project` docs alone; there is no per-user cloud project fetch.
 *
 * ⚠️ **Slugs come from every bundled sample** (2026-08-01). While only the dogfood manifest was
 * read, `/ko/project/storefront/` was a 404 — the one demo the app promotes everywhere had no
 * canonical address. The single source for the full set is `bundledProjectSlugs()`; the gate is
 * `tests/contract/bundled-project-routes.contract.test.ts`.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return bundledProjectSlugs().map((slug) => ({ slug }));
}

/**
 * Per-project metadata, including Open Graph and the Twitter card.
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
  // ⚠️ **A canonical without the locale points at a URL that does not exist.**
  // The old `absoluteUrl('/project/<slug>/')` had no `/ko/` or `/en/` prefix and declared an
  // address that really 404s as canonical (measured 2026-07-29: `/projects/` and `/topology/` had
  // the same defect, both 404). That tells a search engine "this page's canonical is a page that
  // does not exist", which drops it from the index entirely.
  // `buildPageMetadata` assembles the locale, hreflang, and x-default in one place.
  const base = buildPageMetadata({
    locale,
    path: `project/${slug}`,
    title,
    description,
  });

  // Tags, stack, and category are folded into keywords to strengthen the SEO signal. Deduplicated.
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
      // A project detail page is writing about one subject, not an introduction to the site.
      type: 'article',
      // og:image is injected automatically by `opengraph-image.tsx` in the same directory, which
      // generates a per-slug 1200×630 PNG at build time. Overriding `images` here would discard
      // that file-convention result, so it is omitted.
    },
    twitter: {
      ...base.twitter,
      // twitter:image is injected by the file convention (twitter-image.tsx, falling back to
      // opengraph-image.tsx). Omitted.
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

  // CreativeWork structured data — lets Google's rich snippets recognize the project's name,
  // description, author, and keywords. CreativeWork is more general than SoftwareApplication (a
  // portfolio entry is not necessarily runnable software).
  const inLanguage = locale === 'ko' ? 'ko-KR' : 'en-US';
  const creativeWorkLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.name,
    description: project.description || `${project.name} — ontology-atlas`,
  // Must be **the same address** as the metadata's canonical — if the structured data names a
  // different one, we no longer decide which a search engine believes.
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

  // BreadcrumbList — surfaces the "Home › Projects › {name}" path in the SERP. Per Google's
  // guidance the last item may omit its item URL.
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

  // `ProjectDetailPage` uses `useSearchParams()` internally, so a Suspense boundary is required for
  // the prerender to pass under static export.
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
