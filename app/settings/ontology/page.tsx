import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsOntologyPage } from "@/views/settings-ontology";

export const metadata: Metadata = {
  title: '온톨로지 schema',
};

/**
 * /settings/ontology — 활성 TBox 보기 + (곧) 클래스/관계 추가 surface.
 * P1 Phase 2 첫 슬라이스: read-only.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsOntologyPage />
    </Suspense>
  );
}
