'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import {
  formatDownloadProgress,
  summarizeNotes,
  type UpdatePhase,
} from '../model/update-state';

/**
 * The app spoke; the user did not ask for this screen.
 *
 * So this surface's design criterion is not "is it noticeable" but **"is it easy to ignore"**. It is
 * not a modal, has no scrim, blocks no work in progress, and dismissal is always one click. An update
 * has never been urgent.
 *
 * It follows the charter of restraint exactly — no glow, badge, shake, or gradient. Using `Button`
 * rather than painting colours directly is the same reason: the primary button's indigo is a decision
 * the design system already owns, and re-deciding it here splits that decision across two places.
 *
 * The `checking` stage is **not drawn.** Reporting a check the user did not ask for is noise — it
 * speaks first when the result is "a new version exists".
 */
export interface UpdateToastProps {
  readonly phase: UpdatePhase;
  readonly onInstall: () => void;
  readonly onRestart: () => void;
  readonly onDismiss: () => void;
}

export function UpdateToast({ phase, onInstall, onRestart, onDismiss }: UpdateToastProps) {
  const t = useTranslations('appUpdate');

  if (
    phase.kind === 'idle' ||
    phase.kind === 'checking' ||
    phase.kind === 'current' ||
    (phase.kind === 'failed' && phase.operation === 'check')
  ) {
    return null;
  }

  const body = (() => {
    switch (phase.kind) {
      case 'available': {
        const notes = summarizeNotes(phase.notes);
        return {
          title: t('availableTitle', { version: phase.version }),
          detail: notes ?? t('availableBody'),
          action: { label: t('install'), onClick: onInstall },
        };
      }
      case 'downloading': {
        const percent = formatDownloadProgress(phase.received, phase.total);
        return {
          title: t('downloadingTitle', { version: phase.version }),
  // With the total unknown, no percentage is invented; it states only that fact.
          detail: percent ? t('downloadingPercent', { percent }) : t('downloadingUnknown'),
          action: null,
        };
      }
      case 'ready':
        return {
          title: t('readyTitle', { version: phase.version }),
          detail: t('readyBody'),
          action: { label: t('restart'), onClick: onRestart },
        };
      case 'failed':
        return {
          title: t('failedTitle'),
          // Do not expose the updater library's English diagnosis as product copy.
          // Detailed diagnosis belongs in developer logs; tell humans the remaining path.
          detail: t('failedBody'),
          action: null,
        };
    }
  })();

  return (
    <div
  // A live region, but not assertive — it does not break a screen-reader user's flow either.
      role="status"
      aria-live="polite"
      data-testid="app-update-toast"
      data-phase={phase.kind}
      className={cn(
  // Rides the **same contract** as notifications — it steps aside by however much a dock stands on the
  // right of the screen, and never sits on the map's bottom-right instruments (review 2026-08-16: this
  // alone ignored both offsets and sat straight on top of the composer).
        'pointer-events-auto fixed bottom-[var(--app-toast-bottom-offset,16px)]',
        'right-[var(--app-toast-right-offset,16px)] z-50 w-[min(22rem,calc(100vw-2rem))]',
        'flex flex-col items-start gap-2 rounded-card border border-[color:var(--color-border-strong)]',
        'bg-[color:var(--color-elevated)] p-3 shadow-[var(--shadow-elevation-2)]',
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <p className="text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {body.title}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="app-update-dismiss"
          /* The toast header row forming one line with the title — the 24 floor (`min-h-6`) comes from
             the ramp, and `-m-1 p-1` returns the visual footprint to the text size. The coarse 44 is
             produced by `.touch-hit-expand` (≥12px of vertical clearance from the CTA below). */
          className={controlClass({
            shape: 'link',
            tone: 'muted',
            className:
              'touch-hit-expand -m-1 shrink-0 p-1 leading-label hover:text-[color:var(--color-text-secondary)]',
          })}
        >
          {t('dismiss')}
        </button>
      </div>

      <p className="break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
        {body.detail}
      </p>

      {body.action ? (
        <Button size="sm" onClick={body.action.onClick} data-testid="app-update-action">
          {body.action.label}
        </Button>
      ) : null}
    </div>
  );
}
