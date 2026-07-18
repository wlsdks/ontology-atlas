import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OntologyRedirectPage } from "@/views/ontology-redirect";

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
 * `/ontology` — B3 허브가 곧 지도 convergence entry. The former tree/ego hub
 * (`OntologyViewPage`) is retired; this route now redirects to `/topology`
 * with INDEX expanded, translating the `?node=<id>` deep-link contract into
 * `?p=<id>` so every existing agent-handoff / search / docs-viewer link
 * built via `buildOntologyNodeHref` keeps resolving.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyRedirectPage />
    </Suspense>
  );
}
