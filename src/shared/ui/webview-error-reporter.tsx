'use client';

import { useEffect } from 'react';

import { sendWebviewErrorReport } from '@/shared/lib/report-webview-error';

/**
 * Mounted once in the root layout, beside `AccentBootScript`. It subscribes the
 * window to the two failures React never sees — a script error and a rejected
 * promise with no handler — and forwards them to the app log
 * (`src/shared/lib/report-webview-error.ts` owns the Tauri guard and the cap).
 *
 * **Why the root layout.** Inside the installed app's WKWebView nothing else is
 * listening: the developer console is not open, and a panel that dies during an
 * async callback leaves no trace at all. In the browser this component costs two
 * listeners and sends nothing.
 *
 * It renders no markup on purpose — a reporter that could itself fail to paint
 * would be reporting from inside the problem.
 */
export function WebviewErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      sendWebviewErrorReport({
        message: event.message || 'Uncaught error',
        source: event.filename || null,
        line: Number.isFinite(event.lineno) ? event.lineno : null,
        column: Number.isFinite(event.colno) ? event.colno : null,
        stack: event.error instanceof Error ? (event.error.stack ?? null) : null,
        kind: 'error',
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      sendWebviewErrorReport({
        message:
          reason instanceof Error
            ? reason.message || reason.name
            : String(reason ?? 'Unhandled rejection'),
        source: null,
        line: null,
        column: null,
        stack: reason instanceof Error ? (reason.stack ?? null) : null,
        kind: 'unhandledrejection',
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
