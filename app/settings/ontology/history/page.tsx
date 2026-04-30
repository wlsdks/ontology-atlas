import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsOntologyHistoryPage } from "@/views/settings-ontology-history";

export const metadata: Metadata = {
  title: '온톨로지 schema 히스토리',
};

/**
 * /settings/ontology/history — 과거 TBox version snapshot 목록 (read-only).
 * P1 Phase 2 closure.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsOntologyHistoryPage />
    </Suspense>
  );
}
