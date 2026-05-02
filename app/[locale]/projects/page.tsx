import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectSelectorPage } from "@/views/project-selector";
import { absoluteUrl } from "@/shared/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("pages.projects"),
    description: '토폴로지 지도에 포함된 프로젝트와 허브 목록.',
    alternates: {
      canonical: absoluteUrl('/projects/'),
    },
  };
}

export default function ProjectsRoute() {
  return (
    <Suspense fallback={null}>
      <ProjectSelectorPage />
    </Suspense>
  );
}
