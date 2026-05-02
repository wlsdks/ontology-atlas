'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGoogleButton, signInWithEmail, useUserAuth } from '@/features/user-auth';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui';

function resolveNextHref(nextParam: string | null, accountId?: string | null) {
  // 로그인 기본 도착지 = 워크스페이스 지도 (Layer 0). 사용자가 전체
  // 조망부터 보도록 `/projects` 리스트 대신 `/` 홈으로.
  if (!nextParam) return '/';
  return nextParam;
}

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = null;
  const nextHref = useMemo(
    () => resolveNextHref(searchParams.get('next'), accountId),
    [accountId, searchParams],
  );
  const { status } = useUserAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(nextHref);
    }
  }, [nextHref, router, status]);

  const signupHref = useMemo(() => {
    const url = new URL('/signup', 'http://local.test');
    const next = searchParams.get('next');
    if (next) url.searchParams.set('next', next);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [accountId, searchParams]);
  const passwordResetHref = useMemo(() => {
    const url = new URL('/reset-password', 'http://local.test');
    if (email.trim()) {
      url.searchParams.set('email', email.trim());
    }
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [accountId, email]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmail({ email, password });
      router.replace(nextHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-6 md:px-10">
      <h1 className="sr-only">로그인</h1>
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>로그인</CardTitle>
            <CardDescription>로그인하면 바로 이어서 볼 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AuthGoogleButton
              label="Google로 로그인"
              onSuccess={() => router.replace(nextHref)}
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[color:var(--color-divider)]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                또는 이메일 로그인
              </span>
              <div className="h-px flex-1 bg-[color:var(--color-divider)]" />
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field label="이메일">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className={inputClassName}
                  required
                />
              </Field>
              <Field label="비밀번호">
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="비밀번호"
                  className={inputClassName}
                  required
                />
              </Field>
              <div className="flex justify-end">
                <Link
                  href={passwordResetHref}
                  className="text-sm text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                >
                  비밀번호 재설정
                </Link>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="text-sm text-[color:var(--color-status-danger)]"
                >
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? '로그인 중...' : '이메일로 로그인'}
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border-soft)] pt-4">
              <p className="text-sm text-[color:var(--color-text-tertiary)]">
                아직 계정이 없나요?
              </p>
              <div className="flex items-center gap-2">
                <Link href={signupHref} className="inline-flex">
                  <Button variant="outline" type="button">
                    회원가입
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClassName =
  'h-11 rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 text-sm text-[color:var(--color-text-primary)] outline-none transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)]';
