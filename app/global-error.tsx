"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./globals.css";
import { controlClass } from '@/shared/ui/control-class';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The last line of defence for the root layout itself throwing during render. `error.tsx` works only
 * while the layout is fine, so without global-error that situation shows the browser's default error
 * screen and the product identity breaks. `NextIntlClientProvider` does not run on this last-resort
 * surface, so the text is hardcoded English.
 */
export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
        <main className="flex min-h-screen items-center justify-center px-6 py-10">
          <div className="w-full max-w-[440px] rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-6">
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              Critical error
            </p>
            <h1 className="mt-3 text-display tracking-[var(--tracking-section)] font-[var(--font-weight-signature)]">
              Something went wrong while booting the app.
            </h1>
            <p className="mt-3 text-body leading-body text-[color:var(--color-text-secondary)]">
              Browser cache, extensions, or network issues may be at play.
              Please refresh the page or return to the home screen.
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
                className={controlClass({ shape: "icon", className: "h-10 gap-2 rounded-full border border-[color:var(--color-indigo-a38)] bg-[color:var(--color-indigo-a14)] px-4 text-body font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)]" })}
              >
                Try again
              </button>
              <Link
                href="/"
                className={controlClass({ hoverInk: 'strong', hoverBorder: 'strong', shape: "icon", tone: "secondary", className: "h-10 rounded-full border border-[color:var(--color-divider)] px-4 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)]" })}
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
