import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyRedirectPage } from "@/views/ontology-redirect";
import { RouteLoadingFallback } from "@/shared/ui";
import { absoluteUrl } from "@/shared/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  // ⚠️ This route is **a redirect, not a destination** (see the component comment below). Declaring
  // itself canonical would hand a search engine a second address with the same content. The
  // canonical is `/topology/`, which actually has the content.
  // No hreflang is set — advertising this address's language pair while its canonical points
  // elsewhere makes two signals say different things.
  return {
    title: t("pages.ontology"),
    alternates: { canonical: absoluteUrl(`/${locale}/topology/`) },
  };
}

/**
 * Redirects to `/topology` with INDEX expanded, translating `?node=<id>` into `?p=<id>` so links
 * built via `buildOntologyNodeHref` keep resolving.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyRedirectPage />
    </Suspense>
  );
}
