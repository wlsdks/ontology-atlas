export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeInOut = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
/** The gentlest travel: its top speed is half the cubic's, for the long flights. */
export const easeInOutSine = (v: number) => (1 - Math.cos(Math.PI * clamp01(v))) / 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
