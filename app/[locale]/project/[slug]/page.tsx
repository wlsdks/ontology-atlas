import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { bundledProjectSlugs, deriveBundledProjects } from '@/entities/docs-vault';
import { isAppLocale, LOCALE_META } from '@/i18n/locales';
import { getTranslations } from 'next-intl/server';
import { ProjectDetailPage, projectBreadcrumb } from '@/views/project-detail';
import { absoluteUrl } from '@/shared/config';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { JsonLd, RouteLoadingFallback } from '@/shared/ui';

interface Params {
  slug: string;
}

/**
 * Slugs come from every bundled sample via `bundledProjectSlugs()`; gate:
 * tests/contract/bundled-project-routes.contract.test.ts.
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
  // The canonical must carry the locale prefix or it names a URL that 404s. `buildPageMetadata`
  // assembles locale, hreflang and x-default.
  const base = buildPageMetadata({
    locale,
    path: `project/${slug}`,
    title,
    description,
    // opengraph-image.tsx beside this file generates the per-slug card; the
    // builder must not put an `images` key anywhere the spreads below carry.
    hasFileConventionImage: true,
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
  const inLanguage = isAppLocale(locale) ? LOCALE_META[locale].intlTag : LOCALE_META.en.intlTag;
  const creativeWorkLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.name,
    description: project.description || `${project.name} — ontology-atlas`,
  // Must equal the metadata canonical, or search engines get two answers.
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

  const tMeta = await getTranslations({ locale, namespace: 'metadata' });
  const breadcrumbLd = projectBreadcrumb(
    locale,
    { home: tMeta('siteName'), projects: tMeta('pages.projects') },
    project.name,
  );

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
