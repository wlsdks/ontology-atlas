"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./globals.css";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 루트 layout 자체가 렌더 중 터진 경우를 최후 방어한다. `error.tsx` 는 layout
 * 이 정상일 때만 동작하므로 global-error 가 없으면 그 상황에서 브라우저 기본
 * 에러 화면이 노출돼 Demo 아이덴티티가 깨진다. NextIntlClientProvider 가 작동
 * 하지 않는 last-resort surface 이므로 텍스트는 영어 하드코딩.
 */
export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
        <main className="flex min-h-screen items-center justify-center px-6 py-10">
          <div className="w-full max-w-[440px] rounded-[22px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              Critical error
            </p>
            <h1 className="mt-3 text-[22px] leading-[1.15] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)]">
              Something went wrong while booting the app.
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
              Browser cache, extensions, or network issues may be at play.
              Please refresh the page or return to the home screen.
            </p>
            {error.digest && (
              <p className="mt-3 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                Error ID: <span className="tabular-nums">{error.digest}</span>
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.14)] px-4 text-[13px] font-[var(--font-weight-signature)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              >
                Try again
              </button>
              <Link
                href="/"
                className="inline-flex h-10 items-center rounded-full border border-[color:var(--color-divider)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              >
                Home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
