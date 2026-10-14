"use client";

import { type ReactNode, type RefObject } from "react";
import type { useTranslations } from "next-intl";
import { BookOpen, HelpCircle, MoreHorizontal } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

type Translator = ReturnType<typeof useTranslations<"library">>;

/**
 * One `text-label` row above the folder graph where each clause is a press. Clauses are the header
 * row own children so wrapped lines share the caption edge; doors keep the right edge through
 * `ml-auto`. Below `lg` only the lead clause stays.
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
  /*
   * Two doors. The check report's door is the index's own row, which carries live state a strip chip
   * could not; the strip keeps the `N off-template` clause as the fact that presses into it.
   */
  id: "guide" | "questions";
  label: string;
  onPress: () => void;
  testId: string;
  /** True while the surface this door opens is up, for `aria-expanded`. */
  open?: boolean;
}

const DOOR_ICON: Record<LibraryHomeStripDoor["id"], typeof HelpCircle> = {
  guide: HelpCircle,
  questions: BookOpen,
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
          /*
           * At `lg` and up the sentence keeps its own width and the counts beside it give way, so a clause
           * never loses its tail. Only the lead clause's file name may truncate; the counts keep the whole
           * caption in their `title`.
           */
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-label leading-body text-[color:var(--color-text-secondary)] lg:flex-none lg:flex-nowrap"
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
                  clause.kind === "compile" ? "lg:max-w-[16rem]" : "lg:flex-none",
                )}
              >
                <span className="min-w-0 truncate">{clause.text}</span>
              </button>
            </span>
          ))}
        </p>
      ) : null}
      {/* The doors keep their words at every width they are drawn at; a tooltip title is not a label a
         finger can raise. Below `lg` the whole group folds into the `...` door. */}
      {/* One right-anchored group, not a margin on each door: the clauses keep the pane's text edge, and
         `ml-auto` on a single group holds the right edge even when the group takes a line of its own. */}
      <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1 lg:flex-none">
      <span className="flex flex-none items-center gap-1.5 max-lg:hidden">
        {doors.map((door) => {
          const Icon = DOOR_ICON[door.id];
          return (
            <button
              key={door.id}
              type="button"
              ref={door.id === "guide" ? guideAnchorRef : questionsAnchorRef}
              onClick={door.onPress}
              data-testid={door.testId}
              data-library-door={door.id}
              aria-expanded={door.open === undefined ? undefined : door.open}
              title={door.label}
              /*
               * An open door draws its open state with the `{shape:'chip', active:true}` compound, so a panel
               * floating over the graph is claimed by the control that opened it even when the pointer has moved
               * away.
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
          /* Below `lg` this is the only door, so it must say whether the list it owns is up. */
          active: overflowOpen,
          className: "flex-none lg:hidden",
        })}
      >
        <MoreHorizontal size={ICON_SIZE.sm} aria-hidden />
      </button>
      {trailing}
      </span>
    </>
  );
}
