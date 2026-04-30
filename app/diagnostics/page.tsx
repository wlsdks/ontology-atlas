import { Suspense } from "react";
import type { Metadata } from "next";
import { DiagnosticsHubRedirectClient } from "./DiagnosticsHubRedirectClient";

export const metadata: Metadata = {
  title: '오늘 챙길 곳',
};

/**
 * /diagnostics 진입 시 /diagnostics/insights 로 자동 이동.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <DiagnosticsHubRedirectClient />
    </Suspense>
  );
}
