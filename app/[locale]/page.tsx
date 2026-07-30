import { Suspense } from "react";
import type { Metadata } from "next";
import { RootEntryPage } from '@/views/root-entry';
import { buildPageMetadata } from "@/shared/lib/page-metadata";
import { routing } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { GatewayEntryFallback } from "@/shared/ui/gateway-entry-fallback";

// 각 locale page 의 canonical 은 *자기 자신 URL* 이어야 hreflang group 이
// 정확히 동작. 이전엔 모든 locale 이 `/` 로 통일됐는데, 그러면 `/en/` 과
// `/ko/` 가 같은 canonical → 검색엔진이 둘 중 하나만 색인 (한쪽 dedup).
// hreflang map (layout.tsx) 의 trailing slash 정합 (PR #231) 과 같은 방향
// 정정 — locale 별 명시 canonical.
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

// 정적 export 에서 이 라우트의 HTML 본문은 Suspense fallback 이 전부다. 루트는
// 이 제품의 첫 주소이므로 그 자리를 로딩 자막이 아니라 실제 첫 화면이 갖는다.
//
// 2026-07-29 서명으로 `/` 의 첫 화면이 지도에서 **관문**으로 바뀌었으므로
// fallback 도 함께 옮겼다 — 안 옮기면 대표 주소의 링크 미리보기가 실제로
// 열리는 화면과 다른 말을 한다. 지도 설명은 그 말이 맞는 `/topology` 에 남는다.
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
