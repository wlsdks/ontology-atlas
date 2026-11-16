'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { MOTION } from '@/shared/motion';
import { WorkProgress } from '@/shared/motion/work-progress';
import { Button } from '@/shared/ui/controls/button';
import { BrandWaitingMark } from '@/shared/ui/marks/brand-waiting-mark';
import {
  formatDownloadProgress,
  formatMegabytes,
  summarizeNotes,
  type UpdatePhase,
} from '../model/update-state';

/** Easy to ignore: no modal, no scrim, one-click dismissal. The `checking` stage is not drawn. */
export interface UpdateToastProps {
  readonly phase: UpdatePhase;
  readonly onInstall: () => void;
  readonly onRestart: () => void;
  readonly onDismiss: () => void;
  /** Hides the download card; the download continues and the version is not dismissed. */
  readonly onHide: () => void;
}

type DrawnPhase = Extract<UpdatePhase, { kind: 'available' | 'downloading' | 'ready' | 'failed' }>;

type MoruClip = 'greeting' | 'waiting' | 'success' | 'flipper-groove' | 'pondering';

/** A one-shot gesture that greets the state, then the loop Moru rests on while the card stays. */
const MORU_CLIPS: Record<DrawnPhase['kind'], { intro: MoruClip | null; loop: MoruClip }> = {
  available: { intro: 'greeting', loop: 'waiting' },
  downloading: { intro: null, loop: 'flipper-groove' },
  ready: { intro: 'success', loop: 'waiting' },
  failed: { intro: null, loop: 'pondering' },
};

/** The card's rise (`atlasStatusIn` over `--motion-settle`); Moru starts once it has landed. */
const CARD_LANDING_MS = Math.round(MOTION.settle.duration * 1_000);

function isDrawn(phase: UpdatePhase): phase is DrawnPhase {
  if (phase.kind === 'failed') return phase.operation === 'install';
  return phase.kind === 'available' || phase.kind === 'downloading' || phase.kind === 'ready';
}

export function UpdateToast({ phase, onInstall, onRestart, onDismiss, onHide }: UpdateToastProps) {
  if (!isDrawn(phase)) return null;
  return (
    <UpdateCard phase={phase} onInstall={onInstall} onRestart={onRestart} onDismiss={onDismiss} onHide={onHide} />
  );
}

function UpdateCard({ phase, onInstall, onRestart, onDismiss, onHide }: UpdateToastProps & { phase: DrawnPhase }) {
  const t = useTranslations('appUpdate');
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLanded(true), CARD_LANDING_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const title = (() => {
    switch (phase.kind) {
      case 'available':
        return t('availableTitle', { version: phase.version });
      case 'downloading':
        return t('downloadingTitle', { version: phase.version });
      case 'ready':
        return t('readyTitle', { version: phase.version });
      case 'failed':
        return t('failedTitle');
    }
  })();

  const detail = (() => {
    switch (phase.kind) {
      case 'available':
        return summarizeNotes(phase.notes) ?? t('availableBody');
      case 'downloading': {
        // With the total unknown, no percentage is invented; it states only that fact.
        const percent = formatDownloadProgress(phase.received, phase.total);
        return percent && phase.total !== null
          ? t('downloadingProgress', {
              percent,
              received: formatMegabytes(phase.received),
              total: formatMegabytes(phase.total),
            })
          : t('downloadingUnknown');
      }
      case 'ready':
        return t('readyBody');
      case 'failed':
        // Never show the updater library's English diagnosis as product copy.
        return t('failedBody');
    }
  })();

  const primary =
    phase.kind === 'available'
      ? { label: t('install'), onClick: onInstall }
      : phase.kind === 'ready'
        ? { label: t('restart'), onClick: onRestart }
        : phase.kind === 'failed'
          ? { label: t('retry'), onClick: onInstall }
          : null;
  const quiet =
    phase.kind === 'downloading'
      ? { label: t('hide'), onClick: onHide }
      : { label: phase.kind === 'failed' ? t('close') : t('dismiss'), onClick: onDismiss };

  return (
    <div
      // A live region, but not assertive — it does not break a screen-reader user's flow either.
      role="status"
      aria-live="polite"
      data-testid="app-update-toast"
      data-phase={phase.kind}
      className={cn(
        // Steps aside for a dock, the map's bottom-right instruments and the narrow tab bar, like notifications.
        'pointer-events-auto fixed bottom-[var(--app-toast-bottom-offset,calc(var(--app-toast-bottom-reserve,0px)_+_16px))]',
        'right-[var(--app-toast-right-offset,16px)] z-50 w-[min(24rem,calc(100vw-2rem))]',
        'flex items-center gap-3 rounded-card border border-[color:var(--color-border-strong)]',
        'bg-[color:var(--color-elevated)] p-3 shadow-[var(--shadow-elevation-2)]',
        'motion-safe:animate-[atlasStatusIn_var(--motion-settle)_var(--motion-ease)_both]',
      )}
    >
      <MoruStage key={phase.kind} phase={phase.kind} landed={landed} />

      <div className="grid min-w-0 flex-1 gap-1">
        <p
          data-testid="app-update-title"
          className="truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
        >
          {title}
        </p>
        <p
          data-testid="app-update-detail"
          className="line-clamp-2 min-h-[calc(var(--leading-label)*2)] break-keep text-label leading-label text-[color:var(--color-text-secondary)]"
        >
          {detail}
        </p>
        <div className="mt-1 flex h-8 min-w-0 items-center gap-2">
          {phase.kind === 'downloading' ? (
            <div className="min-w-0 flex-1">
              <WorkProgress phase="running" done={phase.received} total={phase.total} label={t('progressLabel')} />
            </div>
          ) : null}
          {primary ? (
            <Button size="sm" onClick={primary.onClick} data-testid="app-update-action">
              {primary.label}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={quiet.onClick}
            data-testid="app-update-dismiss"
            className="touch-hit-expand text-[color:var(--color-text-secondary)]"
          >
            {quiet.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Moru on a softly lit tile: the state's gesture once, then its resting loop. */
function MoruStage({ phase, landed }: { phase: DrawnPhase['kind']; landed: boolean }) {
  const { intro, loop } = MORU_CLIPS[phase];
  const [clip, setClip] = useState<MoruClip>(intro ?? loop);
  const stageRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !intro) return;
    const restAfterIntro = (event: Event) => {
      if ((event.target as HTMLElement).dataset.moruMotion === intro) setClip(loop);
    };
    stage.addEventListener('animationend', restAfterIntro);
    return () => stage.removeEventListener('animationend', restAfterIntro);
  }, [intro, loop]);

  return (
    <span
      aria-hidden
      data-testid="app-update-moru"
      ref={stageRef}
      className={cn(
        'relative flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-card',
        'border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)]',
        'shadow-[inset_0_1px_0_var(--color-overlay-2)]',
      )}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_75%_at_50%_35%,var(--color-indigo-accent-a12),transparent)]" />
      {/* The native 128px row at half its CSS size: one source pixel per device pixel on a 2x screen. */}
      <span className="relative flex [zoom:0.5]">
        <BrandWaitingMark key={landed ? 'live' : 'held'} active held={!landed} scale={2} motion={clip} initialVisibility="visible" />
      </span>
    </span>
  );
}
