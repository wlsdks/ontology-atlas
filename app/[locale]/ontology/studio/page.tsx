import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyEditRedirectPage } from "@/views/ontology-edit-redirect";
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
    path: 'ontology/studio',
    title: t("pages.topology"),
    description: t('descriptions.topology'),
  });
}

/**
 * Compatibility entry only. The map now owns manual ontology writing through
 * its contextual editor; old node/edit/create query strings are translated by
 * the same redirect component as `/ontology/edit`.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyEditRedirectPage />
    </Suspense>
  );
}
