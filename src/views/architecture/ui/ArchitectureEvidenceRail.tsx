import { ChevronDown, GitCompareArrows } from 'lucide-react';
import type { Ref } from 'react';

import type { ArchitectureRecordStatus } from '@/entities/architecture-record';
import { cn } from '@/shared/lib/cn';
import { RowButton } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

type DeltaStatus = ArchitectureRecordStatus | 'missing';

const DELTA_TEXT_CLASS: Record<DeltaStatus, string> = {
  conforms: 'text-[color:var(--color-success-text-a90)]',
  violated: 'text-[color:var(--color-danger-text)]',
  unknown: 'text-[color:var(--color-amber-source-a90)]',
  missing: 'text-[color:var(--color-amber-source-a90)]',
};

const DELTA_DOT_CLASS: Record<DeltaStatus, string> = {
  conforms: 'bg-[color:var(--color-success-a45)]',
  violated: 'bg-[color:var(--color-danger-a50)]',
  unknown: 'bg-[color:var(--color-amber-source-a50)]',
  missing: 'bg-[color:var(--color-amber-source-a50)]',
};

/**
 * The always-visible evidence summary. It keeps the canvas dominant: one row states the three
 * authorities, while the full provenance plane opens in its own comparison dock when requested.
 */
export function ArchitectureEvidenceRail({
  ariaLabel,
  buttonRef,
  expanded,
  onToggle,
  contractTitle,
  observationTitle,
  observationActive,
  deltaCompactTitle,
  deltaStatus,
  compact = false,
}: {
  ariaLabel: string;
  buttonRef?: Ref<HTMLButtonElement>;
  expanded: boolean;
  onToggle: () => void;
  contractTitle: string;
  observationTitle: string;
  observationActive: boolean;
  deltaCompactTitle: string;
  deltaStatus: DeltaStatus;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 basis-full flex-1 overflow-hidden rounded-panel border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] shadow-[inset_0_1px_0_var(--color-overlay-2)] md:basis-auto">
      <RowButton
        ref={buttonRef}
        size="lg"
        tone="strong"
        active={expanded}
        hoverSurface="lift"
        aria-label={ariaLabel}
        aria-expanded={expanded}
        aria-controls="architecture-evidence-dock"
        data-testid="architecture-evidence-rail"
        onClick={onToggle}
        className="relative w-full min-w-0 justify-start overflow-hidden rounded-none"
      >
        <span className="architecture-evidence-rail-segment relative flex min-w-0 flex-1 items-center gap-2">
          <GitCompareArrows
            size={ICON_SIZE.sm}
            className="shrink-0 text-[color:var(--color-text-quaternary)]"
            aria-hidden
          />
          <span className="truncate font-[var(--font-weight-emphasis)]">{contractTitle}</span>
          <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
          <span
            className={cn(
              'min-w-0 truncate text-[color:var(--color-text-tertiary)]',
              compact && 'hidden 2xl:inline',
            )}
          >
            {observationTitle}
          </span>
          {observationActive ? (
            <span
              aria-hidden
              data-testid="architecture-observation-motion"
              className="architecture-observation-scan absolute inset-x-0 -bottom-2.5 h-px bg-[color:var(--color-indigo-a60)] motion-reduce:animate-none"
            />
          ) : null}
        </span>

        <span
          className="architecture-evidence-rail-segment ml-auto flex min-w-0 shrink-0 items-center gap-2"
        >
          <span className={cn('flex min-w-0 items-center gap-1.5 text-caption', DELTA_TEXT_CLASS[deltaStatus])}>
            <span
              aria-hidden
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DELTA_DOT_CLASS[deltaStatus])}
            />
            <span className={cn('truncate', compact ? 'max-w-20' : 'max-w-28')}>
              {deltaCompactTitle}
            </span>
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
