import { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  deriveProjectsFromVault,
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from '@/entities/docs-vault';
import { ProjectEditClientPage } from './ProjectEditClientPage';
import { RouteLoadingFallback } from '@/shared/ui';

const staticVaultManifest = staticVaultManifestRaw as VaultManifest;

interface Params {
  slug: string;
}

export async function generateStaticParams(): Promise<Params[]> {
  const projects = deriveProjectsFromVault(staticVaultManifest);
  if (projects.length === 0) return [{ slug: 'iam' }];
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const projects = deriveProjectsFromVault(staticVaultManifest);
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
