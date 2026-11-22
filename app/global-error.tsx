"use client";

import { useEffect } from "react";
import "./globals.css";
import { BootFailureScreen } from '@/views/terminal-state';
import { reportWebviewError } from '@/shared/lib/failures/report-webview-error';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[global-error]", error);
    // The installed app has no console anyone reads; the same error goes to the app log.
    reportWebviewError("render", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
        <BootFailureScreen digest={error.digest} onRetry={reset} />
      </body>
    </html>
  );
}
