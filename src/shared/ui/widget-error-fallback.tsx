'use client';

import { useEffect } from 'react';

import { reportWebviewError } from '@/shared/lib/report-webview-error';
import { controlClass } from './control-class';

interface WidgetErrorFallbackProps {
  /** The error the boundary caught. Forwarded to the app log, never printed on screen. */
  error: Error;
  /** The boundary's own reset — one button, one action. */
  onReset: () => void;
  /** Which panel failed, in the user's language. */
  title: string;
  /** One sentence: the rest of the screen still works. */
  body: string;
  /** The retry button's label. */
  retryLabel: string;
  className?: string;
}

/**
 * The compact surface a single widget shows when its render throws — the map
 * canvas, the coding-agent chat, the vault agent panel.
 *
 * **Why compact.** A boundary exists so one dead widget does not take the page with
 * it. A full-screen apology in a 360px dock would be the same failure with extra
 * steps: the user must still be able to read the map beside it.
 *
 * The error text itself stays off screen. A stack trace is not something a person
 * can act on, and the place it is actually needed — the installed app's log — is
 * where `reportWebviewError` sends it.
 */
export function WidgetErrorFallback({
  error,
  onReset,
  title,
  body,
  retryLabel,
  className,
}: WidgetErrorFallbackProps) {
  // In an effect, not during render: a fallback that re-renders must not re-report.
  useEffect(() => {
    reportWebviewError('render', error);
  }, [error]);

  return (
    <div
      role="alert"
      data-testid="widget-error-fallback"
      className={`flex h-full min-h-0 flex-col items-start justify-center gap-2 rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 ${className ?? ''}`}
    >
      <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {title}
      </p>
      <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{body}</p>
      <button
        type="button"
        onClick={onReset}
        className={controlClass({
          shape: 'pill',
          size: 'lg',
          tone: 'secondary',
          hoverInk: 'strong',
          hoverBorder: 'strong',
          className: 'mt-1 border-[color:var(--color-divider)]',
        })}
      >
        {retryLabel}
      </button>
    </div>
  );
}
