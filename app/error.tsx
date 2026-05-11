"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary. NextIntlClientProvider 가 [locale]/layout 에 마운트되어
 * 있어 root error 시점에서는 i18n provider 가 동작하지 않을 수 있다. last-resort
 * fallback 이므로 영어 하드코딩으로 안전하게 노출.
 */
export default function RouteError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10">
      <div className="w-full max-w-[440px] rounded-[22px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:rgba(244,183,49,0.35)] bg-[color:rgba(244,183,49,0.08)] text-[color:var(--color-status-warning)]">
            <AlertTriangle size={16} />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            Unexpected error
          </p>
        </div>
        <h1 className="mt-4 text-[22px] leading-[1.15] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          Something went wrong while rendering this screen.
        </h1>
        <p className="mt-3 text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
          It might be a temporary issue. Try again or return to the topology
          home. If it persists, please report it with the error ID below.
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
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.14)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          >
            <RefreshCw size={14} />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-full border border-[color:var(--color-divider)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          >
            Topology home
          </Link>
        </div>
      </div>
    </main>
  );
}
