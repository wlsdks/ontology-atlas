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

/** Easy to ignore: no modal, no scrim, one-click dismissal. The `checking` stage is not drawn. */
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
          // Never show the updater library's English diagnosis as product copy.
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
  // Steps aside for a dock and the map's bottom-right instruments, like notifications.
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
          /* The 24 floor comes from the ramp; `.touch-hit-expand` makes the coarse 44. */
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
