import type { CSSProperties } from 'react';

/**
 * A ring of map marks around the closing headline, drawn by hand on a 1000×400 field that leaves
 * the middle clear for the words. Decoration only: it shows no count, name or real relation.
 */
const NODES: readonly { x: number; y: number; tone?: 'indigo' | 'amber' }[] = [
  { x: 96, y: 96 },
  { x: 176, y: 160, tone: 'indigo' },
  { x: 112, y: 258 },
  { x: 224, y: 300 },
  { x: 262, y: 84 },
  { x: 70, y: 330 },
  { x: 400, y: 58 },
  { x: 590, y: 62, tone: 'amber' },
  { x: 750, y: 82 },
  { x: 906, y: 104 },
  { x: 826, y: 168, tone: 'indigo' },
  { x: 898, y: 270 },
  { x: 776, y: 312 },
  { x: 936, y: 334 },
  { x: 630, y: 340 },
  { x: 500, y: 350, tone: 'indigo' },
  { x: 368, y: 338 },
];

/** Pairs of indices into `NODES`: a loop around the middle with a few short branches. */
const LINES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [1, 4], [2, 5], [4, 6], [6, 7], [7, 8], [8, 9], [9, 10],
  [10, 11], [11, 12], [11, 13], [12, 14], [14, 15], [15, 16], [16, 3], [10, 8],
];

/** Lines a point of light runs, each with its own start in the cycle so they never move as one. */
const PULSES: readonly { line: number; delayS: number }[] = [
  { line: 0, delayS: 0 },
  { line: 5, delayS: 1.4 },
  { line: 9, delayS: 2.6 },
  { line: 13, delayS: 3.9 },
  { line: 16, delayS: 5.1 },
  { line: 7, delayS: 6.3 },
];

const PULSE_CYCLE_S = 7.5;

export function ClosingConstellation() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 400"
      preserveAspectRatio="xMidYMid slice"
      className="gateway-constellation pointer-events-none absolute inset-0 h-full w-full max-lg:hidden"
      style={{ '--gateway-pulse-cycle': `${PULSE_CYCLE_S}s` } as CSSProperties}
    >
      {LINES.map(([from, to]) => (
        <line key={`${from}-${to}`} x1={NODES[from].x} y1={NODES[from].y} x2={NODES[to].x} y2={NODES[to].y} />
      ))}
      {PULSES.map(({ line, delayS }) => {
        const [from, to] = LINES[line];
        return (
          <circle
            key={line}
            className="gateway-constellation-pulse"
            cx={NODES[from].x}
            cy={NODES[from].y}
            r={2.6}
            style={
              {
                '--gateway-pulse-dx': `${NODES[to].x - NODES[from].x}px`,
                '--gateway-pulse-dy': `${NODES[to].y - NODES[from].y}px`,
                '--gateway-pulse-delay': `${delayS}s`,
              } as CSSProperties
            }
          />
        );
      })}
      {NODES.filter((node) => node.tone).map((node, index) => (
        <circle key={`halo-${index}`} className="gateway-constellation-halo" data-tone={node.tone} cx={node.x} cy={node.y} r={14} />
      ))}
      {NODES.map((node, index) => (
        <circle
          key={index}
          className="gateway-constellation-node"
          data-tone={node.tone}
          cx={node.x}
          cy={node.y}
          r={node.tone ? 4 : 3}
          style={{ '--gateway-pulse-delay': `${(index * 0.83) % PULSE_CYCLE_S}s` } as CSSProperties}
        />
      ))}
    </svg>
  );
}
