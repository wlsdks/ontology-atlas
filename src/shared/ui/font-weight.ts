/**
 * JS mirror of `--font-weight-*` in `app/globals.css`, because a canvas `ctx.font` string
 * cannot resolve `var()`. Lint and the ramp ratchet read only classNames,
 * so `tests/contract/font-weight-mirror.contract.test.ts` compares these values with the CSS
 * and catches off-ramp weights in canvas sources.
 */
export const FONT_WEIGHT = {
  /** `--font-weight-signature`: default emphasis over body text. */
  signature: 510,
  /** `--font-weight-emphasis`: inline emphasis within a row. */
  emphasis: 560,
  /** `--font-weight-strong`: headings, emphasised figures and canvas text. */
  strong: 650,
} as const;

