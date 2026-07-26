import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectFallbackClient } from "./ProjectFallbackClient";
import { RouteLoadingFallback } from "@/shared/ui";

// 정적 export 환경에서 빌드 시점에 알 수 없는 로컬 vault slug도 query로
// 받아 ProjectDetailPage 또는 ProjectEditorPage를 렌더한다. R10 이전
// Firebase Hosting rewrite pathname도 하위 호환으로 계속 해석한다.
//
// 빌드 타임에 알려진 공개 slug의 /project/[slug]/ canonical은 그대로 두고,
// 앱 내부 이동은 이 정적 파일 하나를 사용해 임의 slug 404를 피한다.
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
    <Suspense fallback={<RouteLoadingFallback />}>
      <ProjectFallbackClient />
    </Suspense>
  );
}
