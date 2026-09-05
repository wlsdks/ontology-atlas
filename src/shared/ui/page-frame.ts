/**
 * **The page frame for list-style destinations** — top padding, horizontal
 * inset, and max width as one unit.
 *
 * Owner, 2026-08-09: *"Insights, projects, skills all need the same top spacing …
 * Isn't there a design system? Why are they all different?"*
 * (three destinations should share the same top spacing — isn't there a design
 * system?)
 *
 * Measured at 1440×900, distance down to the title:
 *
 * |                      | top (lg)       | sides (lg)   | max width            |
 * |----------------------|----------------|--------------|----------------------|
 * | `/projects`          | 40px           | 40px         | 1600 (**JS const**)  |
 * | `/ontology/insights` | 32px           | 40px         | 1600 (**CSS token**) |
 * | `/agents`            | `PAGE_TOP_PAD` | `PAGE_X_PAD` | `--page-max`         |
 *
 * The same 1600 was written in two places, and the third screen picked its own
 * numbers; moving between routes made the title jump 16–28px vertically and 8px
 * horizontally.
 *
 * **The defect was a missing frame spec, not one wrong value.** Colour, type,
 * radius and elevation each have a ramp that lint enforces; the page frame had
 * no spec at all, so every screen chose for itself. That is why this file owns
 * the whole frame — pulling only the top padding into a token would leave the
 * next screen eyeballing the inset and the width again.
 *
 * **Zero new tokens.** Max width is the existing `--page-max` (1600); the rest
 * are regular Tailwind spacing steps. The 2026-07-26 conclusion that spacing is
 * *not* ramp-enforced still stands (of 27 hand-written px values, most were
 * optical corrections) — drift is stopped by having one definition site instead.
 *
 * **Why the page wears this and not the shell:** the canvas workbench
 * (`/topology`) and the editor (`/docs`) must have *no* top padding, and a shell
 * that pays it breaks both. Same reasoning as the 2026-08-07 verdict against
 * hoisting the bottom-tab reserve into the shell — the answer differs per surface.
 *
 * Membership test: **a screen that stands as an `mx-auto` document column inside
 * the shell's scroll slot, whose `h1` is that container's first content.**
 */

/**
 * Document column — horizontal inset, max width, top padding, and the desktop bottom breath.
 *
 * ⚠️ **The bottom was the one dimension this spec left out, and it drifted exactly as the other
 * three had** (measured 2026-09-05, four members):
 *
 * | member | bottom at ≥lg |
 * |---|---|
 * | `/ontology/insights` | `lg:pb-[var(--page-bottom-breath)]` (40) |
 * | `/projects` | `md:pb-10` (40, written as a literal) |
 * | `/agents` | **nothing** |
 * | `/mcp` | **nothing** |
 *
 * With a folder open, `/mcp`'s share tab is several screens tall, so the last card sat flush
 * against the bottom of the installed app's window. The `scroll-end-gap` gate did not catch it and
 * was not wrong to miss it: it opens these routes **with no folder**, and in that state they are
 * shorter than the viewport, so the whole measurement is skipped. A gate that cannot reach a state
 * cannot judge it, which is why the prescription is now also pinned in
 * `page-frame.contract.test.ts` — the two-layer split this file's own header describes.
 *
 * `lg:` and not a plain `pb-*` because **below `lg` the reservation is a different quantity**: the
 * bottom tab bar stands there, and how much a surface must reserve for it depends on the surface
 * (the 2026-08-07 verdict against hoisting that into the shell still holds). The page keeps paying
 * that half; this pays the half that has one answer everywhere.
 */
export const PAGE_FRAME =
  "mx-auto w-full max-w-[var(--page-max)] px-5 pt-6 md:px-10 md:pt-12 lg:pb-[var(--page-bottom-breath)]" as const;

