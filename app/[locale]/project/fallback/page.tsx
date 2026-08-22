import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectFallbackClient } from "./ProjectFallbackClient";
import { RouteLoadingFallback } from "@/shared/ui";

// Under static export, a local vault slug that cannot be known at build time is received as a query
// and renders `ProjectDetailPage` or `ProjectEditorPage`. The pre-R10 Firebase Hosting rewrite
// pathname is still interpreted for backwards compatibility.
//
// The `/project/[slug]/` canonical for public slugs known at build time is left as it is; in-app
// navigation uses this one static file to avoid 404s on arbitrary slugs.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "projectPages.detail",
  });
  // The Korean i18n `topBarProjectFallback` is deliberately the English "Project" (the breadcrumb is
  // English by intent), so a separate `topBarProjectsLabel` is used, localized properly for each locale.
  return {
    title: t("topBarProjectsLabel"),
  };
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <ProjectFallbackClient />
    </Suspense>
  );
}
