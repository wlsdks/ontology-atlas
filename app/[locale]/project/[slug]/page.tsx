import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { bundledProjectSlugs, deriveBundledProjects, deriveIndexedProjects } from '@/entities/docs-vault';
import { isAppLocale, LOCALE_META } from '@/i18n/locales';
import { getTranslations } from 'next-intl/server';
import { ProjectDetailPage, projectBreadcrumb } from '@/views/project-detail';
import { absoluteUrl } from '@/shared/config';
import { SITE_ORGANIZATION_REF } from '@/shared/config/site-entity';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { JsonLd, RouteLoadingFallback } from '@/shared/ui';

interface Params {
  slug: string;
}

const LOCALIZED_PROJECT_COPY: Readonly<Record<string, 'ontologyAtlas'>> = {
  'ontology-atlas': 'ontologyAtlas',
};

async function projectCopy(locale: string, project: { slug: string; name: string; description?: string }) {
  const key = LOCALIZED_PROJECT_COPY[project.slug];
  const fallback = project.description || `${project.name} — Ontology Atlas`;
  if (!key) return { title: project.name, description: fallback };
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return { title: t(`projectTitles.${key}`), description: t(`projectDescriptions.${key}`) };
}

/**
 * Slugs come from every bundled sample via `bundledProjectSlugs()`; gate:
 * tests/contract/vault-data/bundled-project-routes.contract.test.ts.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return bundledProjectSlugs().map((slug) => ({ slug }));
}

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

  const { title, description } = await projectCopy(locale, project);
  // The canonical must carry the locale prefix or it names a URL that 404s. `buildPageMetadata`
  // assembles locale, hreflang and x-default. A demo sample's project is noindex and unlisted.
  const base = buildPageMetadata({
    locale,
    path: `project/${slug}`,
    title,
    description,
    noindex: !deriveIndexedProjects().some((indexed) => indexed.slug === slug),
    // opengraph-image.tsx beside this file generates the per-slug card; the
    // builder must not put an `images` key anywhere the spreads below carry.
    hasFileConventionImage: true,
  });

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
        type: 'article',
      // `images` stays unset: `opengraph-image.tsx` supplies the card, and setting it would discard that.
    },
    twitter: {
      ...base.twitter,
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

  // CreativeWork, not SoftwareApplication: a project entry is not necessarily runnable software.
  const copy = await projectCopy(locale, project);
  const inLanguage = isAppLocale(locale) ? LOCALE_META[locale].intlTag : LOCALE_META.en.intlTag;
  const creativeWorkLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.name,
    description: copy.description,
  // Must equal the metadata canonical, or search engines get two answers.
    url: absoluteUrl(`/${locale}/project/${slug}/`),
    inLanguage,
    author: SITE_ORGANIZATION_REF,
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
