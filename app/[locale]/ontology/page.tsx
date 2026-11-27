import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyRedirectPage } from "@/views/ontology-redirect";
import { RouteLoadingFallback } from "@/shared/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  // A redirect to an app screen, not a destination: it names no canonical and no hreflang, since
  // `/topology/` is itself outside the index (a browser sees the app-only page there).
  return {
    title: t("pages.ontology"),
    robots: { index: false, follow: true },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyRedirectPage />
    </Suspense>
  );
}
