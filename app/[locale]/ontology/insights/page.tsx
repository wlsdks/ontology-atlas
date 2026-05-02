import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyInsightsPage } from "@/views/ontology-insights";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("pages.ontologyInsights") };
}

/**
 * /ontology/insights — ontology 의 활동·구조를 한눈에.
 * kind 분포 + 허브 노드 (degree 상위) + 최근 활동 + 미연결 노드.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyInsightsPage />
    </Suspense>
  );
}
