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
  // A redirect, not a destination: canonical is `/topology/`, and no hreflang is set, so search
  // engines see no second address for the same content.
  return {
    title: t("pages.ontology"),
    alternates: { canonical: absoluteUrl(`/${locale}/topology/`) },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyRedirectPage />
    </Suspense>
  );
}
