'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, MailCheck, ShieldCheck, UserRound } from 'lucide-react';
import {
  changePassword,
  getCurrentAuthProfile,
  getPasswordSupportState,
  sendPasswordReset,
  useUserAuth,
  type PasswordSupportState,
} from '@/features/user-auth';
import { useScopedAccountAccess } from '@/features/account-scope';
import { AccountMembersPanel } from '@/features/account-members';
import { hasDemoSession } from '@/shared/lib/demo-session';
import { ACCOUNT_QUERY_KEY, appendAccountQuery } from '@/shared/lib/account-scope';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui';
import { PublicAccountMenu } from '@/widgets/account-menu';

function resolveLoginHref(accountId?: string | null) {
  const url = new URL('/login', 'http://local.test');
  url.searchParams.set('next', '/account');
  return `${url.pathname}?${url.searchParams.toString()}`;
}

// SSR · 클라이언트 첫 paint 공통 placeholder. hydrated 후 실제
// getPasswordSupportState() 로 교체. providerLabel 이 mismatch 의
// 직접 원인이라 SSR 에서 절대 분기되지 않는 안전 값으로 잡는다.
const PASSWORD_SUPPORT_PLACEHOLDER: PasswordSupportState = {
  canChangePassword: false,
  canResetPassword: false,
  providerLabel: '확인 중',
  reason: '계정 상태를 확인하고 있어요.',
};

