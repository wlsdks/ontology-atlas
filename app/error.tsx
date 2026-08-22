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
 * Root error boundary. `NextIntlClientProvider` is mounted in `[locale]/layout`, so the i18n
 * provider may not be running when a root error occurs. As a last-resort fallback, the text is
 * hardcoded English so it always renders.
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
        {/*
          ⚠️ **Both used to be `shape: "icon"`** (owner report 2026-08-17). That shape is for square
          icons only — `justify-center`, `shrink-0`, no horizontal padding — so putting a label in it
          made the text overflow the box, wrap to two lines, and overlap itself. That is exactly how
          it rendered.

          The shape for a labelled control is `pill`, and the `rounded-full` and `border` the code
          was adding by hand are what that shape already provides. Use the real shape instead of
          imitating it.
        */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className={controlClass({ shape: "pill", className: "h-10 gap-2 border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a14)] px-4 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)]" })}
          >
            <RefreshCw size={ICON_SIZE.md} />
            Try again
          </button>
          <Link
            href="/"
            className={controlClass({ hoverInk: 'strong', hoverBorder: 'strong', shape: "pill", tone: "secondary", className: "h-10 border-[color:var(--color-divider)] px-4 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)]" })}
          >
            Topology home
          </Link>
        </div>
      </div>
    </main>
  );
}
