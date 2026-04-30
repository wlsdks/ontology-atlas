import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectFallbackClient } from "./ProjectFallbackClient";

// 정적 export 환경에서 빌드 시점에 알 수 없는 slug (예: account-scoped
// workspace 의 사용자별 프로젝트) 가 들어와도 client side 에서 Firestore
// 로 직접 조회해 ProjectDetailPage 를 렌더한다.
//
// Firebase Hosting rewrite (firebase.json):
//   /project/** -> /project/fallback/index.html
// 가 매칭돼 정적 파일이 없는 slug 가 이 페이지로 보내진다.
//
// 빌드 타임에 알려진 slug 는 /project/[slug]/index.html 이 우선이라
// rewrite 가 동작하지 않는다. (Next.js 의 `_` 접두사 폴더는 private 으로
// 라우팅 제외 — 그래서 underscore 없이 `fallback` 으로 둔다.)
export const metadata: Metadata = {
  title: "프로젝트",
  description: "프로젝트 상세",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectFallbackClient />
    </Suspense>
  );
}
