import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectDetailClientPage } from "./ProjectDetailClientPage";

// `?slug=` 쿼리 기반 레거시 뷰어. canonical 경로는 `/project/[slug]/` 이므로
// 색인 대상에서 제외해 중복 SERP 를 방지한다.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectDetailClientPage />
    </Suspense>
  );
}
