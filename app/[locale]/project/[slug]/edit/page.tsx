import { Suspense } from 'react';
import type { Metadata } from 'next';
import { bundledProjectSlugs, deriveBundledProjects } from '@/entities/docs-vault';
import { ProjectEditClientPage } from './ProjectEditClientPage';
import { RouteLoadingFallback } from '@/shared/ui';

interface Params {
  slug: string;
}

export async function generateStaticParams(): Promise<Params[]> {
  return bundledProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const projects = deriveBundledProjects();
  const project = projects.find((p) => p.slug === slug);
  return {
    title: `${project?.name ?? slug} 편집`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <ProjectEditClientPage slug={slug} />
    </Suspense>
  );
}
