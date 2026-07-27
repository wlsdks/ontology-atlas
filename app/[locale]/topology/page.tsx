import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomePage } from "@/views/home";
import { absoluteUrl } from "@/shared/config";
import { MapEntryFallback } from "@/shared/ui/map-entry-fallback";

/**
 * `/topology` — canvas-2D 토폴로지 surface (`topology-map-v2`). `/` (HomePage) 와
 * 같은 컴포넌트를 렌더하는 명시적 진입점 alias이자, README·런치 자산이 가리키는
 * 데모 URL 이다.
 *
 * fallback 이 `MapEntryFallback` 인 이유는 그 파일의 주석에 있다 — 정적 export
 * 에서 이 라우트의 HTML 본문은 fallback 이 전부라서, 그 자리에 로딩 자막만 있으면
 * 링크 미리보기와 크롤러가 보는 페이지 내용도 로딩 자막이 전부가 된다.
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

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <Suspense fallback={<MapEntryFallback locale={locale} />}>
      <HomePage />
    </Suspense>
  );
}
