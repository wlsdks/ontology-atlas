import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProjectEditClientPage } from './ProjectEditClientPage';

interface Params {
  slug: string;
}

export async function generateStaticParams(): Promise<Params[]> {
  const { fetchAllProjectsAtBuild } = await import('@/entities/project');
  const projects = await fetchAllProjectsAtBuild();
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { fetchAllProjectsAtBuild } = await import('@/entities/project');
  const projects = await fetchAllProjectsAtBuild();
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
    <Suspense fallback={null}>
      <ProjectEditClientPage slug={slug} />
    </Suspense>
  );
}
