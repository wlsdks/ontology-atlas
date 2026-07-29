import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectSelectorPage } from "@/views/project-selector";
import { buildPageMetadata } from "@/shared/lib/page-metadata";
import { RouteLoadingFallback } from "@/shared/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return buildPageMetadata({
    locale,
    path: 'projects',
    title: t("pages.projects"),
    description: t('descriptions.projects'),
  });
}

export default function ProjectsRoute() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <ProjectSelectorPage />
    </Suspense>
  );
}
