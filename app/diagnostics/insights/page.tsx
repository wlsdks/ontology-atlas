import { Suspense } from "react";
import type { Metadata } from "next";
import { InsightsPage } from "@/views/diagnostics-insights";

export const metadata: Metadata = {
  title: '오늘 챙길 곳',
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InsightsPage />
    </Suspense>
  );
}
