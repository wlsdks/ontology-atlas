import { EDGE_STROKE } from './ink';
import type { FlowAxis, Placed } from './types';

/**
 * Where a currently drawn dependency leaves a role face; created only when a visible edge leaves
 * that side. Hollow-to-solid mirrors focus without a second selection colour.
 */
export function ConnectionPort({
  axis,
  at,
  boxW,
  boxH,
  climbs = false,
  active,
  lane,
  side,
}: {
  axis: FlowAxis;
  at: Placed;
  boxW: number;
  boxH: number;
  /** A stroke running against the chain leaves the edge that looks back along it. */
  climbs?: boolean;
  active: boolean;
  lane: 'contract' | 'observation';
  /** A ladder skip leaves and arrives at the face's side; the port sits there, mid-height. */
  side?: 'left' | 'right';
}) {
  const cx = side
    ? side === 'left' ? at.x : at.x + boxW
    : axis === 'across' ? at.x + (climbs ? 0 : boxW) : at.x + boxW / 2;
  const cy = side || axis === 'across' ? at.y + boxH / 2 : at.y + (climbs ? 0 : boxH);

  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={active ? EDGE_STROKE : 'var(--color-canvas)'}
      stroke={EDGE_STROKE}
      strokeWidth={1.5}
      opacity={active ? 1 : 0.42}
      className="architecture-node-port"
      aria-hidden
      pointerEvents="none"
      data-architecture-port={lane}
      data-port-climbs={climbs ? 'true' : undefined}
      data-port-side={side}
    />
  );
}
