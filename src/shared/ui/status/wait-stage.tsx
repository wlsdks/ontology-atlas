import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { WorkProgress } from '@/shared/motion/work-progress';

import { BrandWaitingMark } from '../marks/brand-waiting-mark';
import { MapWaitCluster } from '../marks/map-wait-cluster';

export type WaitStepState = 'pending' | 'current' | 'done';

export interface WaitStep {
  id: string;
  label: string;
  state: WaitStepState;
  attributes?: Readonly<Record<`data-${string}`, string>>;
}

export interface WaitStageProgress {
  stage: string;
  counter: ReactNode;
  done: number;
  total: number | null;
  label: string;
}

export interface WaitStageProps {
  mark?: 'mascot' | 'orbit';
  title: string;
  detail?: string;
  progress?: WaitStageProgress;
  steps?: readonly WaitStep[];
  announce?: string;
  delayed?: boolean;
  className?: string;
  [dataAttribute: `data-${string}`]: unknown;
  [ariaAttribute: `aria-${string}`]: unknown;
}
export function WaitStage({
  mark,
  title,
  detail,
  progress,
  steps,
  announce,
  delayed = false,
  className,
  ...rest
}: WaitStageProps) {
  const rows = steps ? Math.ceil(steps.length / 2) : 0;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        data-wait-stage=""
        {...rest}
        role={announce === undefined ? 'status' : undefined}
        className={cn(
          'pointer-events-auto flex w-[min(26rem,calc(100%-3rem))] flex-col items-center text-center',
          delayed ? 'route-loading-in' : 'map-overlay-in',
          className,
        )}
      >
        {announce === undefined ? null : (
          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>
        )}
        {mark === 'mascot' ? <BrandWaitingMark active initialVisibility="visible" scale={2} /> : null}
        {mark === 'orbit' ? <MapWaitCluster /> : null}
        <p
          className={cn(
            'break-words text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]',
            mark ? 'mt-5' : null,
          )}
        >
          {title}
        </p>
        {detail ? (
          <p className="mt-1.5 break-keep text-body text-[color:var(--color-text-tertiary)]">{detail}</p>
        ) : null}
        {progress ? (
          <div className="mt-6 w-full" aria-hidden>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                {progress.stage}
              </span>
              <span className="shrink-0 text-label tabular-nums text-[color:var(--color-text-quaternary)]">
                {progress.counter}
              </span>
            </div>
            <div className="mt-2">
              <WorkProgress
                phase="running"
                done={progress.done}
                total={progress.total}
                label={progress.label}
              />
            </div>
          </div>
        ) : null}
        {steps && steps.length > 0 ? (
          <ol
            className="mt-5 grid w-full grid-flow-col grid-cols-2 gap-x-6 gap-y-2 text-left"
            style={{ gridTemplateRows: `repeat(${rows}, auto)` }}
          >
            {steps.map((step) => (
              <li
                key={step.id}
                {...step.attributes}
                className={cn(
                  'flex min-w-0 items-center gap-2 text-label',
                  step.state === 'current'
                    ? 'text-[color:var(--color-text-primary)]'
                    : step.state === 'done'
                      ? 'text-[color:var(--color-text-secondary)]'
                      : 'text-[color:var(--color-text-quaternary)]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-3 shrink-0 rounded-full border',
                    step.state === 'done'
                      ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-accent)]'
                      : step.state === 'current'
                        ? 'border-[color:var(--color-indigo-accent)]'
                        : 'border-[color:var(--color-border-strong)]',
                  )}
                />
                <span className="min-w-0 truncate">{step.label}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
