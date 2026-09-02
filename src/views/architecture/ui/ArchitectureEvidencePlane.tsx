import type { ArchitectureRecordStatus } from '@/entities/architecture-record';
import { cn } from '@/shared/lib/cn';

type DeltaStatus = ArchitectureRecordStatus | 'missing';

const DELTA_DOT_CLASS: Record<DeltaStatus, string> = {
  conforms: 'bg-[color:var(--color-success-a45)]',
  violated: 'bg-[color:var(--color-danger-a50)]',
  unknown: 'bg-[color:var(--color-amber-source-a50)]',
  missing: 'bg-[color:var(--color-amber-source-a50)]',
};

function EvidenceLane({
  source,
  label,
  title,
  body,
  state,
  testId,
  bodyTestId,
  note,
  noteTestId,
  active = false,
}: {
  source: 'human' | 'agent' | 'delta';
  label: string;
  title: string;
  body: string;
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
      className="relative min-w-0 border-t border-[color:var(--color-border-soft)] py-5 first:border-t-0 md:border-l md:border-t-0 md:px-4 md:first:border-l-0 xl:border-l-0 xl:border-t xl:px-0 xl:first:border-t-0"
    >
      {active ? (
        <span
          aria-hidden
          data-testid="architecture-observation-motion"
          className="architecture-observation-scan absolute inset-x-0 bottom-0 h-px bg-[color:var(--color-indigo-a60)] motion-reduce:animate-none"
        />
      ) : null}
      <p className="min-w-0 truncate text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-2 text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {title}
      </p>
      <p
        className="mt-2 break-keep text-caption leading-prose text-[color:var(--color-text-tertiary)]"
        data-testid={bodyTestId}
      >
        {body}
      </p>
      {note ? (
        <p
          className="mt-2 break-keep border-l border-[color:var(--color-indigo-a32)] pl-2 text-caption leading-prose text-[color:var(--color-text-quaternary)]"
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
  return (
    <section
      aria-label={ariaLabel}
      data-testid="architecture-evidence-plane"
      data-delta-status={deltaStatus}
      className="min-w-0"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-1">
        <EvidenceLane
          source="human"
          label={contractLabel}
          title={contractTitle}
          body={contractBody}
          state="reviewed"
        />
        <EvidenceLane
          source="agent"
          label={observationLabel}
          title={observationTitle}
          body={observationBody}
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
          className="relative min-w-0 border-t border-[color:var(--color-border-soft)] py-5 md:border-l md:border-t-0 md:px-4 xl:border-l-0 xl:border-t xl:px-0"
        >
          <p className="min-w-0 truncate text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
            {deltaLabel}
          </p>
          <div
            data-testid={deltaStatus === 'missing' ? undefined : 'architecture-record-summary'}
            className="mt-2 flex items-start gap-2 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
          >
            <span
              aria-hidden
              data-testid={deltaStatus === 'missing' ? undefined : 'architecture-record-marker'}
              className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', DELTA_DOT_CLASS[deltaStatus])}
            />
            <span>{deltaTitle}</span>
          </div>
          <p className="mt-2 break-keep text-caption leading-prose text-[color:var(--color-text-tertiary)]">
            {deltaBody}
          </p>
        </article>
      </div>
    </section>
  );
}
