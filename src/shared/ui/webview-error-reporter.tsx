'use client';

import { useEffect } from 'react';

import { sendWebviewErrorReport } from '@/shared/lib/report-webview-error';

/**
 * Forwards script errors and unhandled rejections, which React never sees, to the app log
 * (`src/shared/lib/report-webview-error.ts`). In the root layout because nothing else listens
 * inside the WKWebView. It renders no markup, so it cannot fail to paint.
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
