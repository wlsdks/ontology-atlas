import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomePage } from "@/views/home";
import { buildPageMetadata } from "@/shared/lib/public-pages/page-metadata";
import { MapEntryFallback } from "@/shared/ui/fallbacks/map-entry-fallback";

/** Renders the same component as `/`. A plain browser sees the app-only page here, so it is noindex. */
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
    noindex: true,
  });
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
