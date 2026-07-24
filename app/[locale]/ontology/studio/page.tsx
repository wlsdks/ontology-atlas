import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyStudioPage } from "@/views/ontology-studio";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("pages.ontologyStudio") };
}

/**
 * /ontology/studio — the Ontology Studio "강화(enhancement) screen". An
 * immersive, game-styled surface (sanctioned scoped design exception) that
 * turns one ontology node into an item you complete by socketing relation
 * "gems". Slice 1 is read-only. Static-export compatible (no server APIs).
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyStudioPage />
    </Suspense>
  );
}