/**
 * **Form / edit column** — same top padding, narrower width (2026-08-11).
 *
 * The first spec covered only list-style destinations, so the form screens
 * (`/project/new`, `/project/[slug]/edit`) fell outside it and picked their own
 * values: width 960, top 40. **Widening them to 1600 is not the fix** — input
 * rows stretched to 1600px are worse to read and worse to fill. The spec was
 * widened to *decide which width applies* rather than to force one, and this
 * file is the single definition site so no screen restates 960.
 *
 * ⚠️ **The top padding must match the list frame.** Titles jumping vertically
 * between routes is why this spec exists at all, and a different width is no
 * reason for a different title height. A gate locks that property (the three
 * constants must agree on top padding).
 *
 * 960 is not a CSS token because the form family is still its only consumer —
 * a value earns a name when a second consumer appears
 * (`.claude/rules/design.md`).
 *
 * ⚠️ **The bottom breath is not in this constant, and that is a deliberate hold** (2026-09-06).
 * When `/agents` and `/mcp` moved onto this column they brought the taller-than-viewport case with
 * them, and `scroll-end-gap` requires a framed page to reserve `--page-bottom-breath` at `lg`. The
 * right home for that is here, beside the list frame's own `lg:pb-…`, so the two frames would agree
 * on top spacing and bottom breath and differ only in the one thing they exist to differ in.
 *
 * It is not here yet because changing a value in this file is a **specification change**
 * (`.claude/rules/design.md`, the design-spec census) and therefore owes an appended
 * `docs/DECISIONS.md` record, which this round could not write. Until it does, the two screens pay
 * the breath in their own `className` — the axis they already own below `lg`, where the tab-bar
 * reserve genuinely differs per surface. `page-frame.contract.test.ts` holds every form member to
 * paying it exactly once, so the interim cannot drift the way the list frame's bottom once did.
 */
export const PAGE_FRAME_FORM =
  "mx-auto w-full max-w-[960px] px-5 pt-6 md:px-10 md:pt-12 lg:pb-[var(--page-bottom-breath)]" as const;

/**
 * **Stage column** — the narrow column stood in the middle of the screen when
 * there is nothing to open yet.
 *
 * Added 2026-08-12. Narrowing to a 960px column and grouping into a
 * card was not enough; the owner looked at the result and pushed back:
 * *"The right and bottom emptiness is severe — use a different approach, the way the assembly-bench entry does."* (the right and bottom emptiness is severe — use a different
 * approach, the way the assembly-bench entry does).
 *
 * Measured at 1512×900, ink box over leaf elements only:
 *
 * |                    | ink      | left / right | top / bottom |
 * |--------------------|----------|--------------|--------------|
 * | skills empty state | 1368×313 | 104 / 40     | 56 / **531** |
 * | assembly entry     | 482×318  | 489 / 541    | 291 / 291    |
 *
 * The assembly entry is **centred**; skills sat at the top and spread to the
 * walls. "Barren" is not about how much empty space there is — it is about
 * whether the content block is anchored to the screen.
 *
 * **No new value was invented** — 640 is what the assembly entry already used,
 * and it has now gained a second consumer (the repo's rule: a value earns a name
 * the moment something else needs it). Two screens point at one place.
 *
 * This constant sets **width only**. Centring belongs to the stage that contains
 * it (`flex-1` + `items-center justify-center`) — a column that centred itself
 * would carry that alignment into the scrolling list state too.
 */
export const PAGE_COLUMN_STAGE = "mx-auto w-full max-w-[640px]" as const;

/**
 * **Reading column for a list of rows inside a page-width card** (2026-09-05, design council).
 *
 * A connector row is a name, one command, a switch and one more-actions button. Measured on the
 * Connectors tab at 2560: the row box was 2,380px wide and its ink stopped at about 1,680, so
 * roughly **700px of every row was dead span** between what the row says on the left and what it
 * offers on the right — the eye crosses a third of the screen to answer "is this one on".
 *
 * It reuses `PAGE_FRAME_FORM`'s 960 rather than inventing a width: the reason is the same one
 * recorded there (a row you read across and act on at the end is worse the wider it gets), and a
 * value earns a second name only when the roles differ. The frame keeps owning the page; this
 * owns the column of rows inside it.
 */
export const PAGE_COLUMN_FORM = "mx-auto w-full max-w-[960px]" as const;

