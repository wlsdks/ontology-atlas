"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportClientError } from "@/entities/client-error";
import { getFirebaseAuth } from "@/shared/api";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RouteError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[route-error]", error);

    // Firestore 에 에러 기록 (계정 멤버일 때만 rule 통과). 비동기 fire-and-forget.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const accountId = params.get("account")?.trim() ?? "";
    if (!accountId) return;

    let uid: string | null = null;
    try {
      uid = getFirebaseAuth().currentUser?.uid ?? null;
    } catch {
      /* auth 미초기화 */
    }

    void reportClientError({
      accountId,
      message: error.message || String(error),
      stack: error.stack,
      url: `${window.location.pathname}${window.location.search}`,
      userAgent: window.navigator.userAgent,
      uid,
      digest: error.digest,
      kind: "route",
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10">
      <div className="w-full max-w-[440px] rounded-[22px] border border-[color:rgba(255,255,255,0.08)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:rgba(244,183,49,0.35)] bg-[color:rgba(244,183,49,0.08)] text-[color:var(--color-status-warning)]">
            <AlertTriangle size={16} />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            예기치 않은 오류
          </p>
        </div>
        <h1 className="mt-4 text-[22px] leading-[1.15] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          화면을 그리는 도중 문제가 생겼습니다.
        </h1>
        <p className="mt-3 text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
          일시적인 문제일 수 있습니다. 다시 시도하거나 토폴로지 홈으로 돌아가세요.
          계속 발생하면 아래 오류 ID 와 함께 보고해주세요.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
            오류 ID: <span className="tabular-nums">{error.digest}</span>
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.14)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          >
            <RefreshCw size={14} />
            다시 시도
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-full border border-[color:rgba(255,255,255,0.08)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(255,255,255,0.14)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(255,255,255,0.22)]"
          >
            토폴로지 홈으로
          </Link>
        </div>
      </div>
    </main>
  );
}
