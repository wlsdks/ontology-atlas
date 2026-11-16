'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { usePanelPresence } from '@/shared/lib/render-timing/use-presence';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
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
  /** The card is put away while its phase goes on (a hidden download). */
  readonly hidden?: boolean;
  /** Where focus goes when the person put the card away from inside it. */
  readonly onReturnFocus?: () => void;
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

/** `.app-update-card` rises over `--motion-slow`; Moru starts once it has landed. */
const CARD_LANDING_MS = Math.round(MOTION.slow.duration * 1_000);
/** `.app-update-card[data-state='closed']` and `.app-update-layer-out` fade over `--motion-base`. */
const FADE_OUT_MS = Math.round(MOTION.base.duration * 1_000);

function isDrawn(phase: UpdatePhase): phase is DrawnPhase {
  if (phase.kind === 'failed') return phase.operation === 'install';
  return phase.kind === 'available' || phase.kind === 'downloading' || phase.kind === 'ready';
}

interface Layers {
  readonly current: DrawnPhase;
  /** The state handing over, drawn underneath while it fades. */
  readonly leaving: DrawnPhase | null;
  /** Whether `current` arrived by a handover, so only it crossfades in, never the first state. */
  readonly handedOver: boolean;
}

/** The last drawn state stays on screen while the card fades out, and hands over by crossfade. */
function usePhaseLayers(phase: UpdatePhase) {
  const [layers, setLayers] = useState<Layers | null>(() =>
    isDrawn(phase) ? { current: phase, leaving: null, handedOver: false } : null,
  );
  if (isDrawn(phase) && layers?.current !== phase) {
    setLayers(
      layers && layers.current.kind !== phase.kind
        ? { current: phase, leaving: layers.current, handedOver: true }
        : { current: phase, leaving: layers?.leaving ?? null, handedOver: layers?.handedOver ?? false },
    );
  }
  const leavingKind = layers?.leaving?.kind;
  useEffect(() => {
    if (!leavingKind) return;
    const timer = window.setTimeout(
      () => setLayers((state) => (state && state.leaving ? { ...state, leaving: null } : state)),
      FADE_OUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [leavingKind]);
  return layers;
}

/**
 * The live region stays mounted and empty while nothing is drawn, so a card that arrives already
 * filled (a hidden download finishing) is still announced. It carries no `status` role: an empty
 * status on every screen would answer each screen's own lookup of its status.
 */
export function UpdateToast(props: UpdateToastProps) {
  const open = isDrawn(props.phase) && !props.hidden;
  const { mounted } = usePanelPresence(open, FADE_OUT_MS);
  const layers = usePhaseLayers(props.phase);
  return (
    <div aria-live="polite" data-testid="app-update-live">
      {mounted && layers ? <UpdateCard {...props} open={open} layers={layers} /> : null}
    </div>
  );
}

function UpdateCard({
  open,
  layers,
  onInstall,
  onRestart,
  onDismiss,
  onHide,
  onReturnFocus,
}: UpdateToastProps & { open: boolean; layers: Layers }) {
  const reducedMotion = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const putAway = (handler: () => void) => () => {
    const hadFocus = cardRef.current?.contains(document.activeElement) ?? false;
    handler();
    if (hadFocus) onReturnFocus?.();
  };
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLanded(true), CARD_LANDING_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const actions = { onInstall, onRestart, onDismiss: putAway(onDismiss), onHide: putAway(onHide) };

  return (
    <div
      ref={cardRef}
      data-testid="app-update-toast"
      data-phase={layers.current.kind}
      data-state={open ? 'open' : 'closed'}
      inert={!open}
      className={cn(
        'app-update-card pointer-events-auto fixed z-50 h-36 w-[min(25rem,calc(100vw-2rem))] overflow-clip max-sm:h-30',
        // Steps aside for a dock, the map's bottom-right instruments and the narrow tab bar, like notifications.
        'right-[var(--app-toast-right-offset,16px)] bottom-[var(--app-toast-bottom-offset,calc(var(--app-toast-bottom-reserve,0px)_+_16px))]',
        'rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]',
      )}
    >
      <MoruLight />
      {layers.leaving && !reducedMotion ? (
        <PhaseLayer key={`leaving-${layers.leaving.kind}`} phase={layers.leaving} landed={landed} motion="out" {...actions} />
      ) : null}
      <PhaseLayer
        key={layers.current.kind}
        phase={layers.current}
        landed={landed}
        motion={layers.handedOver ? 'in' : 'none'}
        {...actions}
      />
    </div>
  );
}

/** The pool of light Moru stands on and his ground shadow; it fades to nothing before the text. */
function MoruLight() {
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 size-32 max-sm:size-16">
      <span className="absolute top-[72%] left-1/2 h-[130%] w-[150%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,var(--color-indigo-accent-a32),var(--color-indigo-accent-a12)_45%,transparent)]" />
      <span className="absolute top-[81%] left-1/2 h-[9%] w-[58%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,var(--color-shadow-a42),transparent)]" />
    </span>
  );
}

function PhaseLayer({
  phase,
  landed,
  motion,
  onInstall,
  onRestart,
  onDismiss,
  onHide,
}: Omit<UpdateToastProps, 'phase'> & { phase: DrawnPhase; landed: boolean; motion: 'in' | 'out' | 'none' }) {
  const t = useTranslations('appUpdate');
  const leaving = motion === 'out';

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
      case 'downloading':
        return <DownloadFigures phase={phase} />;
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
      data-update-layer={leaving ? 'leaving' : 'current'}
      inert={leaving}
      className={cn(
        'absolute inset-0 flex items-center p-3',
        motion === 'in' && 'app-update-layer-in',
        motion === 'out' && 'app-update-layer-out',
      )}
    >
      <MoruStage phase={phase.kind} landed={landed} />

      <div className="ml-[8.25rem] grid min-w-0 flex-1 gap-1 max-sm:ml-[4.5rem]">
        <p
          data-testid={leaving ? undefined : 'app-update-title'}
          className="truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
        >
          {title}
        </p>
        <p
          data-testid={leaving ? undefined : 'app-update-detail'}
          // The progressbar carries the value; the polite region must not re-read every chunk.
          aria-live={phase.kind === 'downloading' ? 'off' : undefined}
          className="line-clamp-2 min-h-[calc(var(--leading-label)*2)] break-keep text-label leading-label text-[color:var(--color-text-secondary)]"
        >
          {detail}
        </p>
        <div className="mt-1 flex h-8 min-w-0 items-center gap-2">
          {phase.kind === 'downloading' ? <DownloadBar phase={phase} label={t('progressLabel')} /> : null}
          {primary ? (
            <Button size="sm" onClick={primary.onClick} data-testid={leaving ? undefined : 'app-update-action'}>
              {primary.label}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={quiet.onClick}
            data-testid={leaving ? undefined : 'app-update-dismiss'}
            className="touch-hit-expand text-[color:var(--color-text-secondary)]"
          >
            {quiet.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

type DownloadingPhase = Extract<UpdatePhase, { kind: 'downloading' }>;

/** Message placeholders swapped for elements; the delimiter cannot occur in translated copy. */
const SLOT_DELIMITER = '\u0001';

function withSlots(format: (marks: Record<string, string>) => string, slots: Record<string, ReactNode>): ReactNode[] {
  const marks = Object.fromEntries(Object.keys(slots).map((name) => [name, `${SLOT_DELIMITER}${name}${SLOT_DELIMITER}`]));
  return format(marks)
    .split(SLOT_DELIMITER)
    .map((part, index) => (index % 2 === 1 ? <span key={part}>{slots[part]}</span> : part));
}

/** The percentage leads the row; numerals are tabular and boxed so a new chunk never shifts it. */
function DownloadFigures({ phase }: { phase: DownloadingPhase }) {
  const t = useTranslations('appUpdate');
  // With the total unknown, no percentage is invented; it states only that fact.
  const percent = formatDownloadProgress(phase.received, phase.total);
  if (!percent || phase.total === null) return t('downloadingUnknown');
  const total = formatMegabytes(phase.total);
  return (
    <span data-testid="app-update-figures" className="tabular-nums">
      {withSlots((marks) => t('downloadingProgress', marks), {
        percent: (
          <span className="inline-block min-w-[4ch] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {percent}
          </span>
        ),
        received: (
          <span className="inline-block text-right" style={{ minWidth: `${total.length}ch` }}>
            {formatMegabytes(phase.received)}
          </span>
        ),
        total,
      })}
    </span>
  );
}

function DownloadBar({ phase, label }: { phase: DownloadingPhase; label: string }) {
  const known = phase.total !== null && phase.total > 0;
  const ratio = known ? Math.min(1, Math.max(0, phase.received / (phase.total as number))) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={known ? Math.round(ratio * 100) : undefined}
      className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
    >
      {known ? (
        // Moved, not stretched: a scaled bar would squash its round end and its lit head.
        <span
          key="fill"
          data-testid="app-update-fill"
          className="app-update-fill absolute inset-0 rounded-full bg-[color:var(--color-indigo-accent)]"
          style={{ translate: `${(ratio - 1) * 100}% 0` }}
        >
          <span className="absolute inset-y-0 right-0 w-4 rounded-full bg-[linear-gradient(to_right,transparent,var(--color-indigo-hover))]" />
        </span>
      ) : (
        <span key="sweep" className="motion-work-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-[color:var(--color-indigo-accent)]" />
      )}
    </div>
  );
}

/** Moru at the row's native 128px (64px on a narrow window): the state's gesture once, then its loop. */
function MoruStage({ phase, landed }: { phase: DrawnPhase['kind']; landed: boolean }) {
  const { intro, loop } = MORU_CLIPS[phase];
  const [clip, setClip] = useState<MoruClip>(intro ?? loop);
  const stageRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !intro) return;
    // Every row starts and ends on the shared neutral pose, so the loop follows without a jump.
    const restAfterIntro = (event: Event) => {
      if ((event.target as HTMLElement).dataset.moruMotion === intro) setClip(loop);
    };
    stage.addEventListener('animationend', restAfterIntro);
    return () => stage.removeEventListener('animationend', restAfterIntro);
  }, [intro, loop]);

  return (
    <span
      ref={stageRef}
      aria-hidden
      data-testid="app-update-moru"
      className="pointer-events-none absolute bottom-3 left-3 flex size-32 items-end max-sm:size-16"
    >
      <span className="flex max-sm:[zoom:0.5]">
        <BrandWaitingMark key={landed ? 'live' : 'held'} active held={!landed} scale={2} motion={clip} initialVisibility="visible" />
      </span>
    </span>
  );
}
