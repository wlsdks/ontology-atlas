import { CircleHelp, FileCheck2, GitCompareArrows, ScanSearch } from 'lucide-react';

import type { ArchitectureRecordStatus } from '@/entities/architecture-record';
import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

type DeltaStatus = ArchitectureRecordStatus | 'missing';

const DELTA_TONE_CLASS: Record<DeltaStatus, string> = {
  conforms:
    'border border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]',
  violated:
    'border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a12)] text-[color:var(--color-danger-text)]',
  unknown:
    'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
  missing:
    'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
};

const DELTA_ICON: Record<DeltaStatus, typeof CircleHelp> = {
  conforms: FileCheck2,
  violated: GitCompareArrows,
  unknown: CircleHelp,
  missing: CircleHelp,
};

function EvidenceLane({
  index,
  source,
  label,
  title,
  body,
  icon: Icon,
  state,
  testId,
  bodyTestId,
  note,
  noteTestId,
  active = false,
}: {
  index: string;
  source: 'human' | 'agent' | 'delta';
  label: string;
  title: string;
  body: string;
  icon: typeof CircleHelp;
  state: string;
  testId?: string;
  bodyTestId?: string;
  note?: string;
  noteTestId?: string;
  active?: boolean;
}) {
  return (
    <article
      data-evidence-source={source}
      data-evidence-state={state}
      data-testid={testId}
      className={cn(
        'relative min-w-0 border-t border-[color:var(--color-border-soft)] p-3 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0 md:p-4',
        source === 'agent' && 'bg-[color:var(--color-overlay-1)]',
      )}
    >
      {active ? (
        <span
          aria-hidden
          data-testid="architecture-observation-motion"
          className="architecture-observation-scan absolute inset-x-0 bottom-0 h-px bg-[color:var(--color-indigo-a60)] motion-reduce:animate-none"
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
          <Icon size={ICON_SIZE.sm} aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <span className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]" aria-hidden>
          {index}
        </span>
      </div>
      <p className="mt-2 text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {title}
      </p>
      <p
        className="mt-1 break-keep text-caption leading-prose text-[color:var(--color-text-tertiary)]"
        data-testid={bodyTestId}
      >
        {body}
      </p>
      {note ? (
        <p
          className="mt-1 break-keep text-caption leading-prose text-[color:var(--color-text-quaternary)]"
          data-testid={noteTestId}
        >
          {note}
        </p>
      ) : null}
    </article>
  );
}

export function ArchitectureEvidencePlane({
  ariaLabel,
  contractLabel,
  contractTitle,
  contractBody,
  observationLabel,
  observationTitle,
  observationBody,
  observationNote,
  observationActive = false,
  deltaLabel,
  deltaTitle,
  deltaBody,
  deltaStatus,
}: {
  ariaLabel: string;
  contractLabel: string;
  contractTitle: string;
  contractBody: string;
  observationLabel: string;
  observationTitle: string;
  observationBody: string;
  observationNote?: string;
  observationActive?: boolean;
  deltaLabel: string;
  deltaTitle: string;
  deltaBody: string;
  deltaStatus: DeltaStatus;
}) {
  const DeltaIcon = DELTA_ICON[deltaStatus];

  return (
    <section
      aria-label={ariaLabel}
      data-testid="architecture-evidence-plane"
      data-delta-status={deltaStatus}
      className="overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-1)]"
    >
      <div className="grid grid-cols-1 md:grid-cols-3">
        <EvidenceLane
          index="01"
          source="human"
          label={contractLabel}
          title={contractTitle}
          body={contractBody}
          icon={FileCheck2}
          state="reviewed"
        />
        <EvidenceLane
          index="02"
          source="agent"
          label={observationLabel}
          title={observationTitle}
          body={observationBody}
          icon={ScanSearch}
          state={deltaStatus === 'missing' ? 'missing' : 'recorded'}
          testId={deltaStatus === 'missing' ? 'architecture-source-check' : undefined}
          bodyTestId={
            deltaStatus === 'missing'
              ? 'architecture-source-check-next'
              : 'architecture-record-stamp'
          }
          note={observationNote}
          noteTestId={deltaStatus === 'missing' ? undefined : 'architecture-record-cannot-confirm'}
          active={observationActive}
        />
        <article
          data-evidence-source="delta"
          data-evidence-state={deltaStatus}
          data-testid={deltaStatus === 'missing' ? undefined : 'architecture-record-status'}
          data-architecture-record-status={deltaStatus === 'missing' ? undefined : deltaStatus}
          className="relative min-w-0 border-t border-[color:var(--color-border-soft)] p-3 md:border-l md:border-t-0 md:p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
              <GitCompareArrows size={ICON_SIZE.sm} aria-hidden />
              <span className="truncate">{deltaLabel}</span>
            </span>
            <span className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]" aria-hidden>
              03
            </span>
          </div>
          <span
            data-testid={deltaStatus === 'missing' ? undefined : 'architecture-record-pill'}
            className={badgeClass({
              shape: 'pill',
              className: cn('mt-2', DELTA_TONE_CLASS[deltaStatus]),
            })}
          >
            <DeltaIcon size={ICON_SIZE.sm} aria-hidden />
            {deltaTitle}
          </span>
          <p className="mt-1 break-keep text-caption leading-prose text-[color:var(--color-text-tertiary)]">
            {deltaBody}
          </p>
        </article>
      </div>
    </section>
  );
}
