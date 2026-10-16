import { useMemo } from 'react';

import { PAD_X } from './geometry';
import type { ArchitectureSketchProps, EmptyPanel, FlowAxis, Placed } from './types';

function boxOrigin(
  axis: FlowAxis,
  rank: number,
  lane: number,
  boxH: number,
  boxW: number,
  rowGap: number,
  padY: number,
  colGap: number,
): { x: number; y: number } {
  const along = rank * (axis === 'across' ? boxW + colGap : boxH + rowGap);
  const across = lane * (axis === 'across' ? boxH + rowGap : boxW + colGap);
  return axis === 'across'
    ? { x: PAD_X + along, y: padY + across }
    : { x: PAD_X + across, y: padY + along };
}

export function useSketchPlacement({
  graph,
  axis,
  usesPairedDown,
  splitsEvidence,
  observationEmpty,
  pairedGutterW,
  contractBoxW,
  observationBoxW,
  rowGap,
  padY,
  boxH,
  observationBoxH,
  colGap,
  observationOffset,
  planeHeadRoom,
  pairedHeaderH,
  layoutLeadRoom,
}: {
  graph: ArchitectureSketchProps['graph'];
  axis: FlowAxis;
  usesPairedDown: boolean;
  splitsEvidence: boolean;
  observationEmpty: boolean;
  pairedGutterW: number;
  contractBoxW: number;
  observationBoxW: number;
  rowGap: number;
  padY: number;
  boxH: number;
  observationBoxH: number;
  colGap: number;
  observationOffset: number;
  planeHeadRoom: number;
  pairedHeaderH: number;
  layoutLeadRoom: number;
}) {
  const placed = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const box of graph.boxes) {
      const at = boxOrigin(axis, box.column, box.slot, boxH, contractBoxW, rowGap, padY, colGap);
      map.set(box.id, {
        id: box.id,
        x: at.x + (axis === 'down' ? layoutLeadRoom : 0),
        y:
          at.y +
          (axis === 'across'
            ? layoutLeadRoom
            : usesPairedDown
              ? pairedHeaderH + planeHeadRoom
              : 0),
        shape: box.shape,
      });
    }
    return map;
  }, [
    axis,
    boxH,
    colGap,
    contractBoxW,
    graph.boxes,
    layoutLeadRoom,
    padY,
    pairedHeaderH,
    planeHeadRoom,
    rowGap,
    usesPairedDown,
  ]);
  const observedPlaced = useMemo(() => {
    if (!splitsEvidence) return placed;
    return new Map(
      [...placed].map(([id, at]) => [
        id,
        usesPairedDown
          ? {
              ...at,
              x: at.x + observationOffset,
              y: at.y + (boxH - observationBoxH) / 2,
            }
          : { ...at, y: at.y + observationOffset },
      ]),
    );
  }, [boxH, observationBoxH, observationOffset, placed, splitsEvidence, usesPairedDown]);

  /* Where the one empty state stands: the ladder's observation column, or one band per across row. */
  const emptyPanels = useMemo((): EmptyPanel[] => {
    if (!observationEmpty) return [];
    const faces = [...placed.values()];
    if (faces.length === 0) return [];
    if (usesPairedDown) {
      const x = Math.min(...faces.map((face) => face.x)) + contractBoxW + pairedGutterW;
      const top = Math.min(...faces.map((face) => face.y));
      const bottom = Math.max(...faces.map((face) => face.y)) + boxH;
      return [
        {
          key: 'column',
          layout: 'column',
          x,
          y: top,
          width: observationBoxW,
          height: bottom - top,
        },
      ];
    }
    const rows = new Map<number, Placed[]>();
    for (const face of observedPlaced.values()) {
      rows.set(face.y, [...(rows.get(face.y) ?? []), face]);
    }
    return [...rows].map(([y, row]) => {
      const x = Math.min(...row.map((face) => face.x));
      return {
        key: `band-${y}`,
        layout: 'band',
        x,
        y,
        width: Math.max(...row.map((face) => face.x)) + observationBoxW - x,
        height: observationBoxH,
      };
    });
  }, [
    boxH,
    contractBoxW,
    observationBoxH,
    observationBoxW,
    observationEmpty,
    observedPlaced,
    pairedGutterW,
    placed,
    usesPairedDown,
  ]);
  const emptyColumn = emptyPanels.find((panel) => panel.layout === 'column') ?? null;
  /** The first x the empty column claims, so a rule sentence beside an arrow stops short of it. */
  const emptyColumnLeft = emptyColumn?.x ?? null;

  /* Box ends in SVG units, which are CSS pixels since the drawing is not scaled. Derived, never a ref written during render. */
  const boxEnd = useMemo(
    () => ({
      /* A roomy role's lowest face (its observation card) is the boundary the hidden count measures, since the group is the role. */
      down: graph.boxes.map((box) => {
        const contract = placed.get(box.id);
        const observation = observedPlaced.get(box.id);
        if (!contract) return 0;
        return splitsEvidence && observation
          ? Math.max(contract.y + boxH, observation.y + observationBoxH)
          : contract.y + boxH;
      }),
      across: [...placed.values()].map(
        (at) =>
          at.x +
          (usesPairedDown
            ? contractBoxW + pairedGutterW + observationBoxW
            : contractBoxW),
      ),
    }),
    [
      boxH,
      contractBoxW,
      graph.boxes,
      observationBoxH,
      observationBoxW,
      observedPlaced,
      pairedGutterW,
      placed,
      splitsEvidence,
      usesPairedDown,
    ],
  );
  return {
    placed,
    observedPlaced,
    emptyPanels,
    emptyColumn,
    emptyColumnLeft,
    boxEnd,
  };
}
