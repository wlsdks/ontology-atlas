import { Suspense } from "react";
import type { Metadata } from "next";
import { RootEntryPage } from '@/views/root-entry';
import { buildPageMetadata } from "@/shared/lib/page-metadata";
import { routing } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { GatewayEntryFallback } from "@/shared/ui/gateway-entry-fallback";

// Each locale page's canonical must be **its own URL** for the hreflang group to work. Every locale
// used to be unified onto `/`, which gave `/en/` and `/ko/` the same canonical and let the search
// engine index only one of them (deduplicating the other). This is the same direction of correction
// as the trailing-slash alignment of the hreflang map — an explicit per-locale canonical.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: safeLocale, namespace: 'metadata' });
  return buildPageMetadata({
    locale: safeLocale,
    path: '',
    title: t('siteName'),
    description: t('descriptions.download'),
  });
}

// Under static export this route's HTML body is entirely the Suspense fallback. The root is this
// product's first address, so that slot belongs to the real first screen rather than a loading caption.
//
// With the 2026-07-29 sign-off, `/`'s first screen changed from the map to the **gateway**, so the
// fallback moved with it — leaving it behind would make the primary address's link preview say
// something different from what actually opens. The map description stays on `/topology`, where it
// is true.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <Suspense fallback={<GatewayEntryFallback locale={locale} />}>
      <RootEntryPage />
    </Suspense>
  );
}
