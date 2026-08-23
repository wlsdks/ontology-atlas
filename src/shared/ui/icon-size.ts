/**
 * The **JS mirror** of the content-icon size ramp — a verbatim copy of
 * `--icon-*` in `app/globals.css`.
 *
 * **Why a copy.** A lucide icon's size arrives as a JSX numeric prop
 * (`size={N}`), and a numeric prop cannot read a CSS `var()`. So the values have
 * to be transcribed, and a transcribed value always drifts without a gate — the
 * same structure as the MOTION mirror in `src/shared/motion/index.ts`, with the
 * same shape of gate: `tests/contract/icon-size-ramp.contract.test.ts` parses the
 * CSS, compares it against these values, and fails when off-ramp literals grow.
 *
 * **What was wrong** (design-systems seat inventory, 2026-08-04). 167 content
 * icon call sites were spread across **9 px values** (10, 11, 12, 13, 14, 15, 16,
 * 17, plus an unspecified 24). That is drift, not role differentiation: two files
 * mixed four values within one surface (the workspace palette at 10/11/12/14 and
 * the dependency picker at 10/11/12/13), and a hands-on tester copying a sibling
 * component wrote *"Nothing told me a different value existed"* (nothing told me a
 * different value existed). The consumption channel is a numeric prop rather than
 * a className, which put it outside the range of the value lint.
 *
 * **How to choose — by the type sitting next to it, not by size.**
 *
 * - `sm` (12) — next to `text-label` (11) or `text-body` (12.5). The app default
 *   and the measured mode (77 sites).
 * - `md` (14) — next to `text-body-lg` (14).
 * - `lg` (16) — next to `text-title` (16), or a standalone icon.
 *
 * Chrome and rail icons are not covered by this ramp; their own surface contracts
 * own them (`--topology-chrome-icon-size`, `--chrome-icon`,
 * `--app-nav-rail-icon-size`). Neither is the `data-kind-glyph` kind marker —
 * that is a typed data mark, owned by `docs/DESIGN-SYSTEM.md` node spec (the
 * node spec).
 *
 * **2026-08-05: nobody was using this constant.** The paragraph above stated
 * that transcribed values always drift without a gate, and a gate was attached —
 * yet **production consumers were 0**. 216 sites hand-wrote the numbers `12`,
 * `14` and `16`, and the values merely happened to agree; in that state this file
 * guaranteed nothing, and changing a value here would not have moved the screen.
 *
 * **A token nobody uses is not a spec, it is wrong information**
 * (`.claude/rules/design.md`). So that round moved every lucide size prop onto
 * this constant — consumers are now **313 sites**, and this file is actually the
 * ramp.
 */
export const ICON_SIZE = {
  /** Next to label/body — the default. `--icon-sm`. */
  sm: 12,
  /** Next to body-lg. `--icon-md`. */
  md: 14,
  /** Next to title, or standalone. `--icon-lg`. */
  lg: 16,
} as const;

