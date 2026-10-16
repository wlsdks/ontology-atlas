import type { CSSProperties, Dispatch, RefObject, SetStateAction } from 'react';

import { cn } from '@/shared/lib/cn';

import type { ArchitectureGraph as Graph } from '../../model/graph-layout';
import type { RoleLedger } from '../../model/role-ledger';
import { balanceLinesByWidthAt, captionLineRoom, splitLinesByWidthAt } from '../../model/summary-lines';
import { ConnectionPort } from './ConnectionPort';
import { SUMMARY_FONT_PX, SUMMARY_LINES } from './geometry';
import { EDGE_STROKE, RECEDED_ROLE_OPACITY } from './ink';
import type { ArchitectureSketchProps, ArrivalPhase, FlowAxis, Placed } from './types';

/** One sentence line to the next, in SVG units: the `--leading-label` pair of `text-label`. */
const SUMMARY_LEADING = 16;
const SPLIT_SUMMARY_FONT_PX = 12.5;
const SPLIT_SUMMARY_LEADING = 20;
const SPLIT_NAME_FONT_PX = 14;
/** A glyph's visual centre sits about this many ems above its baseline. */
const GLYPH_CENTRE_EM = 0.35;

/** Shapes, not colour: tick for clean, slashed circle where a role's edges break its rules, hollow circle where no source matched. */
const LEDGER_GLYPH: Record<RoleLedger['state'], string> = {
  clean: '✓',
  violated: '⊘',
  'no-source': '○',
};

