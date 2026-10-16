import { ScanSearch } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { estimateTextWidthAt, splitLinesByWidthAt } from '../../model/summary-lines';
import type { EmptyPanel } from './types';

const EMPTY_PANEL_PAD_X = 20;
const EMPTY_TITLE_PX = 12.5;
const EMPTY_BODY_PX = 11;
/** Between the fact and the action when an across band sets them on one line. */
const EMPTY_BAND_GAP = 12;

/** The ladder's empty state where the observation column will stand; HTML, so the action is a real button. */
export function ObservationEmptyColumn({
  panel,
  title,
  body,
  deltaLabel,
  deltaUnknownLabel,
  action,
  exiting,
}: {
  panel: EmptyPanel;
  title: string;
  body: string;
  deltaLabel: string;
  deltaUnknownLabel: string;
  action: ReactNode;
  exiting: boolean;
}) {
  const titleId = useId();
  return (
    <div
      role="note"
      aria-labelledby={titleId}
      inert={exiting}
      data-testid="architecture-observation-empty"
      data-empty-layout="column"
      className={cn(
        'absolute flex flex-col items-center justify-center rounded-panel border border-dashed border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-[var(--card-pad)] text-center',
        exiting ? 'architecture-empty-panel-out' : 'architecture-observation-reveal',
      )}
      style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height }}
    >
      <ScanSearch size={ICON_SIZE.lg} aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]" />
      <p
        data-testid="architecture-observation-empty-delta"
        className="mt-3 flex items-center gap-1.5 text-label font-[var(--font-weight-emphasis)]"
      >
        <span className="text-[color:var(--color-text-tertiary)]">{deltaLabel}</span>
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-amber-source-a50)]" />
        <span className="text-[color:var(--color-amber-source-a90)]">{deltaUnknownLabel}</span>
      </p>
      <h3
        id={titleId}
        data-testid="architecture-observation-empty-title"
        className="mt-2 text-balance text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
      >
        {title}
      </h3>
      <p
        data-testid="architecture-observation-empty-line"
        className="mt-1.5 text-balance text-body text-[color:var(--color-text-tertiary)]"
      >
        {body}
      </p>
      {action ? <div className="mt-4 flex w-full justify-center">{action}</div> : null}
    </div>
  );
}

/** The across chain's empty state: one band per row, the body cut last. */
export function ObservationEmptyBand({ panel, title, body }: { panel: EmptyPanel; title: string; body: string }) {
  const innerW = Math.max(0, panel.width - EMPTY_PANEL_PAD_X * 2);
  const cx = panel.x + panel.width / 2;
  const frame = (
    <rect
      x={panel.x}
      y={panel.y}
      width={panel.width}
      height={panel.height}
      rx={12}
      fill="var(--color-overlay-1)"
      stroke="var(--color-divider)"
      strokeWidth={1}
      strokeDasharray="4 4"
    />
  );
  const [bodyLine = ''] = splitLinesByWidthAt(
    body,
    Math.max(0, innerW - estimateTextWidthAt(title, EMPTY_TITLE_PX) - EMPTY_BAND_GAP),
    1,
    EMPTY_BODY_PX,
  );
  return (
    <g
      role="note"
      aria-label={`${title} ${body}`}
      pointerEvents="none"
      className="architecture-observation-reveal"
      data-testid="architecture-observation-empty"
      data-empty-layout="band"
    >
      {frame}
      <text x={cx} y={panel.y + panel.height / 2 + 4} textAnchor="middle" aria-hidden>
        <tspan
          data-testid="architecture-observation-empty-title"
          className="text-body font-[var(--font-weight-emphasis)] fill-[color:var(--color-text-secondary)]"
        >
          {title}
        </tspan>
        {bodyLine ? (
          <tspan
            dx={EMPTY_BAND_GAP}
            data-testid="architecture-observation-empty-line"
            className="text-label fill-[color:var(--color-text-tertiary)]"
          >
            {bodyLine}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}