/**
 * **Which frame a screen wears** (owner, 2026-09-06).
 *
 * > *"Agents and MCP should use the 960 centred column like the project editor, not the 1600
 * > one — title, lede, tabs and cards inside that column."*
 *
 * The rule the instruction generalises to, so the next screen does not ask again:
 *
 * | The screen is | Frame | Why |
 * |---|---|---|
 * | text and settings — you read sentences and act on rows | `PAGE_FRAME_FORM` (960) | A row you read across and act on at the end gets worse the wider it is. Measured on `/mcp` at 2560: 700px of every connector row was dead span between the name on the left and the switch on the right |
 * | a canvas — a map, a graph, a diagram | `--page-max` (1600) via `PAGE_FRAME`, or no frame at all | The drawing uses the width. A cap on a canvas is a cap on how much of the ontology fits on screen |
 * | a list of many short cards | `PAGE_FRAME` (1600) | Cards tile across the width; nothing is read left to right |
 *
 * The test is not "how much data is there" but **which direction the eye travels**. Both halves
 * are gated: `page-frame.contract.test.ts` pins each screen's membership, and the same rule is
 * recorded in `docs/DESIGN-SYSTEM.md` for the reader who arrives from the design system rather
 * than from this file.
 */

/**
 * **There are three columns, and this file does not own the third**
 * (2026-08-11 verdict).
 *
 * An audit measured the docs surface (`/docs`) at a 760px column with 247px of
 * top padding, unlike the destinations. The decision is **change nothing**;
 * the reason is recorded here so the next audit does not relitigate it:
 *
 * | column                  | width                 | owned by          |
 * |-------------------------|-----------------------|-------------------|
 * | list destinations       | `--page-max` (1600)   | `PAGE_FRAME`      |
 * | form / edit             | 960                   | `PAGE_FRAME_FORM` |
 * | **reading (docs body)** | **`max-w-3xl` (768)** | **docs itself**   |
 *
 * Docs is a three-pane workbench (tree · body · panel), and its body is not a
 * page but a reading measure inside a scroll pane. The top of this file already
 * excludes canvas, editor and stage surfaces from the frame, and docs is that
 * editor: applying the page frame would insert 48px exactly where the tree and
 * the body have to start at the same height.
 *
 * And 768 is not eyeballed — it is a reading measure (Tailwind `3xl`), not a
 * hand-written px, so it is not drift either. Gate:
 * `page-frame.contract.test.ts`.
 */

/**
 * Top padding only — for a screen that must own its own horizontal inset.
 *
 * `/project/[slug]` has to feed `env(safe-area-inset-*)` into its side padding
 * (the installed app window's notch and rounded corners), so it cannot wear a
 * whole column constant and shares just the top padding instead. Measured drift:
 * this screen alone used `md:pt-14` (56), putting its title 8px below the other
 * destinations.
 */
export const PAGE_TOP_PAD = "pt-6 md:pt-12" as const;

/**
 * Header first row — the title and the inline count / primary control beside it
 * share a baseline.
 *
 * ⚠️ **Never let spacing depend on this row** (2026-08-09, a spec defect the
 * instrument caught). The first spec tried to place the title at 48px via
 * top 40px + `min-h-9` (36) + `items-end`. **Those 8px only exist while the
 * header fits on one line** — measured at 768px the insights header wrapped to
 * 62px, `items-end` then applied per line, the 8px disappeared, and titles split
 * again into 40 / 48 / 48.
 *
 * So the top padding pays the full 48px (`md:pt-12`). The title's y is now the
 * same however many lines the header takes and whether or not a button sits on
 * the right. A spec that depends on a layout accident is not a spec.
 */
export const PAGE_HEADER_ROW =
  "flex flex-wrap items-start justify-between gap-x-4 gap-y-2" as const;

/**
 * Title block — the inner row where `h1` and its inline count share a baseline.
 *
 * This is why the header is `items-start`. When the whole header was `items-end`
 * the **right-hand control's height decided the title's y** — measured at 1280px:
 * projects 56 (36px button) / insights 48 (no button) / skills 52 (32px button).
 * Same frame, three different results.
 *
 * Baseline alignment therefore moved down between the title and its inline
 * count, and the header aligns to the top. The title's y is now set by the
 * frame's top padding alone.
 */
export const PAGE_TITLE_ROW = "flex flex-wrap items-baseline gap-x-3 gap-y-1" as const;
