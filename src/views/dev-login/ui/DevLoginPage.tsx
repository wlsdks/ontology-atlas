'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { canUseDevAdminBypass, enableDevAdminBypass } from '@/features/permissions';
import { ACCOUNT_QUERY_KEY, appendAccountQuery, rememberAccountId } from '@/shared/lib/account-scope';
import { Button } from '@/shared/ui';

function subscribeNoop() {
  return () => {};
}

export function DevLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const allowed = isClient ? canUseDevAdminBypass() : null;
  const accountId = searchParams.get(ACCOUNT_QUERY_KEY);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)]">
          개발 환경 우회 로그인
        </h1>
        <p className="mt-2 text-sm text-[color:var(--color-text-tertiary)]">
          로컬에서 인증 없이 진입합니다. production 빌드에서는 노출되지 않습니다.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {allowed === null ? (
            <div className="rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 text-sm text-[color:var(--color-text-secondary)]">
              로컬 환경을 확인하는 중입니다.
            </div>
          ) : allowed ? (
            <Button
              onClick={() => {
                enableDevAdminBypass();
                rememberAccountId(accountId);
                router.push(appendAccountQuery('/projects/', accountId));
              }}
            >
              개발용 로컬 우회로 접속
            </Button>
          ) : (
            <div className="rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 text-sm text-[color:var(--color-text-secondary)]">
              이 경로는 localhost/127.0.0.1 에서만 사용할 수 있습니다.
            </div>
          )}

          <Link href="/login/" className="text-sm text-[color:var(--color-text-tertiary)] underline">
            일반 로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
