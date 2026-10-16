import type { CSSProperties } from 'react';

import { PLANE_INSET_Y } from './geometry';
import type { ArchitectureSketchProps, ArrivalPhase, Placed } from './types';

/** One row band per role, joining its contract face to its observation face with equal overhang. */
export function LayerPlanes({
  graph,
  arrival,
  pairedGutterW,
  contractBoxW,
  observationBoxW,
  boxH,
  planeRoom,
  placed,
}: {
  graph: ArchitectureSketchProps['graph'];
  arrival: ArrivalPhase;
  pairedGutterW: number;
  contractBoxW: number;
  observationBoxW: number;
  boxH: number;
  planeRoom: number;
  placed: ReadonlyMap<string, Placed>;
}) {
  const bandW = contractBoxW + pairedGutterW + observationBoxW + planeRoom * 2;
  return (
    <g
      aria-hidden
      pointerEvents="none"
      data-testid="architecture-layer-planes"
      data-plane-overhang={planeRoom}
    >
      {graph.boxes.map((box) => {
        const at = placed.get(box.id);
        if (!at) return null;
        const x = at.x - planeRoom;
        const top = at.y - PLANE_INSET_Y;
        return (
          <g
            key={`plane-${box.id}`}
            className={
              arrival === 'arriving'
                ? 'architecture-arrive-plane'
                : arrival === 'rest'
                  ? 'architecture-role-reveal'
                  : undefined
            }
            style={
              arrival === 'arriving'
                ? ({ '--architecture-plane-from': (contractBoxW + planeRoom) / bandW } as CSSProperties)
                : undefined
            }
            data-testid={`architecture-layer-plane-${box.id}`}
            data-layer-rank={box.column}
          >
            <rect
              x={x}
              y={top}
              width={bandW}
              height={boxH + PLANE_INSET_Y * 2}
              fill="var(--architecture-plane-fill)"
            />
            {/* The lit top face, the same one-flat-line device a raised node already uses. */}
            <line
              x1={x}
              x2={x + bandW}
              y1={top}
              y2={top}
              stroke="var(--architecture-plane-edge)"
              strokeWidth={1}
            />
          </g>
        );
      })}
    </g>
  );
}