export function AccountSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = null;
  const { status, user } = useUserAuth();
  const scopedAccess = useScopedAccountAccess(accountId);
  const hasBeenAuthenticatedRef = useRef(false);
  const [profileEmail, setProfileEmail] = useState(user?.email ?? '');
  const [profileRoles, setProfileRoles] = useState<string[]>(user?.roles ?? []);
  // hasDemoSession() 이 window.localStorage 를 읽기 때문에 SSR("게스트")
  // 과 클라이언트 첫 paint("데모 로그인") 사이 hydration mismatch 발생.
  // SSR · 클라이언트 첫 paint 모두 placeholder 로 그려 mismatch 차단,
  // mount 후 useEffect 에서 실제 상태로 교체.
  const [passwordSupport, setPasswordSupport] = useState<PasswordSupportState>(
    PASSWORD_SUPPORT_PLACEHOLDER,
  );
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    setPasswordSupport(getPasswordSupportState());
  }, []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeSubmitting, setChangeSubmitting] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState(user?.email ?? '');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const loginHref = useMemo(() => resolveLoginHref(accountId), [accountId]);
  const backHref = '/projects';

  useEffect(() => {
    if (status === 'authenticated') {
      hasBeenAuthenticatedRef.current = true;
      return;
    }

    if (status === 'unauthenticated') {
      router.replace(hasBeenAuthenticatedRef.current ? backHref : loginHref);
    }
  }, [backHref, loginHref, router, status]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;

    const run = async () => {
      try {
        const profile = await getCurrentAuthProfile();
        if (cancelled || !profile) return;
        setProfileEmail(profile.email ?? '');
        setResetEmail(profile.email ?? '');
        setProfileRoles(profile.roles ?? []);
        setPasswordSupport(getPasswordSupportState());
      } catch {
        if (cancelled) return;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setChangeError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setChangeSubmitting(true);
    setChangeError(null);
    setChangeSuccess(null);

    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangeSuccess('비밀번호를 변경했습니다.');
    } catch (error) {
      setChangeError(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setChangeSubmitting(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetSubmitting(true);
    setResetError(null);
    setResetSuccess(null);

    try {
      await sendPasswordReset({ email: resetEmail });
      setResetSuccess('재설정 안내를 보냈습니다. 이메일을 확인해주세요.');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : '재설정 메일 전송에 실패했습니다.');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)] px-6 py-8 md:px-10">
      <h1 className="sr-only">계정 설정</h1>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <Link href={backHref} className="inline-flex">
            <Button variant="outline" type="button" className="gap-2 rounded-full">
              <ArrowLeft size={15} />
              이전 화면
            </Button>
          </Link>
          <PublicAccountMenu accountId={accountId} accountLabel={accountId} />
        </div>

        <Card className="rounded-[28px]">
          <CardHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              계정
            </p>
            <CardTitle>계정 설정</CardTitle>
            <CardDescription>로그인 상태와 비밀번호를 여기서 관리합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-5">
              <Card className="rounded-[24px] border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <UserRound size={18} />
                    내 정보
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-[color:var(--color-text-secondary)]">
                  <ProfileRow
                    label="이름"
                    value={user?.displayName?.trim() || null}
                  />
                  <ProfileRow label="이메일" value={profileEmail || null} />
                  <ProfileRow
                    label="로그인 방식"
                    value={passwordSupport.providerLabel}
                  />
                  <ProfileRow
                    label="권한"
                    value={
                      // 데모 세션은 role chip 이 "데모 체험 중" 으로 노출되는
                      // 헤더 PublicAccountMenu 와 일관되게 여기도
                      // "데모 체험 중" 우선. 데모 아니고 account 쿼리가 있으면
                      // 실 역할 (owner/editor/viewer/admin) 표시. 그 외는
                      // global roles 폴백.
                      !hydrated
                        ? '확인 중'
                        : hasDemoSession()
                          ? '데모 체험 중'
                          : accountId && scopedAccess.kind !== 'loading' && scopedAccess.kind !== 'guest'
                            ? scopedAccess.roleLabel
                            : profileRoles.length > 0
                              ? profileRoles.join(', ')
                              : '기본 사용자'
                    }
                  />
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldCheck size={18} />
                    비밀번호 변경
                  </CardTitle>
                  <CardDescription>
                    현재 비밀번호를 확인한 뒤 새 비밀번호로 바꿉니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {passwordSupport.canChangePassword ? (
                    <form className="space-y-4" onSubmit={handleChangePassword}>
                      <Field label="현재 비밀번호">
                        <input
                          name="currentPassword"
                          type="password"
                          autoComplete="current-password"
                          className={inputClassName}
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          required
                        />
                      </Field>
                      <Field label="새 비밀번호">
                        <input
                          name="newPassword"
                          type="password"
                          autoComplete="new-password"
                          className={inputClassName}
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          required
                        />
                      </Field>
                      <Field label="새 비밀번호 확인">
                        <input
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          className={inputClassName}
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                        />
                      </Field>
                      {changeError ? (
                        <p className="text-sm text-[color:var(--color-status-danger)]">{changeError}</p>
                      ) : null}
                      {changeSuccess ? (
                        <p className="text-sm text-[color:var(--color-indigo-accent)]">{changeSuccess}</p>
                      ) : null}
                      <Button type="submit" disabled={changeSubmitting}>
                        {changeSubmitting ? '변경 중...' : '비밀번호 변경'}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                      {passwordSupport.reason ?? '이 로그인 방식에서는 비밀번호를 직접 바꾸지 않습니다.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="space-y-5">
              <Card className="rounded-[24px] border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MailCheck size={18} />
                    비밀번호 재설정
                  </CardTitle>
                  <CardDescription>
                    로그인에 문제가 있으면 재설정 메일을 다시 받을 수 있습니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {passwordSupport.canResetPassword ? (
                    <form className="space-y-4" onSubmit={handleResetPassword}>
                      <Field label="이메일">
                        <input
                          name="resetEmail"
                          type="email"
                          autoComplete="email"
                          className={inputClassName}
                          value={resetEmail}
                          onChange={(event) => setResetEmail(event.target.value)}
                          required
                        />
                      </Field>
                      {resetError ? (
                        <p className="text-sm text-[color:var(--color-status-danger)]">{resetError}</p>
                      ) : null}
                      {resetSuccess ? (
                        <p className="text-sm text-[color:var(--color-indigo-accent)]">{resetSuccess}</p>
                      ) : null}
                      <Button type="submit" variant="outline" disabled={resetSubmitting}>
                        {resetSubmitting ? '보내는 중...' : '재설정 메일 보내기'}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                      {passwordSupport.reason ?? '이 로그인 방식에서는 재설정 메일을 보내지 않습니다.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          </CardContent>
        </Card>

        {/* 멤버 관리 — owner 만 노출. 데모 세션은 mocks 상 owner 매핑이지만
            실 Cloud Function 호출은 불가 (permission-denied) 이므로 panel 도
            같이 숨김. 실 Google/email 로그인한 owner 에게만 active. */}
        {scopedAccess.kind === 'owner' && accountId && !hasDemoSession() ? (
          <div className="mt-8">
            <AccountMembersPanel
              accountId={accountId}
              currentUid={user?.uid}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ProfileRow({
  label,
  value,
}: {
  label: string;
  /** null/공백이면 "미설정"을 mono 톤으로 표시. 실제 값과 시각적으로 구분. */
  value: string | null;
}) {
  const trimmed = value?.trim() ?? '';
  const isEmpty = trimmed.length === 0;
  return (
    <div className="grid gap-1 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      {isEmpty ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
          미설정
        </p>
      ) : (
        <p className="text-sm text-[color:var(--color-text-primary)]">{trimmed}</p>
      )}
    </div>
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
