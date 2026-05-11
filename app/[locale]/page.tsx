import { Suspense } from "react";
import type { Metadata } from "next";
import { RootEntryPage } from '@/views/root-entry';
import { absoluteUrl } from "@/shared/config";
import { routing } from "@/i18n/routing";

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
  return {
    alternates: {
      canonical: absoluteUrl(`/${safeLocale}/`),
    },
  };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RootEntryPage />
    </Suspense>
  );
}
