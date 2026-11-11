import { cn } from '@/shared/lib/cn';

import { stampSuffix } from '../../model/edge-sentences';
import { PAD_X, RULE_SENTENCE_ROW_H } from './geometry';
import type { ArchitectureSketchProps, EmptyPanel } from './types';

export function AcrossLaneHeadings({
  contractTrackLabel,
  observationTrackLabel,
  observationStamp,
  padY,
  boxH,
  observationOffset,
  layoutLeadRoom,
}: {
  contractTrackLabel: ArchitectureSketchProps['contractTrackLabel'];
  observationTrackLabel: ArchitectureSketchProps['observationTrackLabel'];
  observationStamp: ArchitectureSketchProps['observationStamp'];
  padY: number;
  boxH: number;
  observationOffset: number;
  layoutLeadRoom: number;
}) {
  return (
    <g
      className="architecture-role-reveal"
      aria-hidden
      data-testid="architecture-across-lane-headings"
    >
      <text
        x={PAD_X}
        y={padY + layoutLeadRoom - 6}
        textAnchor="start"
        className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
      >
        {contractTrackLabel}
      </text>
      <text
        x={PAD_X}
        y={padY + layoutLeadRoom + boxH + observationOffset - boxH - 6}
        textAnchor="start"
        className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
      >
        {observationTrackLabel}
        {observationStamp ? (
          <tspan
            data-testid="architecture-observation-stamp"
            className="fill-[color:var(--color-text-tertiary)] font-normal normal-case"
          >
            {stampSuffix(observationStamp)}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

export function PairedLaneHeadings({
  contractTrackLabel,
  observationTrackLabel,
  deltaTrackLabel,
  deltaColumnHint,
  pairedGutterW,
  contractBoxW,
  observationBoxW,
  laneHeadingY,
  layoutLeadRoom,
  emptyColumn,
  ruleSentence,
  observationStamp,
  arriving,
}: {
  contractTrackLabel: ArchitectureSketchProps['contractTrackLabel'];
  observationTrackLabel: ArchitectureSketchProps['observationTrackLabel'];
  deltaTrackLabel: ArchitectureSketchProps['deltaTrackLabel'];
  deltaColumnHint: ArchitectureSketchProps['deltaColumnHint'];
  pairedGutterW: number;
  contractBoxW: number;
  observationBoxW: number;
  laneHeadingY: number;
  layoutLeadRoom: number;
  emptyColumn: EmptyPanel | null;
  ruleSentence: string | null;
  observationStamp: ArchitectureSketchProps['observationStamp'];
  arriving: boolean;
}) {
  return (
    <g
      className="architecture-role-reveal"
      aria-hidden
      data-testid="architecture-paired-lane-headings"
    >
      <text
        x={PAD_X + layoutLeadRoom + contractBoxW / 2}
        y={laneHeadingY}
        textAnchor="middle"
        className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
      >
        {contractTrackLabel}
      </text>
      {ruleSentence ? (
        <text
          x={PAD_X + layoutLeadRoom + contractBoxW / 2}
          y={laneHeadingY + RULE_SENTENCE_ROW_H}
          textAnchor="middle"
          data-testid="architecture-lower-only-sentence"
          data-edge-sentence="drawn"
          data-edge-sentence-kind="rule"
          className="fill-[color:var(--color-text-tertiary)] text-label"
        >
          {ruleSentence}
        </text>
      ) : null}
      {/* The lane headings are one row of chrome in one ink; state colour belongs to the markers. */}
      {/* The delta heading carries the mark's limit as hover text and waits for its marks; before an inspection the observation heading centres on the empty state. */}
      {emptyColumn === null ? (
        <text
          x={PAD_X + layoutLeadRoom + contractBoxW + pairedGutterW / 2}
          y={laneHeadingY}
          textAnchor="middle"
          pointerEvents="all"
          data-testid="architecture-delta-heading"
          className={cn(
            'fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]',
            arriving && 'architecture-arrive-mark',
          )}
        >
          <title>{deltaColumnHint}</title>
          {deltaTrackLabel}
        </text>
      ) : null}
      <text
        x={
          emptyColumn !== null
            ? emptyColumn.x + emptyColumn.width / 2
            : PAD_X + layoutLeadRoom + contractBoxW + pairedGutterW + observationBoxW / 2
        }
        y={laneHeadingY}
        textAnchor="middle"
        data-testid="architecture-observation-heading"
        className="fill-[color:var(--color-text-quaternary)] text-label font-[var(--font-weight-emphasis)] uppercase tracking-[var(--tracking-label)]"
      >
        {observationTrackLabel}
      </text>
      {observationStamp && emptyColumn === null ? (
        <text
          x={PAD_X + layoutLeadRoom + contractBoxW + pairedGutterW + observationBoxW / 2}
          y={laneHeadingY + RULE_SENTENCE_ROW_H}
          textAnchor="middle"
          data-testid="architecture-observation-stamp"
          className="fill-[color:var(--color-text-tertiary)] text-label"
        >
          {observationStamp}
        </text>
      ) : null}
    </g>
  );
}
