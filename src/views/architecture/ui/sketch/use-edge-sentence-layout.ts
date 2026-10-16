import { useMemo } from 'react';

import { laneHeadingRect, placeEdgeSentences, type SentenceEdge } from '../../model/edge-sentences';
import type { ArchitectureGraph as Graph } from '../../model/graph-layout';
import { EMPTY_PANEL_SENTENCE_AIR, NARROW_LADDER_EDGE, PAD_X, skipSwing } from './geometry';
import type { ArchitectureSketchProps, FlowAxis, Placed } from './types';

/* Keeps a rule sentence and a count sentence apart in the shared gutter row gap. */
const GAP_BETWEEN_LANE_SENTENCES = 24;

export function useEdgeSentenceLayout({
  graph,
  edgeSentence,
  contractTrackLabel,
  observationTrackLabel,
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
  layoutLeadRoom: number;
  layoutTrailRoom: number;
  placed: ReadonlyMap<string, Placed>;
  observedPlaced: ReadonlyMap<string, Placed>;
  emptyColumnLeft: number | null;
  saysRuleOnce: boolean;
}) {
  /** Which lane each skip takes, counted within its span; deterministic because the edge order is stable. */
  const skipLane = useMemo(() => {
    const lanes = new Map<string, number>();
    const used = new Map<number, number>();
    for (const edge of graph.edges) {
      if (edge.columnSpan <= 1) continue;
      const taken = used.get(edge.columnSpan) ?? 0;
      lanes.set(`${edge.from}>${edge.to}`, taken);
      used.set(edge.columnSpan, taken + 1);
    }
    return lanes;
  }, [graph.edges]);

  const sentences = useMemo(() => {
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
        swingOf: (edge) =>
          skipSwing(edge.columnSpan, skipLane.get(`${edge.from}>${edge.to}`) ?? 0, (axis === 'across' ? laneBoxH : laneBoxW) / 2),
        leadRoom: layoutLeadRoom,
        trailRoom: layoutTrailRoom,
        skipSide,
        /* On the ladders an adjacent rule's sentence sits beside its arrow, in the clear row gap. */
        adjacentSeat: usesPairedDown || usesNarrowLadder ? 'connector' : 'lead',
        /* The contract lane reads right over the gutter; the observation lane reads left, leaving its right side to the skip arcs. */
        connectorSide: usesNarrowLadder ? 'split' : lane === placed ? 'right' : 'left',
        /* On the narrow ladder the sentence may run to the canvas edge, which a nineteen-glyph Korean rule needs. */
        connectorRoom: usesNarrowLadder
          ? contractBoxW / 2 + NARROW_LADDER_EDGE + PAD_X
          : lane === placed
            ? Math.min(
                contractBoxW / 2 + pairedGutterW + observationBoxW / 2 - GAP_BETWEEN_LANE_SENTENCES,
                /* Before an inspection a rule sentence stops one air short of the empty column (`placeEdgeSentences` spends the arrow gap and 12 of padding). */
                emptyColumnLeft === null
                  ? Number.POSITIVE_INFINITY
                  : emptyColumnLeft -
                      EMPTY_PANEL_SENTENCE_AIR -
                      (PAD_X + layoutLeadRoom + contractBoxW / 2) +
                      12,
              )
            : observationBoxW / 2 + pairedGutterW - GAP_BETWEEN_LANE_SENTENCES,
        sentenceOf: edgeSentence,
        focus,
      });
    if (!splitsEvidence) return placeLaneSentences(graph.edges, placed, contractBoxW, boxH);
    const headings =
      axis === 'across'
        ? [
            laneHeadingRect(contractTrackLabel, PAD_X, padY + layoutLeadRoom - 6),
            laneHeadingRect(observationTrackLabel, PAD_X, padY + layoutLeadRoom + observationOffset - 6),
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
