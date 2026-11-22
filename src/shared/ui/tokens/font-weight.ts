/**
 * JS mirror of `--font-weight-*` in `app/globals.css`, because a canvas `ctx.font` string
 * cannot resolve `var()`. Lint and the ramp ratchet read only classNames, so
 * tests/contract/typography/drawing-surface-type.contract.test.ts compares these values with the CSS and
 * catches off-ramp weights in canvas sources.
 */
export const FONT_WEIGHT = {
  signature: 510,
  emphasis: 560,
  strong: 650,
} as const;

