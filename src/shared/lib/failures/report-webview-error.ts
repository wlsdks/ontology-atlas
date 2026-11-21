import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * Nobody watches the WKWebView console, so failures go to the Rust app log. Never a second failure:
 * a no-op outside Tauri, invoke results swallowed, and at most `WEBVIEW_ERROR_REPORT_CAP` per page.
 */

/** The three shapes a WebView failure arrives in. Mirrored by the Rust command. */
type WebviewErrorKind = 'error' | 'unhandledrejection' | 'render';

/**
 * The exact argument object `log_webview_error` takes. The names are a contract
 * with `src-tauri`; renaming a field here silently drops it on the Rust side.
 */
interface WebviewErrorReport {
  message: string;
  source: string | null;
  line: number | null;
  column: number | null;
  stack: string | null;
  kind: WebviewErrorKind;
}

/** Per page load, so an error loop firing every frame cannot flood IPC. */
const WEBVIEW_ERROR_REPORT_CAP = 20;

let reportsSent = 0;

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!isTauri()) return null;
  } catch {
    return null;
  }
  return (command, args) => tauriInvoke(command, args);
}

/** Trim a message to something a log line can carry without becoming the log. */
function clampMessage(value: string): string {
  return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
}

/**
 * Send one already-shaped report. Returns whether it was handed to the runtime, so
 * the rate limit is observable in a test without exposing the counter.
 */
export function sendWebviewErrorReport(report: WebviewErrorReport): boolean {
  if (reportsSent >= WEBVIEW_ERROR_REPORT_CAP) return false;
  const invoke = getInvoke();
  if (!invoke) return false;
  reportsSent += 1;
  try {
    void invoke('log_webview_error', {
      message: clampMessage(report.message),
      source: report.source,
      line: report.line,
      column: report.column,
      stack: report.stack,
      kind: report.kind,
    }).catch(() => {});
  } catch {
    // A runtime that refuses the call is not worth a second failure.
  }
  return true;
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? null };
  }
  if (typeof error === 'string') return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/**
 * Forward a caught error — a route error boundary, the global error screen, or a
 * widget boundary's fallback. The caller keeps its own `console.error`; this adds
 * the app log the installed shell reads.
 */
export function reportWebviewError(kind: WebviewErrorKind, error: unknown): void {
  const { message, stack } = describe(error);
  sendWebviewErrorReport({
    message,
    source: null,
    line: null,
    column: null,
    stack,
    kind,
  });
}
