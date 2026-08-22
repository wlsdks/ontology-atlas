/**
 * **The page frame for list-style destinations** — top padding, horizontal
 * inset, and max width as one unit.
 *
 * Owner, 2026-08-09: *"인사이트, 프로젝트, 스킬 모두 상단 공백이 동일해야하는데 …
 * 디자인 시스템 있는거 아녔나? 왜 다 다르지?"*
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

/** Document column — horizontal inset, max width, top padding. The bottom is entangled with the tab-bar reserve, so the page pays that. */
export const PAGE_FRAME =
  "mx-auto w-full max-w-[var(--page-max)] px-5 pt-6 md:px-10 md:pt-12" as const;

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
 */
export const PAGE_FRAME_FORM =
  "mx-auto w-full max-w-[960px] px-5 pt-6 md:px-10 md:pt-12" as const;

/**
 * **Width only** — for a slot already inside a page frame, where the padding is
 * already paid.
 *
 * Added 2026-08-12. The skills screen's **empty state** measured 1448px wide
 * (rightmost edge 1472) for 16 pieces of text, leaving **524px — 58% of the
 * screen — empty below.** Owner: *"스킬은 아무것도 없을때 너무 횡하고 뭔가 벽에
 * 다 딱 붙어있고 그런 느낌인데"* (with nothing in it the screen feels barren and
 * pinned to the walls).
 *
 * Insights and projects carry 48 and 80 items, so the same width was justified
 * there — the defect was using one width regardless of how much content exists.
 *
 * Same 960 as the form frame; do not restate it elsewhere (a value written in
 * two places starts drifting immediately — Carbon).
 */
export const PAGE_COLUMN_FORM = "mx-auto w-full max-w-[960px]" as const;

/**
 * **Stage column** — the narrow column stood in the middle of the screen when
 * there is nothing to open yet.
 *
 * Added 2026-08-12. Narrowing to `PAGE_COLUMN_FORM` (960) and grouping into a
 * card was not enough; the owner looked at the result and pushed back:
 * *"우측/하단 공백이 너무 심하고? 뭔가 다른 방안을 써야지? … 이렇게 조립대같은
 * 전략을 쓰던지"* (the right and bottom emptiness is severe — use a different
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
