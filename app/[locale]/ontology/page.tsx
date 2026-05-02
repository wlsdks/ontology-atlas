import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyViewPage } from "@/views/ontology-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("pages.ontology") };
}

/**
 * /ontology — ontology v0 view.
 * project → domain → capability → element 트리로 승인된 ontology 그래프
 * 를 펼쳐서 본다. 문서 노드는 근거라 트리에 매달지 않음.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyViewPage />
    </Suspense>
  );
}
