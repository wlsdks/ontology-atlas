import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyRelationsPage } from "@/views/ontology-relations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("pages.ontologyRelations") };
}

/**
 * /ontology/relations — edge 단위 view.
 * 트리는 노드 hierarchy, 인사이트는 노드 통계, 관계는 edge type 분포 + 강한 관계.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyRelationsPage />
    </Suspense>
  );
}
