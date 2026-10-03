'use client';

import { useId, type ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { IconButton } from '@/shared/ui/controls';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { SHOWPIECE_PART, type ShowpieceState } from './showpiece-player';

export const DRAWN_PRIMARY =
  'inline-flex min-h-7 items-center rounded-chip py-0.5 bg-[color:var(--color-indigo-accent)] px-3 text-label leading-label text-[color:var(--color-text-on-accent)]';
export const DRAWN_OUTLINE =
  'inline-flex min-h-7 items-center rounded-chip py-0.5 border border-[color:var(--color-border-strong)] px-3 text-label leading-label text-[color:var(--color-text-primary)]';


export function ShowpieceSection({
  id,
  testId,
  eyebrow,
  title,
  sub,
  underline,
  rootRef,
  children,
}: {
  id: string;
  testId: string;
  eyebrow: string;
  title: ReactNode;
  sub: string;
  underline: 'amber' | 'indigo';
  rootRef: (element: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <section
      ref={rootRef}
      id={id}
      data-testid={testId}
      data-showpiece-underline={underline}
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)] w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <p className="flex items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-accent)]" />
          {eyebrow}
        </p>
        <h2 className="mt-4 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
          {title}
        </h2>
        <p className="mt-3 max-w-[40rem] text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]">{sub}</p>
        <div className="mt-9 min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function keyPhrase(underline: 'amber' | 'indigo', style: React.CSSProperties) {
  function KeyPhrase(chunks: ReactNode) {
    return (
      <span className="relative inline-block">
        {chunks}
        <span
          aria-hidden
          {...{ [SHOWPIECE_PART]: 'underline' }}
          style={style}
          className={cn(
            'absolute inset-x-0 -bottom-1 h-0.5 origin-left rounded-full',
            underline === 'amber' ? 'bg-[color:var(--color-amber-source-a90)]' : 'bg-[color:var(--color-indigo-accent)]',
          )}
        />
      </span>
    );
  }
  return KeyPhrase;
}

export function ShowpieceFigure({
  testId,
  label,
  description,
  figureRef,
  state,
  canAnimate,
  finished,
  userPaused,
  onPress,
  children,
}: {
  testId: string;
  label: string;
  description: string;
  figureRef: (element: HTMLElement | null) => void;
  state: ShowpieceState;
  canAnimate: boolean;
  finished: boolean;
  userPaused: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('downloadConduction');
  const ids = useId();
  const control = finished
    ? { label: t('replay'), icon: <RotateCcw size={ICON_SIZE.sm} aria-hidden /> }
    : userPaused
      ? { label: t('resume'), icon: <Play size={ICON_SIZE.sm} aria-hidden /> }
      : { label: t('pause'), icon: <Pause size={ICON_SIZE.sm} aria-hidden /> };
  return (
    <figure
      ref={figureRef}
      data-testid={testId}
      data-showpiece-state={state}
      aria-labelledby={`${ids}-label`}
      aria-describedby={`${ids}-description`}
      className="m-0 flex min-w-0 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-panel"
    >
      <div className="flex min-h-[var(--chrome-tile-size)] items-center justify-between gap-3 px-5 pt-3">
        <p
          id={`${ids}-label`}
          className="flex min-w-0 items-center gap-2 text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]" />
          <span className="min-w-0">{label}</span>
        </p>
        {canAnimate ? (
          <IconButton size="sm" label={control.label} data-testid={`${testId}-control`} onClick={onPress}>
            {control.icon}
          </IconButton>
        ) : null}
      </div>
      <div className="min-w-0 bg-[color:var(--map-canvas-bg-near)]">{children}</div>
      <figcaption id={`${ids}-description`} className="sr-only">
        {description}
      </figcaption>
    </figure>
  );
}
