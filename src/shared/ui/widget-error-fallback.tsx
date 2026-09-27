'use client';

import { useEffect } from 'react';

import { reportWebviewError } from '@/shared/lib/report-webview-error';
import { controlClass } from './control-class';

interface WidgetErrorFallbackProps {
  /** Forwarded to the app log, never printed on screen. */
  error: Error;
  onReset: () => void;
  title: string;
  /** One sentence: the rest of the screen still works. */
  body: string;
  retryLabel: string;
  className?: string;
}

/**
 * The compact surface a single widget shows when its render throws, so the rest of the screen
 * stays usable. The error goes to the app log through `reportWebviewError`.
 */
export function WidgetErrorFallback({
  error,
  onReset,
  title,
  body,
  retryLabel,
  className,
}: WidgetErrorFallbackProps) {
  // In an effect so a re-rendering fallback does not report again.
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
