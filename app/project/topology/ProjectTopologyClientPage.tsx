'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { normalizeAccountId } from '@/shared/lib/account-scope';

/**
 * 구 `/project/topology/?slug=X` 라우트는 이제 `/project/[slug]` 상세 페이지에
 * 통합됐다. 상세 페이지가 "연결 지도" 섹션으로 같은 기능을 제공한다.
 * 기존 북마크·내부 링크 보존을 위해 삭제 대신 client-side redirect.
 */
export function ProjectTopologyClientPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const slug = searchParams.get('slug')?.trim() ?? '';
    const accountId = normalizeAccountId(searchParams.get('account'));
    if (!slug) {
      router.replace('/');
      return;
    }
    const qs = accountId ? `?account=${encodeURIComponent(accountId)}` : '';
    router.replace(`/project/${encodeURIComponent(slug)}/${qs}`);
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
        Redirecting…
      </p>
    </main>
  );
}
