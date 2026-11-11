import { useMemo } from 'react';

import { laneHeadingRect, placeEdgeSentences, stampSuffix, type SentenceEdge } from '../../model/edge-sentences';
import type { ArchitectureGraph as Graph } from '../../model/graph-layout';
import { opposedPairOffset } from './edge-path';
import { EMPTY_PANEL_SENTENCE_AIR, LANE_SENTENCE_GAP, NARROW_LADDER_EDGE, PAD_X, narrowSkipSwing, skipLanes, skipSwing } from './geometry';
import type { ArchitectureSketchProps, FlowAxis, Placed } from './types';


export function useEdgeSentenceLayout({
  graph,
  edgeSentence,
  contractTrackLabel,
  observationTrackLabel,
  observationStamp,
  axis,
  usesPairedDown,
  usesNarrowLadder,
  splitsEvidence,
  pairedGutterW,
  contractBoxW,
  observationBoxW,
  rowGap,
  padY,
  boxH,
  observationBoxH,
  colGap,
  observationOffset,
  focus,
  toSentenceEdge,
  drawnAtRest,
  layoutLeadRoom,
  layoutTrailRoom,
  placed,
  observedPlaced,
  emptyColumnLeft,
  saysRuleOnce,
}: {
  graph: ArchitectureSketchProps['graph'];
  edgeSentence: ArchitectureSketchProps['edgeSentence'];
  contractTrackLabel: ArchitectureSketchProps['contractTrackLabel'];
  observationTrackLabel: ArchitectureSketchProps['observationTrackLabel'];
  observationStamp: ArchitectureSketchProps['observationStamp'];
  axis: FlowAxis;
  usesPairedDown: boolean;
  usesNarrowLadder: boolean;
  splitsEvidence: boolean;
  pairedGutterW: number;
  contractBoxW: number;
  observationBoxW: number;
  rowGap: number;
  padY: number;
  boxH: number;
  observationBoxH: number;
  colGap: number;
  observationOffset: number;
  focus: string | null;
  toSentenceEdge: (edge: Graph['edges'][number]) => SentenceEdge;
  drawnAtRest: (edge: Graph['edges'][number]) => boolean;
  layoutLeadRoom: number;
  layoutTrailRoom: number;
  placed: ReadonlyMap<string, Placed>;
  observedPlaced: ReadonlyMap<string, Placed>;
  emptyColumnLeft: number | null;
  saysRuleOnce: boolean;
}) {
  const skipLane = useMemo(
    () => skipLanes(graph.edges, splitsEvidence || axis === 'down', drawnAtRest),
    [graph.edges, splitsEvidence, axis, drawnAtRest],
  );

  const sentences = useMemo(() => {
    /* In a row gap either sentence may read from its own arrow to within one gap of the other lane's. */
    const arrowSpan = contractBoxW / 2 + pairedGutterW + observationBoxW / 2 - LANE_SENTENCE_GAP;
    const placeLaneSentences = (
      edges: readonly Graph['edges'][number][],
      lane: ReadonlyMap<string, Placed>,
      laneBoxW: number,
      laneBoxH: number,
      skipSide: 'negative' | 'positive' = 'positive',
      occupied: readonly { x: number; y: number; width: number; height: number }[] = [],
    ) =>
      placeEdgeSentences({
        occupied,
        axis,
        edges: edges.map(toSentenceEdge),
        placed: lane,
        boxW: laneBoxW,
        boxH: laneBoxH,
        rowGap,
        colGap,
        swingOf: (edge) => {
          const skipLaneIndex = skipLane.get(`${edge.kind}:${edge.from}>${edge.to}`) ?? 0;
          return usesNarrowLadder
            ? narrowSkipSwing(skipLaneIndex, laneBoxW / 2)
            : skipSwing(edge.columnSpan, skipLaneIndex, (axis === 'across' ? laneBoxH : laneBoxW) / 2);
        },
        leadRoom: layoutLeadRoom,
        trailRoom: layoutTrailRoom,
        skipSide,
        /* The contract lane reads right over the gutter; the observation lane reads left, leaving its right side to the skip arcs. */
        connectorSide: usesNarrowLadder ? 'split' : lane === placed ? 'right' : 'left',
        /* On the narrow ladder the sentence may run to the canvas edge, which a nineteen-glyph Korean rule needs. */
        connectorRoom: usesNarrowLadder
          ? contractBoxW / 2 + NARROW_LADDER_EDGE + PAD_X
          : lane === placed
            ? Math.min(
                arrowSpan,
                /* Before an inspection a rule sentence stops one air short of the empty column. */
                emptyColumnLeft === null
                  ? Number.POSITIVE_INFINITY
                  : emptyColumnLeft -
                      EMPTY_PANEL_SENTENCE_AIR -
                      (PAD_X + layoutLeadRoom + contractBoxW / 2) +
                      12,
              )
            : arrowSpan,
        opposedPairOffset: opposedPairOffset(axis === 'down' && !splitsEvidence),
        sentenceOf: edgeSentence,
        focus,
      });
    if (!splitsEvidence) return placeLaneSentences(graph.edges, placed, contractBoxW, boxH);
    const headings =
      axis === 'across'
        ? [
            laneHeadingRect(contractTrackLabel, PAD_X, padY + layoutLeadRoom - 6),
            laneHeadingRect(observationTrackLabel + stampSuffix(observationStamp), PAD_X, padY + layoutLeadRoom + observationOffset - 6),
          ]
        : [];
    const rules = placeLaneSentences(
      graph.edges.filter((edge) => edge.kind === 'permitted'),
      placed,
      contractBoxW,
      boxH,
      usesPairedDown ? 'negative' : 'positive',
      headings,
    ).map((placement) =>
      saysRuleOnce ? { ...placement, hidden: 'said-once' as const, rect: undefined } : placement,
    );
    /* The rule lane places first; a count sentence that would touch it gives way. */
    const held = [...headings, ...rules.flatMap((placement) => (placement.rect ? [placement.rect] : []))];
    return [
      ...rules,
      ...placeLaneSentences(
        graph.edges.filter((edge) => edge.kind === 'traffic'),
        observedPlaced,
        observationBoxW,
        observationBoxH,
        'positive',
        held,
      ),
    ];
  }, [
    axis,
    boxH,
    contractBoxW,
    contractTrackLabel,
    colGap,
    edgeSentence,
    emptyColumnLeft,
    focus,
    graph.edges,
    layoutLeadRoom,
    layoutTrailRoom,
    observationBoxH,
    observationBoxW,
    observationOffset,
    observationStamp,
    observationTrackLabel,
    observedPlaced,
    padY,
    pairedGutterW,
    placed,
    rowGap,
    saysRuleOnce,
    skipLane,
    splitsEvidence,
    toSentenceEdge,
    usesNarrowLadder,
    usesPairedDown,
  ]);
  return {
    skipLane,
    sentences,
  };
}
