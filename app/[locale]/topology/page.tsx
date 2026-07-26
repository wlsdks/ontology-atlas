import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomePage } from "@/views/home";
import { absoluteUrl } from "@/shared/config";
import { RouteLoadingFallback } from "@/shared/ui";

/**
 * `/topology` — Sigma WebGL 토폴로지 surface. 현재는 `/` (HomePage) 와 동일
 * 컴포넌트를 렌더하는 명시적 진입점 alias.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("pages.topology"),
    alternates: {
      canonical: absoluteUrl("/topology/"),
    },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <HomePage />
    </Suspense>
  );
}
