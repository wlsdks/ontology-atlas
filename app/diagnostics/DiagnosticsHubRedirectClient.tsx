'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// /diagnostics 자체는 인덱스 페이지 없음. 메인 화면인 /diagnostics/insights
// (오늘 챙길 곳) 로 자동 redirect.
export function DiagnosticsHubRedirectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/diagnostics/insights/?${qs}` : '/diagnostics/insights/');
  }, [router, searchParams]);

  // audit A8 — 이전엔 null 반환이라 redirect 완료 전 0px 빈 화면. 스크린 리더
  // 친화 sr-only 안내 + 시각적 경량 spinner 텍스트.
  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center text-[12px] text-[color:var(--color-text-tertiary)]"
      >
        운영 도구로 이동 중…
      </div>
    </main>
  );
}
