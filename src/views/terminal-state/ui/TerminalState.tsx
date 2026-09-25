'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { PAGE_GUTTER } from '@/shared/lib/gateway-frame';

/**
 * **The one shape of a dead end** — the 404 and the render-error screen share it.
 *
 * Before 2026-09-25 the two were twins that had drifted: the 404 was a 420px card with three
 * full-width stacked buttons, the error a card without the 404's elevation and with a hand-built
 * pill dialect (`h-10`, custom indigo fill, a manual focus ring). At 1512 the 404 card filled 15%
 * of the width and 36% of the height, and the rest of the canvas was empty.
 *
 * The shape now is a centred stage, not a floating card: a quiet light in the tone's hue behind a tinted
 * icon tile, an eyebrow, one `hero-lg` title (the gateway's headline step, so a lost visitor meets
 * the same voice as the page they came from), one sentence at the note measure, and one action
 * row: a single primary plus secondary exits **side by side**, never a vertical menu of equals.
 *
 * The entrance reuses `atlasStatusIn` (opacity plus 4px rise) on `--motion-settle`; under reduced
 * motion the stage is simply present.
 */
export interface TerminalStateProps {
  /** `neutral` for "not here", `warning` for "something broke". Colours only the icon tile. */
  tone: 'neutral' | 'warning';
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  /** A line under the body (the error id). Not drawn when absent. */
  detail?: ReactNode;
  /** The action row — the first child is the single primary. */
  actions: ReactNode;
  /** A chrome drawn above the stage (the gateway nav on the web 404). */
  chrome?: ReactNode;
  /** Drawn under the action row (reading links below `sm`). */
  footer?: ReactNode;
  testId: string;
}

const TILE_TONE = {
  neutral:
    'border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a10)] text-[color:var(--color-indigo-pale-a92)]',
  warning:
    'border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-status-warning)]',
} as const;

/*
 * The light behind the stage takes the tile's hue: an amber tile under an indigo light split the
 * "something broke" signal across two colours (review of PR #1839). Each ramp step fades to
 * nothing, and the ellipse is tall enough to reach well under the action row, so the canvas
 * around a short stage reads as depth rather than as an empty lower half.
 */
const GLOW_TONE = {
  neutral:
    'bg-[radial-gradient(52%_62%_at_50%_46%,var(--color-indigo-a10)_0%,var(--color-indigo-a06)_40%,transparent_76%)]',
  warning:
    'bg-[radial-gradient(52%_62%_at_50%_46%,var(--color-amber-source-a08)_0%,var(--color-amber-source-a06)_40%,transparent_76%)]',
} as const;

/**
 * The canvas a terminal screen shows before it knows who is looking (see `useClientAnswered`):
 * the same surface and height, nothing drawn on it, so the stage's entrance is the first thing
 * that moves.
 */
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
          /*
           * Optical centre, not geometric. Centred in what the 64px nav left, the stage's middle
           * sat at 507 of 949 (53%) and read as sunk below the middle (measured 2026-09-25).
           * The heavier bottom padding lifts the
           * middle to about 46% of the viewport at 1512×949 and 1920×1080.
           */
          'relative isolate flex flex-1 items-center justify-center overflow-hidden pt-16 pb-[calc(4rem+14svh)]',
        )}
      >
        {/* The light behind the stage (`GLOW_TONE`). Decorative, so it is hidden from the
            accessibility tree and takes no pointer. */}
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
