import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyEditPage } from "@/views/ontology-edit";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("pages.ontologyEdit") };
}

/**
 * /ontology/edit — ERD canvas editor v1 (spec
 * `docs/superpowers/specs/2026-04-30-ontology-erd-editor-v1.md`).
 * Track C-1 (placeholder mount). C-2 부터 실제 노드 / 엣지 / 저장.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyEditPage />
    </Suspense>
  );
}
