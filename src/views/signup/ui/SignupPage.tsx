'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGoogleButton, signInWithDemo, signUpWithEmail, useUserAuth } from '@/features/user-auth';
import { getDemoProjectsHref } from '@/shared/config/demo-space';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui';
import { ACCOUNT_QUERY_KEY, appendAccountQuery } from '@/shared/lib/account-scope';
import { useScopedAccountId } from "@/shared/lib/use-scoped-account-id";

function resolveNextHref(nextParam: string | null, accountId?: string | null) {
  // 회원가입 직후 기본 도착지 = 자기 워크스페이스 지도 (Layer 0).
  if (!nextParam) return appendAccountQuery('/', accountId);
  return appendAccountQuery(nextParam, accountId);
}

export function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = useScopedAccountId(searchParams.get(ACCOUNT_QUERY_KEY));
  const nextHref = useMemo(
    () => resolveNextHref(searchParams.get('next'), accountId),
    [accountId, searchParams],
  );
  const { status } = useUserAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(nextHref);
    }
  }, [nextHref, router, status]);

  const loginHref = useMemo(() => {
    const url = new URL(appendAccountQuery('/login', accountId), 'http://local.test');
    const next = searchParams.get('next');
    if (next) url.searchParams.set('next', next);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [accountId, searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('비밀번호는 8자 이상으로 입력해주세요.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signUpWithEmail({ displayName, email, password });
      router.replace(nextHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setDemoSubmitting(true);
    setError(null);
    try {
      await signInWithDemo();
      router.replace(getDemoProjectsHref());
    } catch (err) {
      setError(err instanceof Error ? err.message : '데모 로그인에 실패했습니다.');
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-6 md:px-10">
      <h1 className="sr-only">계정 만들기</h1>
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <Card className="rounded-[28px]">
          <CardHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              Narnia 시작
            </p>
            <CardTitle>계정 만들기</CardTitle>
            <CardDescription>가입하면 바로 프로젝트로 들어갑니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AuthGoogleButton
              label="Google로 바로 가입"
              onSuccess={() => router.replace(nextHref)}
            />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[color:var(--color-divider)]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                또는 이메일로 가입
              </span>
              <div className="h-px flex-1 bg-[color:var(--color-divider)]" />
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field label="이름">
                <input
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="표시할 이름"
                  className={inputClassName}
                  required
                />
              </Field>
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
              <Field
                label="비밀번호"
                helper={passwordLengthHelper(password)}
              >
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="8자 이상 비밀번호"
                  className={inputClassName}
                  required
                  aria-describedby="signup-password-helper"
                />
              </Field>
              <Field
                label="비밀번호 확인"
                helper={passwordMatchHelper(password, confirmPassword)}
              >
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="비밀번호를 한 번 더"
                  className={inputClassName}
                  required
                  aria-describedby="signup-confirm-helper"
                />
              </Field>
              {error ? (
                <p role="alert" className="text-sm text-[color:var(--color-status-danger)]">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={submitting || !canSubmit(password, confirmPassword)}
                className="w-full"
              >
                {submitting ? '가입 중...' : '이메일로 회원가입'}
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border-soft)] pt-4">
              <p className="text-sm text-[color:var(--color-text-tertiary)]">
                이미 계정이 있나요?
              </p>
              <div className="flex items-center gap-2">
                <Link href={loginHref} className="inline-flex">
                  <Button variant="outline" type="button">
                    로그인
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={demoSubmitting}
                  onClick={() => void handleDemoLogin()}
                >
                  {demoSubmitting ? '데모 로그인 중...' : '데모 로그인'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

interface HelperState {
  text: string;
  /** 아직 입력 안 됐으면 'idle', 조건 충족이면 'ok', 미충족이면 'warn' */
  tone: 'idle' | 'ok' | 'warn';
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: HelperState;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
      {children}
      {helper ? (
        <span
          className={[
            'text-[11px] leading-5',
            helper.tone === 'ok'
              ? 'text-[color:var(--color-status-success)]'
              : helper.tone === 'warn'
                ? 'text-[color:var(--color-status-paused)]'
                : 'text-[color:var(--color-text-quaternary)]',
          ].join(' ')}
        >
          {helper.text}
        </span>
      ) : null}
    </label>
  );
}

function passwordLengthHelper(password: string): HelperState {
  if (password.length === 0) return { text: '8자 이상.', tone: 'idle' };
  if (password.length < 8)
    return {
      text: `${password.length}자 — 8자 이상 필요.`,
      tone: 'warn',
    };
  return { text: `${password.length}자 — 충분해요.`, tone: 'ok' };
}

function passwordMatchHelper(
  password: string,
  confirmPassword: string,
): HelperState {
  if (confirmPassword.length === 0)
    return { text: '위 비밀번호와 같게 한 번 더.', tone: 'idle' };
  if (password !== confirmPassword)
    return { text: '아직 일치하지 않아요.', tone: 'warn' };
  return { text: '일치합니다.', tone: 'ok' };
}

function canSubmit(password: string, confirmPassword: string): boolean {
  return password.length >= 8 && password === confirmPassword;
}

const inputClassName =
  'h-11 rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 text-sm text-[color:var(--color-text-primary)] outline-none transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)]';
