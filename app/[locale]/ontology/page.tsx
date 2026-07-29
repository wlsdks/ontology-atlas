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
  // ⚠️ 이 라우트는 **목적지가 아니라 리다이렉트**다(아래 컴포넌트 주석).
  // 그래서 자기 자신을 정본으로 선언하면 검색엔진에 같은 내용의 주소를 하나
  // 더 만들어 주는 꼴이다. 정본은 실제로 내용을 가진 `/topology/` 다.
  // hreflang 은 두지 않는다 — 정본이 남의 주소일 때 이 주소의 언어 짝을
  // 따로 광고하면 두 신호가 서로 다른 말을 한다.
  return {
    title: t("pages.ontology"),
    alternates: { canonical: absoluteUrl(`/${locale}/topology/`) },
  };
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
    <Suspense fallback={<RouteLoadingFallback />}>
      <OntologyRedirectPage />
    </Suspense>
  );
}
