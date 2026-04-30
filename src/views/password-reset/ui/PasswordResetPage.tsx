'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { sendPasswordReset } from '@/features/user-auth';
import { ACCOUNT_QUERY_KEY, appendAccountQuery } from '@/shared/lib/account-scope';
import { useScopedAccountId } from "@/shared/lib/use-scoped-account-id";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui';

export function PasswordResetPage() {
  const searchParams = useSearchParams();
  const accountId = useScopedAccountId(searchParams.get(ACCOUNT_QUERY_KEY));
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loginHref = useMemo(() => appendAccountQuery('/login', accountId), [accountId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await sendPasswordReset({ email });
      setSuccess('재설정 메일을 보냈습니다. 이메일을 확인해주세요.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '재설정 메일 전송에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-6 md:px-10">
      <h1 className="sr-only">비밀번호 재설정</h1>
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <Link href={loginHref} className="inline-flex">
          <Button variant="outline" type="button" className="gap-2 rounded-full">
            <ArrowLeft size={15} />
            로그인으로 돌아가기
          </Button>
        </Link>

        <Card className="rounded-[28px]">
          <CardHeader>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              계정 복구
            </p>
            <CardTitle>비밀번호 재설정</CardTitle>
            <CardDescription>로그인에 쓰는 이메일로 재설정 안내를 보냅니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  이메일
                </span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  className={inputClassName}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-[color:var(--color-status-danger)]">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="flex items-center gap-2 text-sm text-[color:var(--color-indigo-accent)]">
                  <MailCheck size={15} />
                  {success}
                </p>
              ) : null}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? '보내는 중...' : '재설정 메일 보내기'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

const inputClassName =
  'h-11 rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 text-sm text-[color:var(--color-text-primary)] outline-none transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)]';
