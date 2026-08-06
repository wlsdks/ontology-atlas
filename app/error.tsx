"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { controlClass } from '@/shared/ui/control-class';

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
      <div className="w-full max-w-[440px] rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-chip)] border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-status-warning)]">
            <AlertTriangle size={ICON_SIZE.lg} />
          </span>
          <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            Unexpected error
          </p>
        </div>
        <h1 className="mt-4 text-display tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          Something went wrong while rendering this screen.
        </h1>
        <p className="mt-3 text-body leading-body text-[color:var(--color-text-secondary)]">
          It might be a temporary issue. Try again or return to the topology
          home. If it persists, please report it with the error ID below.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-caption text-[color:var(--color-text-quaternary)]">
            Error ID: <span className="tabular-nums">{error.digest}</span>
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className={controlClass({ shape: "icon", className: "h-10 gap-2 rounded-full border border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a14)] px-4 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)]" })}
          >
            <RefreshCw size={ICON_SIZE.md} />
            Try again
          </button>
          <Link
            href="/"
            className={controlClass({ shape: "icon", tone: "secondary", className: "h-10 rounded-full border border-[color:var(--color-divider)] px-4 text-body hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)]" })}
          >
            Topology home
          </Link>
        </div>
      </div>
    </main>
  );
}
