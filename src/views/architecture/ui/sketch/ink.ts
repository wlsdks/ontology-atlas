/** One stroke colour, named once: the brand step clears 3:1 on the canvas where translucent indigo did not. The legend reads it too. */
export const EDGE_STROKE = 'var(--color-indigo-brand)';
/** A violated edge wears the receipt pill's own danger tone plus a dash, so it survives without colour and never contradicts the pill. */
export const VIOLATED_STROKE = 'var(--color-danger-text)';
/* Blur is on the SVG filter because `stdDeviation` cannot read `var()`. */
export const VIOLATION_HALO_BLUR = 2.5;
export const VIOLATION_HALO_WIDTH = 4;
