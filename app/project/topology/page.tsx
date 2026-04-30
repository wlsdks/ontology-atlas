import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectTopologyClientPage } from "./ProjectTopologyClientPage";

// canonical 은 `/` (홈 토폴로지). 쿼리 기반 레거시 뷰는 색인 제외.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectTopologyClientPage />
    </Suspense>
  );
}

