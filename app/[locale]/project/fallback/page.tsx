import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectFallbackClient } from "./ProjectFallbackClient";
import { RouteLoadingFallback } from "@/shared/ui";

// Under static export, a local vault slug unknown at build time arrives as a query; in-app
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
  return {
    title: t("topBarProjectsLabel"),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <ProjectFallbackClient />
    </Suspense>
  );
}
