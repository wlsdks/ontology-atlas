"use client";

import { type ReactNode, type RefObject } from "react";
import type { useTranslations } from "next-intl";
import { BookOpen, HelpCircle, MoreHorizontal, Stethoscope } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

type Translator = ReturnType<typeof useTranslations<"library">>;

/**
 * **The strip is the stage's heir** — one `text-label` row above the folder's graph.
 *
 * The home is the picture (`docs/DECISIONS.md`, 2026-09-06 "The Library pane is the
 * graph; the shelf is a popup"; restored 2026-09-12 after the owner read the always-drawn
 * three-step stage as a first-run screen that never leaves). Everything those three cards
 * said is here, and the difference from the strip they replace is that **each clause is a
 * press**:
 *
 * | Fact | Clause | Press |
 * |---|---|---|
 * | Compile is next, and on which file | `Compile next: <source>` — the one accent clause | the Compile popover, hung from the clause |
 * | a citation the folder can no longer vouch for | `1 source changed` | ink-ramps the canvas onto that citation and its two ends — **no mark moves** (2026-09-08) |
 * | pages that miss the wiki's shape | `2 off-template` | the check report |
 *
 * The counts (`6 sources · 4 pages · 6 cites`) are **not** here: they are the canvas's own
 * caption, and this component is what `LibraryGraph`'s `headerEnd` slot puts **beside** it
 * on that one row. One row, one voice — the landing used to carry three header rows saying
 * overlapping halves of this.
 *
 * ## One text edge per column
 *
 * The pieces below are the header row's own children, not a right-anchored box inside it,
 * and that is the whole of how the edge holds (owner, 2026-09-12, against the rule slice A1
 * installed). Measured before: at 1512 the caption began at the pane's text edge, x=384,
 * and the wrapped clause line at **x=620**, because an `ml-auto … justify-end` wrapper
 * pulled it right. Now the clauses flow after the caption where they fit — 1512: caption
 * 384, clauses 664, one line — and wrap to **exactly** the caption's edge where they do not
 * — 1040 and 390: 384/384 and 20/20. The doors keep the right edge through `ml-auto` on
 * their own group, which is exact at every width (1512: tail right 1472 against a content
 * right of 1472).
 *
 * ## Why the clauses are `shape: "link"` and the doors are chips
 *
 * A clause is a sentence about the folder that happens to be pressable; a door is a place.
 * Drawing both as chips made four boxes in a row where two of them were prose (the
 * "floating-box soup" `docs/DESIGN-SYSTEM.md` names), and drawing both as text left the
 * doors indistinguishable from the status line they sat in. So the fact reads as a fact
 * and the place reads as a control, which is also the pair of grades the repository
 * already has for exactly this: `link`/`md` is `text-label`, the chrome label size the
 * chips carry too.
 *
 * ## Responsive
 *
 * The doors keep their words wherever they are drawn (see the note on the group below).
 * Below `lg` — where the index has folded and the pane is the whole row — only the lead
 * clause stays and the rest fold into one `…` door, because a row that wraps to three
 * lines is a header again. The clause line takes the caption's edge at every width it
 * wraps to.
 */
export interface LibraryHomeStripClause {
  /** `compile` is the lead; the other two are plain. */
  kind: "compile" | "stale" | "offTemplate";
  text: string;
  onPress: () => void;
  /** Pressed state for the one clause that toggles rather than opens (`stale`). */
  pressed?: boolean;
  /** True while the popover this clause opens is up, for `aria-expanded`. */
  open?: boolean;
  testId: string;
}

export interface LibraryHomeStripDoor {
  id: "guide" | "questions" | "report";
  label: string;
  onPress: () => void;
  testId: string;
  /** True while the surface this door opens is up, for `aria-expanded`. */
  open?: boolean;
}

const DOOR_ICON: Record<LibraryHomeStripDoor["id"], typeof HelpCircle> = {
  guide: HelpCircle,
  questions: BookOpen,
  report: Stethoscope,
};

