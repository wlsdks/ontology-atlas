import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectFallbackClient } from "./ProjectFallbackClient";

// 정적 export 환경에서 빌드 시점에 알 수 없는 slug 가 들어와도 client
// side 에서 URL 로부터 slug 를 추출해 ProjectDetailPage 를 렌더한다.
// (R10 이전 Firebase Hosting rewrite 가 이 경로로 라우팅했지만 cloud
// surface 영구 제거 후 단순 client-side fallback 으로 유지 — 빌드 시점
// 에 prerender 안 된 slug 진입을 방지.)
//
// 빌드 타임에 알려진 slug 는 /project/[slug]/index.html 이 우선이라
// 이 페이지는 직접 진입 (또는 unknown slug) 시에만 발화.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "projectPages.detail",
  });
  // Korean i18n 의 topBarProjectFallback 가 "Project" 영어로 남아있어서
  // (project breadcrumb 영문 의도) 별도 topBarProjectsLabel 을 사용 —
  // ko: "프로젝트" / en: "Projects" 로 정확히 localized 됨.
  return {
    title: t("topBarProjectsLabel"),
  };
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectFallbackClient />
    </Suspense>
  );
}
