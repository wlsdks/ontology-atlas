import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsHubPage } from "@/views/settings-hub";

export const metadata: Metadata = {
  title: '정리',
};

/**
 * /settings — 정리 surface 의 hub. 카테고리·상태·API 키·가져오기·오늘 챙길
 * 곳·마이그레이션 6개를 grouped list 로 drill-in. iOS Settings 결.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsHubPage />
    </Suspense>
  );
}