export function LibraryHomeStrip({
  clauses,
  doors,
  overflowOpen,
  onToggleOverflow,
  compileAnchorRef,
  guideAnchorRef,
  questionsAnchorRef,
  overflowAnchorRef,
  trailing,
  t,
}: {
  clauses: readonly LibraryHomeStripClause[];
  doors: readonly LibraryHomeStripDoor[];
  /** Whether the below-`lg` overflow list is up; the doors live inside it there. */
  overflowOpen: boolean;
  onToggleOverflow: () => void;
  /**
   * The controls that have a popup hanging from them, so the popup can read their rect
   * and hand focus back.
   *
   * One prop per anchor, and never a field on the descriptors above. Building the
   * descriptor array in the render body passes every field in it through a function call,
   * which is the `react-hooks/refs` hazard; and a ref reached through a member expression
   * (`anchors.overflow`) reads to that rule as a ref *value* being touched during render.
   * A plain identifier handed to `ref=` is the one spelling that is only ever attached.
   */
  compileAnchorRef: RefObject<HTMLButtonElement | null>;
  guideAnchorRef: RefObject<HTMLButtonElement | null>;
  questionsAnchorRef: RefObject<HTMLButtonElement | null>;
  overflowAnchorRef: RefObject<HTMLButtonElement | null>;
  /**
   * What hangs at the end of the row: the conversation chip, and the answer's review
   * button while a refreshed draft waits. Both already stood on this row, unchanged.
   */
  trailing: ReactNode;
  t: Translator;
}) {
  const lead = clauses.find((clause) => clause.kind === "compile") ?? clauses[0] ?? null;
  return (
    <>
      {clauses.length > 0 ? (
        <p
          data-testid="library-home-strip"
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-label leading-body text-[color:var(--color-text-secondary)]"
        >
          {clauses.map((clause, index) => (
            <span key={clause.kind} className="contents">
              {index > 0 ? (
                <span
                  aria-hidden
                  /* The separator belongs to the sentence, and below `lg` only the lead
                     clause is drawn, so its own dot must go with it. */
                  className={cn(
                    "flex-none text-[color:var(--color-text-quaternary)]",
                    clause !== lead && "max-lg:hidden",
                  )}
                >
                  ·
                </span>
              ) : null}
              <button
                type="button"
                ref={clause.kind === "compile" ? compileAnchorRef : undefined}
                onClick={clause.onPress}
                data-testid={clause.testId}
                aria-pressed={clause.pressed === undefined ? undefined : clause.pressed}
                aria-expanded={clause.open === undefined ? undefined : clause.open}
                className={cn(
                  controlClass({
                    shape: "link",
                    tone: clause.kind === "compile" ? "accent" : "secondary",
                    hoverInk: "strong",
                    active: clause.pressed === true || clause.open === true,
                    className: "min-w-0 max-w-full",
                  }),
                  clause !== lead && "max-lg:hidden",
                )}
              >
                <span className="min-w-0 truncate">{clause.text}</span>
              </button>
            </span>
          ))}
        </p>
      ) : null}
      {/*
        The doors, worded at every width they are drawn at.

        ⚠️ **`max-xl:sr-only` was here and is gone** (design-responsive, council
        2026-09-12). It dropped the three words to a `title` between `lg` and `xl` — a
        tooltip a finger never raises — so in that band the press that names the next step
        and the press that reopens the saved answer were two unlabeled 34px glyphs 6px
        apart, while `Conversation` beside them kept its word and proved the row had 71px
        spare. Measured: the header row was **92px** at 1024 and 1040 wordless against
        **84px** worded, because the worded group leaves the clause's line and shares
        `Conversation`'s — so the words were costing a line rather than buying one. Below
        `lg` the whole group folds into the `…` door instead, which is the fold that works.
      */}
      {/*
        `ml-auto` is what holds the right edge now that this component's children are the
        header row's own children (see `LibraryGraph`'s slot comment): the doors take the
        right end of whichever line they land on, and the clauses keep the pane's text edge.
      */}
      <span className="ml-auto flex flex-none items-center gap-1.5 max-lg:hidden">
        {doors.map((door) => {
          const Icon = DOOR_ICON[door.id];
          return (
            <button
              key={door.id}
              type="button"
              ref={door.id === "guide" ? guideAnchorRef : door.id === "questions" ? questionsAnchorRef : undefined}
              onClick={door.onPress}
              data-testid={door.testId}
              data-library-door={door.id}
              aria-expanded={door.open === undefined ? undefined : door.open}
              title={door.label}
              /*
               * ⚠️ **An open door draws its open state** (design-interaction, council
               * 2026-09-12). Measured on the captures: with the guide up, the door that
               * opened it drew a byte-identical fill `rgb(8,9,10)` and border
               * `rgb(22,23,24)` to its rest state — only its ink had moved, and that was
               * the `hover:` declaration with the pointer still parked on it. Move the
               * pointer away and a 560px panel floated over the graph with nothing on the
               * row claiming it, so the way out was guessed rather than seen. The
               * `{shape:'chip', active:true}` compound already exists for exactly this;
               * no new token, and the questions door at one saved answer is then the only
               * chip that can never light, because its press takes you somewhere.
               */
              className={controlClass({
                shape: "chip",
                tone: "muted",
                hoverInk: "strong",
                active: door.open === true,
                className: "flex-none gap-1.5",
              })}
            >
              <Icon size={ICON_SIZE.sm} aria-hidden />
              {/* The word. `title` above repeats it for the pointer and is the accessible
                  name when the group has folded away entirely. */}
              <span className="max-w-[12rem] truncate">{door.label}</span>
            </button>
          );
        })}
      </span>
      {/*
        Below `lg` the pane is the whole row and the index has folded, so four chips plus
        three clauses is a header again. One door holds the rest.
      */}
      <button
        type="button"
        ref={overflowAnchorRef}
        onClick={onToggleOverflow}
        data-testid="library-home-overflow"
        data-library-door="overflow"
        aria-expanded={overflowOpen}
        title={t("home.more")}
        aria-label={t("home.more")}
        className={controlClass({
          shape: "chip",
          tone: "muted",
          hoverInk: "strong",
          /* Below `lg` this is the only door, so it is the one that most needs to say
             whether the list it owns is up (design-interaction, council 2026-09-12) — and
             it is the one that carries the row's right anchor there, because the group
             above it is not drawn at that width. */
          active: overflowOpen,
          className: "ml-auto flex-none lg:hidden",
        })}
      >
        <MoreHorizontal size={ICON_SIZE.sm} aria-hidden />
      </button>
      {trailing}
    </>
  );
}
