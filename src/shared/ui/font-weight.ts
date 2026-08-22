/**
 * JS mirror of the font-weight ramp — a literal copy of `--font-weight-*` in
 * `app/globals.css`.
 *
 * **Why a copy.** Canvas takes weight and size as one string
 * (`ctx.font = "650 12px …"`) and that string does not resolve `var()` — a 2D
 * context has no cascade. So the values must be transcribed, and a transcription
 * without a gate always drifts. Same structure and same reason as `ICON_SIZE`
 * (the numeric-prop channel) and `MOTION` (the framer channel).
 *
 * **What had already gone wrong** (measured 2026-08-05). After the weight axis
 * was fully closed in the DOM, canvas was still drawing at `600` — three places
 * in `cluster-chips.ts`, one in `node-shapes.ts`. 600 is not a step in any ramp
 * here; `globals.css` excludes the Tailwind defaults (500/600/700) explicitly.
 * The canvas layer had also already split against itself:
 * `footprint-glyph.ts` used `650`. One sibling on the ramp, four off it, unseen.
 *
 * **Why no gate saw it.** Lint selectors read className strings and the ramp
 * ratchet counts utility classes in `.tsx`; canvas interpolates a number into a
 * template string inside `.ts`, out of range of both. Drawing surfaces (canvas,
 * inline SVG) are invisible to a DOM sweep too.
 *
 * Gate: `tests/contract/font-weight-mirror.contract.test.ts` parses the CSS,
 * compares it with these values, and catches off-ramp weight literals left in
 * canvas sources.
 */
export const FONT_WEIGHT = {
  /** Default emphasis over body text. `--font-weight-signature`. */
  signature: 510,
  /** Inline emphasis within a row. `--font-weight-emphasis`. */
  emphasis: 560,
  /** Headings, emphasised figures, and **canvas text**. `--font-weight-strong`. */
  strong: 650,
} as const;

