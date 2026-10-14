import { Suspense } from "react";
import type { Metadata } from "next";
import { RootEntryPage } from '@/views/root-entry';
import { buildPageMetadata } from "@/shared/lib/public-pages/page-metadata";
import { routing } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { GatewayEntryFallback } from "@/shared/ui/fallbacks/gateway-entry-fallback";

// The indexed face of each locale is `/{locale}/download/`, which renders the same gateway with full
// static HTML; this page canonicalizes there per locale so the hreflang group stays intact.
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
    path: 'download',
    title: t('homeTitle'),
    description: t('descriptions.home'),
    absoluteTitle: true,
  });
}

// Under static export the HTML body is the Suspense fallback, so it must describe the real first
// screen (the gateway), not the map.
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
