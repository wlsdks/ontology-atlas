import { EDGE_STROKE, VIOLATION_HALO_BLUR } from './ink';

const ARROW_HEAD_LENGTH = 4.2;

export function SketchDefs({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return (
    <defs>
      {/* An explicit stroke, not `context-stroke`, which WebKit does not resolve on markers. */}
      {[
        ['architecture-sketch-arrow', EDGE_STROKE],
        ['architecture-sketch-arrow-violation', 'var(--color-danger-text)'],
      ].map(([id, stroke]) => (
        <marker
          key={id}
          id={id}
          viewBox={`0 0 ${ARROW_HEAD_LENGTH} 5.4`}
          refX={ARROW_HEAD_LENGTH}
          refY="2.7"
          markerWidth={ARROW_HEAD_LENGTH}
          markerHeight="5.4"
          orient="auto"
        >
          <path
            d="M0.5,0.6 L3.7,2.7 L0.5,4.8"
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      ))}
      {/* `userSpaceOnUse`: a vertical stroke has a zero-width bounding box, which would clip a percentage filter region to nothing. */}
      <filter
        id="architecture-violation-halo"
        filterUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={width}
        height={height}
      >
        <feGaussianBlur stdDeviation={VIOLATION_HALO_BLUR} />
      </filter>
    </defs>
  );
}
