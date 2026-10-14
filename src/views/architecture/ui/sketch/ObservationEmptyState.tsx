import { ScanSearch } from 'lucide-react';

import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { balanceLinesByWidthAt, estimateTextWidthAt, splitLinesByWidthAt } from '../../model/summary-lines';
import type { EmptyPanel } from './types';

const EMPTY_PANEL_PAD_X = 20;
/** `text-body` and `text-label`, the ladder's own name and chrome steps. */
const EMPTY_TITLE_PX = 12.5;
const EMPTY_BODY_PX = 11;
/** The `--leading-body` and `--leading-label` line boxes of those two steps. */
const EMPTY_TITLE_LINE = 20;
const EMPTY_BODY_LINE = 16;
/** The space under the icon, whose own box is `ICON_SIZE.lg`. */
const EMPTY_ICON_GAP = 10;
/** Between the fact and the action when an across band sets them on one line. */
const EMPTY_BAND_GAP = 12;
const EMPTY_TITLE_MAX_LINES = 2;
const EMPTY_BODY_MAX_LINES = 5;

/**
 * The measured lane's one empty state: a dashed panel, the fact, and the action. A ladder column
 * stacks icon, fact and action, balanced; an across band sets fact and action on one line, cutting
 * the action last. One note for assistive tech; no pointer events.
 */
export function ObservationEmptyState({ panel, title, body }: { panel: EmptyPanel; title: string; body: string }) {
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
  const groupProps = {
    role: 'note',
    'aria-label': `${title} ${body}`,
    pointerEvents: 'none',
    className: 'architecture-observation-reveal',
    'data-testid': 'architecture-observation-empty',
    'data-empty-layout': panel.layout,
  } as const;

  if (panel.layout === 'band') {
    const [bodyLine = ''] = splitLinesByWidthAt(
      body,
      Math.max(0, innerW - estimateTextWidthAt(title, EMPTY_TITLE_PX) - EMPTY_BAND_GAP),
      1,
      EMPTY_BODY_PX,
    );
    return (
      <g {...groupProps}>
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

  /* Balanced like `text-wrap: balance`, so no lone word sits under a full line. */
  const titleLines = balanceLinesByWidthAt(title, innerW, EMPTY_TITLE_MAX_LINES, EMPTY_TITLE_PX);
  const bodyLines = balanceLinesByWidthAt(body, innerW, EMPTY_BODY_MAX_LINES, EMPTY_BODY_PX);
  /* Each line sits on its line box's middle; a glyph's visual centre is about 0.35em above the baseline. */
  const blockH =
    ICON_SIZE.lg +
    EMPTY_ICON_GAP +
    titleLines.length * EMPTY_TITLE_LINE +
    bodyLines.length * EMPTY_BODY_LINE;
  const blockTop = panel.y + Math.max(EMPTY_PANEL_PAD_X, (panel.height - blockH) / 2);
  const titleTop = blockTop + ICON_SIZE.lg + EMPTY_ICON_GAP;
  const bodyTop = titleTop + titleLines.length * EMPTY_TITLE_LINE;
  return (
    <g {...groupProps}>
      {frame}
      <ScanSearch
        x={cx - ICON_SIZE.lg / 2}
        y={blockTop}
        size={ICON_SIZE.lg}
        aria-hidden
        className="text-[color:var(--color-text-quaternary)]"
      />
      <text
        textAnchor="middle"
        aria-hidden
        data-testid="architecture-observation-empty-title"
        className="text-body font-[var(--font-weight-emphasis)] fill-[color:var(--color-text-secondary)]"
      >
        {titleLines.map((line, index) => (
          <tspan
            key={index}
            x={cx}
            y={titleTop + index * EMPTY_TITLE_LINE + EMPTY_TITLE_LINE / 2 + EMPTY_TITLE_PX * 0.35}
          >
            {line}
          </tspan>
        ))}
      </text>
      <text textAnchor="middle" aria-hidden className="text-label fill-[color:var(--color-text-tertiary)]">
        {bodyLines.map((line, index) => (
          <tspan
            key={index}
            x={cx}
            y={bodyTop + index * EMPTY_BODY_LINE + EMPTY_BODY_LINE / 2 + EMPTY_BODY_PX * 0.35}
            data-testid="architecture-observation-empty-line"
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
