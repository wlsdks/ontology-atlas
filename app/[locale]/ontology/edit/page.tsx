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

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyEditRedirectPage />
    </Suspense>
  );
}
