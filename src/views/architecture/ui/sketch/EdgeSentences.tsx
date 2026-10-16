import type { CSSProperties } from 'react';

import { cn } from '@/shared/lib/cn';

import type { SentencePlacement } from '../../model/edge-sentences';
import type { ArchitectureGraph as Graph } from '../../model/graph-layout';
import { RECEDED_STROKE_OPACITY } from './ink';
import type { ArchitectureSketchProps } from './types';

export function EdgeSentences({
  graph,
  selected,
  violatedPairs,
  sentences,
  visibleEdges,
  arriving,
}: {
  graph: ArchitectureSketchProps['graph'];
  selected: ArchitectureSketchProps['selected'];
  violatedPairs: ArchitectureSketchProps['violatedPairs'];
  sentences: readonly SentencePlacement[];
  visibleEdges: Graph['edges'];
  arriving: boolean;
}) {
  const rankOf = new Map(graph.boxes.map((box) => [box.id, box.column]));
  return (
    <>
      {sentences.map((sentence) => {
        const edge = graph.edges.find(
          (e) => e.kind === sentence.kind && e.from === sentence.from && e.to === sentence.to,
        );
        const drawnStroke = edge !== undefined && visibleEdges.includes(edge);
        const receded =
          selected !== null && selected !== sentence.from && selected !== sentence.to;
        const violated = violatedPairs.has(sentence.key);
        const shown = sentence.hidden === undefined && drawnStroke;
        const arrives = arriving && shown && sentence.kind === 'traffic';
        return (
          <text
            key={`sentence-${sentence.kind}-${sentence.key}`}
            x={sentence.x}
            y={sentence.y}
            textAnchor={sentence.anchor}
            className={cn(
              'architecture-stroke text-label',
              arrives && 'architecture-arrive-mark',
              violated
                ? 'fill-[color:var(--color-danger-text)]'
                : sentence.kind === 'traffic'
                  ? 'fill-[color:var(--color-text-secondary)] tabular-nums'
                  : 'fill-[color:var(--color-text-tertiary)]',
            )}
            style={{
              opacity: !shown ? 0 : receded ? RECEDED_STROKE_OPACITY : 1,
              ...(arrives
                ? ({
                    '--motion-stagger-index': violated
                      ? Math.max(0, graph.columns - 1)
                      : rankOf.get(sentence.from) ?? 0,
                  } as CSSProperties)
                : null),
            }}
            aria-hidden={!shown}
            data-testid={`architecture-edge-sentence-${sentence.from}-${sentence.to}`}
            data-edge-sentence={sentence.hidden ?? (drawnStroke ? 'drawn' : 'held')}
            data-edge-sentence-kind={sentence.kind}
          >
            {sentence.text}
          </text>
        );
      })}
    </>
  );
}
