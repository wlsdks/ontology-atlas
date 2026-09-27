'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { PAGE_GUTTER } from '@/shared/lib/gateway-frame';

/**
 * The one dead-end shape for the 404 and the render error: a centred stage with the gateway's
 * headline step and one primary beside its secondary exits, never a vertical menu of equals.
 */
export interface TerminalStateProps {
  /** Colours the icon tile and its light. */
  tone: 'neutral' | 'warning';
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  detail?: ReactNode;
  /** The first child is the single primary. */
  actions: ReactNode;
  chrome?: ReactNode;
  footer?: ReactNode;
  testId: string;
}

const TILE_TONE = {
  neutral:
    'border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a10)] text-[color:var(--color-indigo-pale-a92)]',
  warning:
    'border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-status-warning)]',
} as const;

/* The tile's hue, or "something broke" splits across two colours. */
const GLOW_TONE = {
  neutral:
    'bg-[radial-gradient(52%_62%_at_50%_46%,var(--color-indigo-a10)_0%,var(--color-indigo-a06)_40%,transparent_76%)]',
  warning:
    'bg-[radial-gradient(52%_62%_at_50%_46%,var(--color-amber-source-a08)_0%,var(--color-amber-source-a06)_40%,transparent_76%)]',
} as const;

/** Shown until `useClientAnswered`, so the stage's entrance is the first thing that moves. */
export function TerminalStatePending({ testId }: { testId: string }) {
  return (
    <div
      data-testid={testId}
      aria-busy="true"
      className="min-h-screen w-full bg-[color:var(--color-canvas)]"
    />
  );
}

export function TerminalState({
  tone,
  icon,
  eyebrow,
  title,
  body,
  detail,
  actions,
  chrome,
  footer,
  testId,
}: TerminalStateProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-[color:var(--color-canvas)]">
      {chrome}
      <main
        id="main"
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          PAGE_GUTTER,
          /* Optical centre: heavier bottom padding lifts the middle to about 46% of the viewport. */
          'relative isolate flex flex-1 items-center justify-center overflow-hidden pt-16 pb-[calc(4rem+14svh)]',
        )}
      >
        <div
          aria-hidden
          className={cn('pointer-events-none absolute inset-0 -z-10', GLOW_TONE[tone])}
        />
        <div className="flex w-full max-w-[var(--measure-note-column)] flex-col items-center text-center motion-safe:animate-[atlasStatusIn_var(--motion-settle)_var(--motion-ease)_both]">
          <span
            aria-hidden
            className={cn(
              'flex size-10 items-center justify-center rounded-panel border shadow-[var(--shadow-elevation-2)]',
              TILE_TONE[tone],
            )}
          >
            {icon}
          </span>
          <p className="mt-6 font-mono text-label leading-label uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-tertiary)]">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-balance text-hero-lg leading-hero-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {title}
          </h1>
          <p className="mt-4 text-balance text-body-lg leading-prose text-[color:var(--color-text-secondary)]">
            {body}
          </p>
          {detail ? <div className="mt-3">{detail}</div> : null}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
          {footer ? <div className="mt-8">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