export function RoleFaces({
  graph,
  selected,
  roleInspectorOpen,
  onSelect,
  roleLabel,
  moduleCountLabel,
  conceptCountLabel,
  moduleCounts,
  conceptCounts,
  ledgers,
  roleSummary,
  ledgerStatusLabel,
  ledgerImportsLabel,
  deltaUnknownLabel,
  observationMissingLabel,
  axis,
  usesPairedDown,
  splitsEvidence,
  observationEmpty,
  pairedGutterW,
  contractBoxW,
  observationBoxW,
  boxH,
  observationBoxH,
  summaryLineCount,
  observationOffset,
  arrival,
  hovered,
  setHovered,
  pressed,
  setPressed,
  focus,
  placed,
  observedPlaced,
  swallowClick,
  visibleEdges,
}: {
  graph: ArchitectureSketchProps['graph'];
  selected: ArchitectureSketchProps['selected'];
  roleInspectorOpen: ArchitectureSketchProps['roleInspectorOpen'];
  onSelect: ArchitectureSketchProps['onSelect'];
  roleLabel: ArchitectureSketchProps['roleLabel'];
  moduleCountLabel: ArchitectureSketchProps['moduleCountLabel'];
  conceptCountLabel: ArchitectureSketchProps['conceptCountLabel'];
  moduleCounts: ArchitectureSketchProps['moduleCounts'];
  conceptCounts: ArchitectureSketchProps['conceptCounts'];
  ledgers: ArchitectureSketchProps['ledgers'];
  roleSummary: ArchitectureSketchProps['roleSummary'];
  ledgerStatusLabel: ArchitectureSketchProps['ledgerStatusLabel'];
  ledgerImportsLabel: ArchitectureSketchProps['ledgerImportsLabel'];
  deltaUnknownLabel: ArchitectureSketchProps['deltaUnknownLabel'];
  observationMissingLabel: ArchitectureSketchProps['observationMissingLabel'];
  axis: FlowAxis;
  usesPairedDown: boolean;
  splitsEvidence: boolean;
  observationEmpty: boolean;
  pairedGutterW: number;
  contractBoxW: number;
  observationBoxW: number;
  boxH: number;
  observationBoxH: number;
  summaryLineCount: number;
  observationOffset: number;
  arrival: ArrivalPhase;
  hovered: string | null;
  setHovered: Dispatch<SetStateAction<string | null>>;
  pressed: string | null;
  setPressed: Dispatch<SetStateAction<string | null>>;
  focus: string | null;
  placed: ReadonlyMap<string, Placed>;
  observedPlaced: ReadonlyMap<string, Placed>;
  swallowClick: RefObject<boolean>;
  visibleEdges: Graph['edges'];
}) {
  /* One step for the whole column: if any sentence would be cut at `text-body`, all step down. */
  const roomy =
    splitsEvidence &&
    graph.boxes.every((box) => {
      const text = roleSummary(box.id);
      return (
        text === null ||
        !splitLinesByWidthAt(text, captionLineRoom(contractBoxW), summaryLineCount, SPLIT_SUMMARY_FONT_PX)
          .at(-1)
          ?.endsWith('…')
      );
    });
  const summaryPx = roomy ? SPLIT_SUMMARY_FONT_PX : SUMMARY_FONT_PX;
  const leading = roomy ? SPLIT_SUMMARY_LEADING : SUMMARY_LEADING;
  return (
    <>
      {graph.boxes.map((box, boxIndex) => {
        const at = placed.get(box.id);
        const observedAt = observedPlaced.get(box.id);
        if (!at) return null;
        const isSelected = selected === box.id;
        const roleState = isSelected
          ? 'selected'
          : pressed === box.id
            ? 'active'
            : hovered === box.id
              ? 'hover'
              : 'rest';
        const receded =
          selected !== null &&
          selected !== box.id &&
          !graph.edges.some(
            (edge) =>
              (edge.from === selected && edge.to === box.id) ||
              (edge.to === selected && edge.from === box.id),
          );
        const counts =
          moduleCounts === null
            ? conceptCountLabel(conceptCounts[box.id] ?? 0)
            : `${moduleCountLabel(moduleCounts[box.id] ?? 0)} · ${conceptCountLabel(
                conceptCounts[box.id] ?? 0,
              )}`;
        const ledger = ledgers[box.id];
        const contractPortEdges = visibleEdges.filter(
          (edge) => !splitsEvidence || edge.kind === 'permitted',
        );
        const contractOutgoing = contractPortEdges.filter((edge) => edge.from === box.id);
        const observationOutgoing = visibleEdges.filter(
          (edge) => edge.kind === 'traffic' && edge.from === box.id,
        );
        const portProps = (lane: 'contract' | 'observation', face: Placed, faceW: number, faceH: number) =>
          ({ axis, at: face, boxW: faceW, boxH: faceH, lane, active: focus === box.id });
        /* Budgeted by characters, because an SVG text node does not wrap or ellipsize. */
        const summary = roleSummary(box.id);
        const summaryLines =
          summary === null
            ? null
            : splitsEvidence
              ? balanceLinesByWidthAt(summary, captionLineRoom(contractBoxW), summaryLineCount, summaryPx)
              : splitLinesByWidthAt(summary, captionLineRoom(contractBoxW), summaryLineCount, SUMMARY_FONT_PX);
        /* With an in-face ledger every baseline is fixed so the rule lands between declared and counted. */
        const blockTop = at.y + (boxH - leading * (1 + (summaryLines?.length ?? 1))) / 2;
        const nameY = splitsEvidence
          ? blockTop + leading / 2 + SPLIT_NAME_FONT_PX * GLYPH_CENTRE_EM
          : axis === 'down'
            ? at.y + 18
            : ledger
            ? at.y + 21
            : summary === null
              ? at.y + boxH / 2 - 4
              : at.y + boxH / 2 - 4 - ((SUMMARY_LINES - 1) * SUMMARY_LEADING) / 2;
        const countsY = splitsEvidence
          ? blockTop + leading * 1.5 + summaryPx * GLYPH_CENTRE_EM
          : axis === 'down'
            ? at.y + 34
            : nameY + 15;
        const arriving = arrival === 'arriving';
        const riseStyle = arriving
          ? ({ '--motion-stagger-index': box.column } as CSSProperties)
          : undefined;
        const revealClass = arrival === 'rest' ? 'architecture-observation-reveal' : undefined;

        return (
          <g
            key={box.id}
            role="button"
            pointerEvents="all"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-controls="architecture-inspector"
            aria-expanded={isSelected && roleInspectorOpen}
            aria-label={[
              roleLabel(box.id),
              summary,
              counts,
              ledger ? ledgerStatusLabel(ledger) : null,
              ledger ? ledgerImportsLabel(ledger.importsOut) : null,
              /* Before any inspection the empty state says it once, not in every role's name. */
              splitsEvidence && !ledger && !observationEmpty ? observationMissingLabel : null,
            ]
              .filter((part): part is string => part !== null)
              .join(' · ')}
            data-graph-box={box.id}
            /* The drawn size, stated for tests and probes, since the box is one filled path. */
            data-box-height={boxH}
            data-box-width={contractBoxW}
            data-architecture-role-state={roleState}
            data-testid={`architecture-graph-box-${box.id}`}
            onClick={(event) => {
              if (swallowClick.current) {
                swallowClick.current = false;
                return;
              }
              onSelect(box.id, event.currentTarget);
            }}
            onPointerDown={() => setPressed(box.id)}
            onPointerUp={() => setPressed(null)}
            onPointerCancel={() => setPressed(null)}
            onPointerEnter={() => setHovered(box.id)}
            onPointerLeave={() => setHovered((at) => (at === box.id ? null : at))}
            onFocus={() => setHovered(box.id)}
            onBlur={() => setHovered((at) => (at === box.id ? null : at))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(box.id, event.currentTarget);
              }
            }}
            style={{ opacity: receded ? RECEDED_ROLE_OPACITY : 1 }}
            className="architecture-recede architecture-role-reveal cursor-pointer outline-none [&:focus-visible_.architecture-node-face]:stroke-[color:var(--color-indigo-focus-ring)] [&:focus-visible_.architecture-node-face]:[stroke-width:2px]"
          >
            {/* A transparent first rect makes the whole two-face role footprint the hit target, so pointer automation aimed at the group's centre lands on it. */}
            <rect
              x={at.x}
              y={at.y}
              width={
                usesPairedDown && !observationEmpty
                  ? contractBoxW + pairedGutterW + observationBoxW
                  : contractBoxW
              }
              height={
                splitsEvidence && !usesPairedDown && !observationEmpty
                  ? observationOffset + observationBoxH
                  : boxH
              }
              fill="transparent"
              stroke="none"
              pointerEvents="all"
              data-architecture-role-hit-area="true"
            />
            {/* One face for every role; position already says where a chain begins. */}
            <rect
              x={at.x}
              y={at.y}
              width={contractBoxW}
              height={boxH}
              rx={12}
              fill={
                isSelected
                  ? 'var(--color-indigo-a12)'
                  : roleState === 'active'
                    ? 'var(--color-indigo-a06)'
                    : roleState === 'hover'
                      ? 'var(--color-elevated)'
                      : 'var(--color-panel)'
              }
              stroke={isSelected ? 'var(--color-indigo-accent)' : 'var(--color-architecture-sketch-ink)'}
              strokeWidth={isSelected ? 1.6 : 1}
              className="architecture-canvas-node architecture-node-face"
              data-node-selected={isSelected ? 'true' : 'false'}
            />
            {/* A side port marks where a skip leaves; its head arrives bare. */}
            {usesPairedDown && contractPortEdges.some((edge) => edge.columnSpan > 1 && edge.from === box.id) ? (
              <ConnectionPort {...portProps('contract', at, contractBoxW, boxH)} direction="outgoing" side="left" />
            ) : null}
            {/* The spine meets both faces bare: 18px of clear line on roomy rows, 16 on tight. */}
            {contractOutgoing.length > 0 && !usesPairedDown ? (
              <ConnectionPort {...portProps('contract', at, contractBoxW, boxH)} direction="outgoing" />
            ) : null}
            {splitsEvidence ? (
              <text
                x={at.x + 14}
                y={at.y + 17}
                textAnchor="start"
                aria-hidden
                data-testid={`architecture-role-index-${box.id}`}
                className={cn(
                  'architecture-node-copy font-mono text-caption tabular-nums',
                  isSelected
                    ? 'fill-[color:var(--color-indigo-text-soft)]'
                    : 'fill-[color:var(--color-text-tertiary)]',
                )}
              >
                {String(boxIndex + 1).padStart(2, '0')}
              </text>
            ) : null}
            <text
              x={at.x + contractBoxW / 2}
              y={nameY}
              textAnchor="middle"
              className={cn(
                'fill-[color:var(--color-text-primary)] font-[var(--font-weight-strong)]',
                splitsEvidence ? 'text-body-lg' : 'text-body',
              )}
            >
              {roleLabel(box.id)}
            </text>
            <text
              x={at.x + contractBoxW / 2}
              y={countsY}
              textAnchor="middle"
              className={cn(
                roomy ? 'text-body' : 'text-label',
                'fill-[color:var(--color-text-tertiary)]',
                summaryLines === null && 'tabular-nums',
              )}
              data-testid={`architecture-box-line-${box.id}`}
            >
              {/* A cut caption still carries its whole sentence for hover and assistive readers. */}
              {summaryLines !== null && summary !== null && summaryLines.some((line) => line.endsWith('…')) ? (
                <title>{summary}</title>
              ) : null}
              {summaryLines === null
                ? counts
                : summaryLines.map((line, index) => (
                    <tspan
                      key={index}
                      x={at.x + contractBoxW / 2}
                      y={countsY + index * leading}
                    >
                      {line}
                    </tspan>
                  ))}
            </text>
            {!splitsEvidence && ledger ? (
              <>
                {/* A ruled line between what the profile declares (above) and what the scanner counted (below). */}
                <line
                  x1={at.x + 12}
                  x2={at.x + contractBoxW - 12}
                  y1={axis === 'down' ? at.y + 46 : at.y + 58}
                  y2={axis === 'down' ? at.y + 46 : at.y + 58}
                  stroke="var(--color-divider)"
                  strokeWidth={1}
                />
                <text
                  x={at.x + contractBoxW / 2}
                  y={axis === 'down' ? at.y + 59 : at.y + 71}
                  textAnchor="middle"
                  className={cn(
                    'text-caption tabular-nums',
                    ledger.state === 'violated'
                      ? 'fill-[color:var(--color-text-secondary)]'
                      : 'fill-[color:var(--color-text-quaternary)]',
                  )}
                  data-testid={`architecture-role-ledger-${box.id}`}
                  data-ledger-state={ledger.state}
                >
                  {`${LEDGER_GLYPH[ledger.state]} ${ledgerStatusLabel(ledger)} · ${ledgerImportsLabel(
                    ledger.importsOut,
                  )}`}
                </text>
              </>
            ) : null}
            {splitsEvidence && observedAt && !observationEmpty ? (
              <>
              <g
                className={arriving ? 'architecture-arrive-mark' : revealClass}
                style={riseStyle}
              >
                <line
                  x1={usesPairedDown ? at.x + contractBoxW + 8 : at.x + contractBoxW / 2}
                  x2={usesPairedDown ? observedAt.x - 8 : at.x + contractBoxW / 2}
                  y1={usesPairedDown ? at.y + boxH / 2 : at.y + boxH + 6}
                  y2={usesPairedDown ? at.y + boxH / 2 : observedAt.y - 6}
                  stroke="var(--color-divider)"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  data-testid={`architecture-delta-connector-${box.id}`}
                  data-delta-state={ledger?.state ?? 'missing'}
                />
                {usesPairedDown ? (
                  <text
                    x={at.x + contractBoxW + pairedGutterW / 2}
                    y={at.y + boxH / 2 + 4}
                    textAnchor="middle"
                    className={cn(
                      'text-body font-[var(--font-weight-emphasis)]',
                      ledger?.state === 'violated'
                        ? 'fill-[color:var(--color-danger-text)]'
                        : 'fill-[color:var(--color-text-secondary)]',
                    )}
                    data-testid={`architecture-delta-marker-${box.id}`}
                    data-delta-state={ledger?.state ?? 'missing'}
                    role="img"
                    aria-label={ledger ? ledgerStatusLabel(ledger) : deltaUnknownLabel}
                  >
                    {/* The tick is scoped: like the role face (`role-ledger.ts`), it carries the edge-shaped sentence,
                       so it never reads as a per-role result. */}
                    <title>{ledger ? ledgerStatusLabel(ledger) : deltaUnknownLabel}</title>
                    {ledger ? LEDGER_GLYPH[ledger.state] : '○'}
                  </text>
                ) : (
                  <circle
                    cx={at.x + contractBoxW / 2}
                    cy={(at.y + boxH + observedAt.y) / 2}
                    r={2.5}
                    fill={ledger ? EDGE_STROKE : 'var(--color-canvas)'}
                    stroke={ledger ? EDGE_STROKE : 'var(--color-text-quaternary)'}
                    strokeWidth={1}
                  />
                )}
                {usesPairedDown ? (
                  <line
                    x1={at.x + contractBoxW + 8}
                    x2={observedAt.x - 8}
                    y1={at.y + boxH / 2}
                    y2={at.y + boxH / 2}
                    stroke="var(--color-indigo-accent)"
                    strokeWidth={1.5}
                    className="architecture-selection-trace"
                    data-selected={isSelected ? 'true' : 'false'}
                    data-testid={`architecture-selection-trace-${box.id}`}
                    aria-hidden
                  />
                ) : null}
              </g>
              <g
                className={arriving ? 'architecture-arrive-face' : revealClass}
                style={riseStyle}
              >
                <rect
                  x={observedAt.x}
                  y={observedAt.y}
                  width={observationBoxW}
                  height={observationBoxH}
                  rx={12}
                  fill={
                    isSelected
                      ? 'var(--color-indigo-a08)'
                      : roleState === 'active'
                        ? 'var(--color-indigo-a06)'
                        : roleState === 'hover'
                          ? 'var(--color-overlay-2)'
                          : 'var(--color-overlay-1)'
                  }
                  stroke={
                    ledger?.state === 'violated'
                      ? 'var(--color-danger-text)'
                      : isSelected
                        ? 'var(--color-indigo-a30)'
                        : 'var(--color-divider)'
                  }
                  strokeWidth={1}
                  strokeDasharray={ledger ? undefined : '4 4'}
                  className="architecture-node-face"
                  data-testid={`architecture-observation-box-${box.id}`}
                  data-observation-state={ledger?.state ?? 'missing'}
                />
                {usesPairedDown && visibleEdges.some((edge) => edge.kind === 'traffic' && edge.columnSpan > 1 && edge.from === box.id) ? (
                  <ConnectionPort {...portProps('observation', observedAt, observationBoxW, observationBoxH)} direction="outgoing" side="right" />
                ) : null}
                {observationOutgoing.length > 0 && !usesPairedDown ? (
                  <ConnectionPort {...portProps('observation', observedAt, observationBoxW, observationBoxH)} direction="outgoing" />
                ) : null}
                <text
                  x={observedAt.x + observationBoxW / 2}
                  y={
                    usesPairedDown
                      ? observedAt.y + observationBoxH / 2 + 4
                      : observedAt.y + 32
                  }
                  textAnchor="middle"
                  className={cn(
                    usesPairedDown ? 'text-label tabular-nums' : 'text-caption tabular-nums',
                    ledger?.state === 'violated'
                      ? 'fill-[color:var(--color-text-secondary)]'
                      : 'fill-[color:var(--color-text-quaternary)]',
                  )}
                  data-testid={
                    ledger
                      ? `architecture-role-ledger-${box.id}`
                      : `architecture-role-observation-${box.id}`
                  }
                  data-ledger-state={ledger?.state}
                >
                  {/* Only a role missing from a receipt others carry reaches here. */}
                  {ledger
                    ? ledgerImportsLabel(ledger.importsOut)
                    : usesPairedDown
                      ? observationMissingLabel
                      : `○ ${observationMissingLabel}`}
                </text>
              </g>
              </>
            ) : null}
          </g>
        );
      })}
    </>
  );
}
