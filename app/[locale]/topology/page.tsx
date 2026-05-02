import { Suspense } from "react";
import type { Metadata } from "next";
import { HomePage } from "@/views/home";
import { absoluteUrl } from "@/shared/config";

/**
 * `/topology` — Sigma WebGL 토폴로지 view.
 *
 * Phase 1 (Direction A) 진행 중: 토폴로지는 출구 view 중 하나로 격하되며
 * `/` 는 ontology hub 가 된다. 이 라우트는 토폴로지 자체로의 명시적 진입점.
 *
 * 현재는 `/` 와 동일한 HomePage 렌더 (alias). `/` 가 ontology hub 로 교체된
 * 다음 sub-step 이후엔 토폴로지 전용 surface 가 됨.
 */
export const metadata: Metadata = {
  title: "토폴로지",
  description: "프로젝트 의존도 지도. 온톨로지의 한 출구 view.",
  alternates: {
    canonical: absoluteUrl("/topology/"),
  },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}
