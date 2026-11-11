import { Fragment, type CSSProperties } from 'react';

import type { ArchitectureGraph as Graph } from '../../model/graph-layout';
import { edgePath, OPPOSED_PAIR_OFFSET, opposedPairOffset } from './edge-path';
import { narrowSkipSwing, skipSwing } from './geometry';
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
  const edgeKeys = new Set(graph.edges.map((edge) => `${edge.kind}:${edge.from}>${edge.to}`));
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
        const key = `${edge.kind}:${edge.from}>${edge.to}`;
        const oppositeKey = `${edge.kind}:${edge.to}>${edge.from}`;
        const opposed = edgeKeys.has(oppositeKey);
        const lane = skipLane.get(key) ?? 0;
        /* A declared rule keeps one width; measured traffic's width carries its count. */
        const isDeclared = edge.kind === 'permitted';
        /* A ladder's skip leaves the side of its face: rules on the left, measured imports on the right. */
        const leavesSide = axis === 'down' && edge.columnSpan > 1;
        /* Of an opposed pair of skips the one on the outer lane stands outside, so the two never cross. */
        const standsOutside = (skipLane.get(oppositeKey) ?? 0) < lane;
        /* Rule and traffic share the narrow ladder's centre line, and an opposed pair shares one gap: each stroke stands off it. */
        const sharesLine = axis === 'down' && !splitsEvidence;
        const trackOffset =
          (sharesLine ? (isDeclared ? -6 : 6) : 0) +
          (opposed && !leavesSide
            ? ((edge.columnSpan > 1 ? standsOutside : edge.climbs) ? 1 : -1) * opposedPairOffset(sharesLine)
            : 0);
        /* Two opposed side arcs nest: the inner one's ends sit nearer each other. */
        const portShift = opposed && leavesSide ? (standsOutside ? -1 : 1) * OPPOSED_PAIR_OFFSET : 0;
        const receded = selected !== null && selected !== edge.from && selected !== edge.to;
        /* Choosing either end of a violation raises it; nothing moves while nothing is selected. */
        const raised = selected !== null && (selected === edge.from || selected === edge.to);

        const violated = violatedPairs.has(`${edge.from}>${edge.to}`);
        /* A mask, so the arrowhead arrives with its line. */
        const arrivalMask =
          arriving && drawn && edge.kind === 'traffic' ? `architecture-arrive-${edge.from}-${edge.to}` : null;
        const swing =
          edge.columnSpan <= 1
            ? 0
            : axis === 'across'
              ? skipSwing(edge.columnSpan, lane, edgeBoxH / 2)
              : usesPairedDown
                ? skipSwing(edge.columnSpan, lane, edgeBoxW / 2)
                : narrowSkipSwing(lane, edgeBoxW / 2);
        const d = edgePath({
          axis,
          skipSide: isDeclared ? 'left' : 'right',
          portShift,
          from: a,
          to: b,
          boxW: edgeBoxW,
          boxH: edgeBoxH,
          columnSpan: edge.columnSpan,
          climbs: edge.climbs,
          trackOffset,
          swing,
          colGap,
          rowGap,
        });

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
          {/* The halo has no data-edge-* identity, so stroke counts stay one per crossing; only selection changes its intensity. */}
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
