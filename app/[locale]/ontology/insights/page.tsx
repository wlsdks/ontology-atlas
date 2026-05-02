import { Suspense } from "react";
import type { Metadata } from "next";
import { OntologyInsightsPage } from "@/views/ontology-insights";

export const metadata: Metadata = {
  title: "온톨로지 인사이트",
};

/**
 * /ontology/insights — ontology 의 활동·구조를 한눈에.
 * kind 분포 + 허브 노드 (degree 상위) + 최근 활동 + 미연결 노드.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <OntologyInsightsPage />
    </Suspense>
  );
}
