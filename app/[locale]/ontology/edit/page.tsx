import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyEditRedirectPage } from "@/views/ontology-edit-redirect";
import { RouteLoadingFallback } from "@/shared/ui";
import { absoluteUrl } from "@/shared/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("pages.topology"),
    description: t("descriptions.topology"),
    alternates: { canonical: absoluteUrl(`/${locale}/topology/`) },
  };
}

/**
 * `/ontology/edit` — the retired ERD builder, now a thin redirect to `/topology`, whose contextual
 * editor covers node assembly, relation connecting, live preview, and real frontmatter writes. Kept
 * so old bookmarks and agent-handoff deep-links land in the map editor instead of 404-ing.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyEditRedirectPage />
    </Suspense>
  );
}
