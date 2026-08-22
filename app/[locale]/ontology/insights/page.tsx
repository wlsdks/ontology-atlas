import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyInsightsPage } from "@/views/ontology-insights";
import { RouteLoadingFallback } from "@/shared/ui";
import { buildPageMetadata } from "@/shared/lib/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return buildPageMetadata({
    locale,
    path: 'ontology/insights',
    title: t("pages.ontologyInsights"),
    description: t('descriptions.ontologyInsights'),
  });
}

/**
 * /ontology/insights — the ontology's activity and structure at a glance: kind distribution, hub
 * nodes (highest degree), recent activity, and unconnected nodes.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyInsightsPage />
    </Suspense>
  );
}
