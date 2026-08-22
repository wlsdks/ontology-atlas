import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomePage } from "@/views/home";
import { buildPageMetadata } from "@/shared/lib/page-metadata";
import { MapEntryFallback } from "@/shared/ui/map-entry-fallback";

/**
 * `/topology` — the canvas-2D topology surface (`topology-map-v2`). An explicit entry alias
 * rendering the same component as `/` (HomePage), and the demo URL the README and launch assets
 * point at.
 *
 * Why the fallback is `MapEntryFallback` is explained in that file's comments — under static export
 * this route's HTML body is entirely the fallback, so a loading caption there would be all a link
 * preview or a crawler sees of the page.
 */
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
    <Suspense fallback={<MapEntryFallback locale={locale} />}>
      <HomePage />
    </Suspense>
  );
}
