import { ChevronDown, CircleHelp, FileCheck2, GitCompareArrows, ScanSearch } from 'lucide-react';
import type { CSSProperties } from 'react';

import type { ArchitectureRecordStatus } from '@/entities/architecture-record';
import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { RowButton } from '@/shared/ui';
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

/**
 * The always-visible evidence summary. It keeps the canvas dominant: one row states the three
 * authorities, while the full provenance plane opens over the map only when somebody asks for it.
 */
export function ArchitectureEvidenceRail({
  ariaLabel,
  expanded,
  onToggle,
  contractLabel,
  contractTitle,
  observationLabel,
  observationTitle,
  observationActive,
  deltaLabel,
  deltaTitle,
  deltaStatus,
}: {
  ariaLabel: string;
  expanded: boolean;
  onToggle: () => void;
  contractLabel: string;
  contractTitle: string;
  observationLabel: string;
  observationTitle: string;
  observationActive: boolean;
  deltaLabel: string;
  deltaTitle: string;
  deltaStatus: DeltaStatus;
}) {
  const DeltaIcon = DELTA_ICON[deltaStatus];

  return (
    <div className="min-w-0 basis-full flex-1 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-1)] md:basis-auto">
      <RowButton
        size="lg"
        tone="strong"
        active={expanded}
        hoverSurface="lift"
        aria-label={ariaLabel}
        aria-expanded={expanded}
        aria-controls="architecture-evidence-overlay"
        data-testid="architecture-evidence-rail"
        onClick={onToggle}
        className="relative w-full min-w-0 justify-start overflow-hidden rounded-none"
      >
        <span
          className="architecture-evidence-rail-segment flex min-w-0 flex-1 items-center gap-2"
          style={{ '--architecture-reveal-step': 0 } as CSSProperties}
        >
          <FileCheck2
            size={ICON_SIZE.sm}
            className="shrink-0 text-[color:var(--color-text-quaternary)]"
            aria-hidden
          />
          <span className="hidden shrink-0 text-label uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)] 2xl:inline">
            {contractLabel}
          </span>
          <span className="truncate font-[var(--font-weight-emphasis)]">{contractTitle}</span>
        </span>

        <span aria-hidden className="hidden h-4 w-px shrink-0 bg-[color:var(--color-divider)] md:block" />

        <span
          className="architecture-evidence-rail-segment relative hidden min-w-0 flex-1 items-center gap-2 md:flex"
          style={{ '--architecture-reveal-step': 1 } as CSSProperties}
        >
          <ScanSearch
            size={ICON_SIZE.sm}
            className="shrink-0 text-[color:var(--color-text-quaternary)]"
            aria-hidden
          />
          <span className="hidden shrink-0 text-label uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)] 2xl:inline">
            {observationLabel}
          </span>
          <span className="truncate font-[var(--font-weight-emphasis)]">{observationTitle}</span>
          {observationActive ? (
            <span
              aria-hidden
              data-testid="architecture-observation-motion"
              className="architecture-observation-scan absolute inset-x-0 -bottom-2.5 h-px bg-[color:var(--color-indigo-a60)] motion-reduce:animate-none"
            />
          ) : null}
        </span>

        <span aria-hidden className="hidden h-4 w-px shrink-0 bg-[color:var(--color-divider)] md:block" />

        <span
          className="architecture-evidence-rail-segment flex min-w-0 shrink-0 items-center gap-2"
          style={{ '--architecture-reveal-step': 2 } as CSSProperties}
        >
          <span className="hidden text-label uppercase tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)] 2xl:inline">
            {deltaLabel}
          </span>
          <span
            className={badgeClass({
              shape: 'pill',
              className: cn('max-w-56 truncate', DELTA_TONE_CLASS[deltaStatus]),
            })}
          >
            <DeltaIcon size={ICON_SIZE.sm} aria-hidden />
            {deltaTitle}
          </span>
          <ChevronDown
            size={ICON_SIZE.sm}
            aria-hidden
            className={cn(
              'shrink-0 text-[color:var(--color-text-quaternary)] transition-transform motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </span>
      </RowButton>
    </div>
  );
}
