import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomePage, MapSampleHead } from "@/views/home";
import { buildPageMetadata } from "@/shared/lib/public-pages/page-metadata";
import { MapEntryFallback } from "@/shared/ui/fallbacks/map-entry-fallback";

/** Renders the same component as `/`; the demo URL the README points at. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return buildPageMetadata({
    locale,
    path: 'topology',
    title: t("pages.topology"),
    description: t('descriptions.topology'),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <>
      <MapSampleHead />
      <Suspense fallback={<MapEntryFallback locale={locale} />}>
        <HomePage />
      </Suspense>
    </>
  );
}
