import type { DeskProgress } from '../model/desk-line';

const RING_PX = 14;
const RING_RADIUS = 6;

/**
 * The ring moves to each new value by a CSS transition: no React state changes per frame, and a
 * hidden ring has nothing running. A new quantity or total starts a new arc at its own value.
 */
export function ProgressRing({ fraction, label, measure, track }: { fraction: number; label: string; measure: DeskProgress['measure']; track: string }) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(fraction * 100)}
      data-testid="meaning-desk-ring"
      data-ring-measure={measure}
      data-ring-value={fraction.toFixed(4)}
      className="inline-grid size-3.5 flex-none place-items-center"
    >
      <svg width={RING_PX} height={RING_PX} viewBox={`0 0 ${RING_PX} ${RING_PX}`} fill="none" aria-hidden="true">
        <circle cx={RING_PX / 2} cy={RING_PX / 2} r={RING_RADIUS} strokeWidth={1.5} stroke="var(--color-overlay-3)" />
        <circle
          key={track}
          cx={RING_PX / 2}
          cy={RING_PX / 2}
          r={RING_RADIUS}
          strokeWidth={1.5}
          stroke="var(--color-indigo-accent)"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          style={{ strokeDashoffset: 1 - fraction }}
          data-testid="meaning-desk-ring-arc"
          className="transition-[stroke-dashoffset] duration-[var(--motion-slow)] ease-[var(--motion-ease)] motion-reduce:transition-none"
          transform={`rotate(-90 ${RING_PX / 2} ${RING_PX / 2})`}
        />
      </svg>
    </span>
  );
}
