'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function ReviewHubRedirectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/review/knowledge/?${qs}` : '/review/knowledge/');
  }, [router, searchParams]);

  // audit A8 — null 대신 sr-only + 경량 안내. redirect 완료 전 빈 화면 회피.
  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center text-[12px] text-[color:var(--color-text-tertiary)]"
      >
        검수 큐로 이동 중…
      </div>
    </main>
  );
}
