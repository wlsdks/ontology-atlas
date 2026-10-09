import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InsightsLoadingView, OntologyInsightsPage } from "@/views/ontology-insights";
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
 * Relationship-first analysis with exact declaration evidence and supporting records.
 */
export default function Page() {
  return (
    <Suspense fallback={<InsightsLoadingView />}>
      <OntologyInsightsPage />
    </Suspense>
  );
}
