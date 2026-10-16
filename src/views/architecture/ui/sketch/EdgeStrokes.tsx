import { Fragment, type CSSProperties } from 'react';

import type { ArchitectureGraph as Graph } from '../../model/graph-layout';
import { skipSwing } from './geometry';
import {
  EDGE_STROKE,
  RECEDED_STROKE_OPACITY,
  VIOLATED_STROKE,
  VIOLATION_HALO_WIDTH,
  VIOLATION_HALO_WIDTH_RAISED,
  VIOLATION_STROKE_RAISE,
} from './ink';
import type { ArchitectureSketchProps, FlowAxis, Placed } from './types';

export function EdgeStrokes({
  graph,
  selected,
  violatedPairs,
  axis,
  usesPairedDown,
  splitsEvidence,
  contractBoxW,
  observationBoxW,
  rowGap,
  boxH,
  observationBoxH,
  colGap,
  placed,
  observedPlaced,
  skipLane,
  visibleEdges,
  arriving,
}: {
  graph: ArchitectureSketchProps['graph'];
  selected: ArchitectureSketchProps['selected'];
  violatedPairs: ArchitectureSketchProps['violatedPairs'];
  axis: FlowAxis;
  usesPairedDown: boolean;
  splitsEvidence: boolean;
  contractBoxW: number;
  observationBoxW: number;
  rowGap: number;
  boxH: number;
  observationBoxH: number;
  colGap: number;
  placed: ReadonlyMap<string, Placed>;
  observedPlaced: ReadonlyMap<string, Placed>;
  skipLane: ReadonlyMap<string, number>;
  visibleEdges: Graph['edges'];
  arriving: boolean;
}) {
  const rankOf = new Map(graph.boxes.map((box) => [box.id, box.column]));
  const lastRank = Math.max(0, graph.columns - 1);
  return (
    <>
      {graph.edges.map((edge) => {
        const usesObservationLane = splitsEvidence && edge.kind === 'traffic';
        const edgeLane = usesObservationLane ? observedPlaced : placed;
        const a = edgeLane.get(edge.from);
        const b = edgeLane.get(edge.to);
        if (!a || !b) return null;
        /* A skip stays mounted at zero opacity, so revealing it on selection is a fade, not a mount. */
        const drawn = visibleEdges.includes(edge);
        const edgeBoxW = usesObservationLane ? observationBoxW : contractBoxW;
        const edgeBoxH = usesObservationLane ? observationBoxH : boxH;
        const trackY = (at: Placed) => at.y + edgeBoxH / 2;
        /* Rule and traffic strokes sit six units apart on the compact downward layout, or traffic overpaints the rule. */
        const trackOffset = axis === 'down' && !splitsEvidence
          ? edge.kind === 'permitted'
            ? -6
            : 6
          : 0;
        const sx = axis === 'across' ? a.x + edgeBoxW : a.x + edgeBoxW / 2 + trackOffset;
        const sy = axis === 'across' ? trackY(a) : a.y + edgeBoxH;
        const tx = axis === 'across' ? b.x : b.x + edgeBoxW / 2 + trackOffset;
        const ty = axis === 'across' ? trackY(b) : b.y;
        const receded = selected !== null && selected !== edge.from && selected !== edge.to;
        /* Choosing either end of a violation raises it; nothing moves while nothing is selected. */
        const raised = selected !== null && (selected === edge.from || selected === edge.to);

        /* A declared rule keeps one width; measured traffic's width carries its count. */
        const isDeclared = edge.kind === 'permitted';
        const violated = violatedPairs.has(`${edge.from}>${edge.to}`);
        /* A mask, so the arrowhead arrives with its line. */
        const arrivalMask =
          arriving && drawn && edge.kind === 'traffic' ? `architecture-arrive-${edge.from}-${edge.to}` : null;
        const swing =
          edge.columnSpan <= 1
            ? 0
            : skipSwing(edge.columnSpan, skipLane.get(`${edge.from}>${edge.to}`) ?? 0, (axis === 'across' ? edgeBoxH : edgeBoxW) / 2);
        const lead = axis === 'across' ? colGap : rowGap;
        const d = (() => {
          if (edge.columnSpan <= 1) {
            return axis === 'across'
              ? `M ${sx} ${sy} C ${sx + lead * 0.6} ${sy}, ${tx - lead * 0.6} ${ty}, ${tx} ${ty}`
              : `M ${sx} ${sy} C ${sx} ${sy + lead * 0.6}, ${tx} ${ty - lead * 0.6}, ${tx} ${ty}`;
          }
          if (axis === 'across') {
            const midY = Math.max(sy, ty) + swing;
            return `M ${sx} ${sy} C ${sx + colGap} ${sy}, ${sx + colGap} ${midY}, ${
              (sx + tx) / 2
            } ${midY} C ${tx - colGap} ${midY}, ${tx - colGap} ${ty}, ${tx} ${ty}`;
          }
          if (usesPairedDown) {
            /* On the ladder a skip leaves the face's side, not its foot, clearing the adjacent sentence's row gap. */
            const negative = isDeclared;
            const edgeX = (face: Placed) => (negative ? face.x : face.x + edgeBoxW);
            const psx = edgeX(a);
            const psy = a.y + edgeBoxH / 2;
            const ptx = edgeX(b);
            const pty = b.y + edgeBoxH / 2;
            const apex = negative
              ? Math.min(a.x, b.x) - (swing - edgeBoxW / 2)
              : Math.max(a.x, b.x) + edgeBoxW + (swing - edgeBoxW / 2);
            return `M ${psx} ${psy} C ${apex} ${psy}, ${apex} ${pty}, ${ptx} ${pty}`;
          }
          const midX = Math.max(sx, tx) + swing;
          return `M ${sx} ${sy} C ${sx} ${sy + rowGap}, ${midX} ${sy + rowGap}, ${midX} ${
            (sy + ty) / 2
          } C ${midX} ${ty - rowGap}, ${tx} ${ty - rowGap}, ${tx} ${ty}`;
        })();

        return (
          <Fragment key={`${edge.kind}-${edge.from}-${edge.to}`}>
          {arrivalMask ? (
            <mask id={arrivalMask} maskUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
              <path
                d={d}
                pathLength={1}
                fill="none"
                stroke={EDGE_STROKE}
                strokeWidth={28}
                className={violated ? 'architecture-arrive-climb' : 'architecture-arrive-draw'}
                style={
                  {
                    '--motion-stagger-index': violated ? lastRank : rankOf.get(edge.from) ?? 0,
                  } as CSSProperties
                }
              />
            </mask>
          ) : null}
          {/* The halo marks the climb up the stack. It has no data-edge-* identity, so stroke counts stay one per crossing; only selection changes its intensity. */}
          {violated && drawn ? (
            <path
              d={d}
              fill="none"
              stroke={VIOLATED_STROKE}
              strokeWidth={raised ? VIOLATION_HALO_WIDTH_RAISED : VIOLATION_HALO_WIDTH}
              strokeLinecap="round"
              filter="url(#architecture-violation-halo)"
              className="architecture-violation-halo"
              mask={arrivalMask ? `url(#${arrivalMask})` : undefined}
              data-edge-raised={raised ? 'true' : 'false'}
              data-testid={`architecture-violation-halo-${edge.from}-${edge.to}`}
              aria-hidden
              pointerEvents="none"
            />
          ) : null}
          <path
            d={d}
            fill="none"
            stroke={violated ? VIOLATED_STROKE : EDGE_STROKE}
            strokeWidth={
              (isDeclared
                ? 1.4
                : edge.columnSpan > 1
                  ? 1.2 + (edge.weight ?? 0) * 1.5
                  : 1.4 + (edge.weight ?? 0) * 3) +
              (violated && raised ? VIOLATION_STROKE_RAISE : 0)
            }
            /* Dashed as well as toned: the tone is the alarm, the dash is the fact, and it survives greyscale. */
            strokeDasharray={violated ? '5 3' : undefined}
            strokeLinecap="round"
            markerEnd={
              violated
                ? 'url(#architecture-sketch-arrow-violation)'
                : 'url(#architecture-sketch-arrow)'
            }
            mask={arrivalMask ? `url(#${arrivalMask})` : undefined}
            pointerEvents={drawn ? undefined : 'none'}
            aria-hidden={!drawn}
            data-edge-drawn={drawn ? 'true' : 'false'}
            className="architecture-stroke"
            style={{ opacity: !drawn ? 0 : receded ? RECEDED_STROKE_OPACITY : 1 }}
            data-edge-kind={edge.kind}
            data-edge-violated={violated ? 'true' : undefined}
            data-edge-from={edge.from}
            data-edge-to={edge.to}
            data-edge-count={edge.count}
            data-edge-track-offset={trackOffset}
          />
          </Fragment>
        );
      })}
    </>
  );
}
