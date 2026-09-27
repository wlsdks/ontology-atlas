"use client";

import type { ReactNode, RefObject } from "react";

import { cn } from "@/shared/lib/cn";

import { OUTLINE_RAIL_LANE_CLASS } from "../lib/outline-rail";
import { useOutlineRailFit } from "../lib/use-outline-rail-fit";
import { BackToTopButton } from "./BackToTopButton";
import { DocReadingOutlineRail, type OutlineHeading } from "./DocReadingOutlineRail";

/**
 * One reading pane for Docs and the Library: a scroller with a centred measure, an outline in the
 * right margin, and back-to-top. The `relative` wrapper positions both overlays; the rail consumes
 * margin, never text width (`.claude/rules/design.md`). The scroller reserves the rail's lane on
 * its side (`lib/outline-rail.ts`).
 */
export interface DocReadingPaneProps {
  /**
   * The scroll container's ref, owned by the caller because the scroll spy and the
   * back-to-top threshold both subscribe to it and both are keyed by the caller's own
   * document identity.
   */
  scrollRef: RefObject<HTMLDivElement | null>;
  /**
   * The outline, or null when the caller decided there is none; whether the pane is wide enough is
   * answered here.
   */
  outline: {
    headings: OutlineHeading[];
    activeHeadingSlug: string | null;
    onHeadingClick: (slug: string) => void;
  } | null;
  /** The floating return, or null while the surface below is an editor. */
  backToTop: { visible: boolean; scrollToTop: () => void } | null;
  /** Extra classes for the scroll container — a caller's own bottom reserve, say. */
  scrollClassName?: string;
  children: ReactNode;
  "data-testid"?: string;
}

export function DocReadingPane({
  scrollRef,
  outline,
  backToTop,
  scrollClassName,
  children,
  "data-testid": testId = "doc-reading-pane",
}: DocReadingPaneProps) {
  const { paneRef, fit } = useOutlineRailFit();

  return (
    <div
      ref={paneRef}
      data-testid={testId}
      data-outline-fit={fit}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {/*
       * `fit` is measured on this element, so a dock beside the reader takes the rail away instead
       * of drawing it over the text.
       */}
      {outline && fit !== "hidden" ? (
        <DocReadingOutlineRail
          headings={outline.headings}
          activeHeadingSlug={outline.activeHeadingSlug}
          onHeadingClick={outline.onHeadingClick}
          fit={fit}
        />
      ) : null}
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto",
          /*
           * The scroll end reserves room for what covers it: the tab bar below lg, and the
           * back-to-top pill. The clearance token already includes the tab reserve, so one branch
           * picks one `pb` utility (two would conflict).
           */
          backToTop
            ? "pb-[var(--doc-reading-back-to-top-clearance)]"
            : "max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]",
          /* The rail's lane, reserved on the rail's own side so the centred column stops
             half a lane left of the pane's centre and the rail lands one gap past it. */
          outline && fit === "wide" ? OUTLINE_RAIL_LANE_CLASS.wide : null,
          outline && fit === "narrow" ? OUTLINE_RAIL_LANE_CLASS.narrow : null,
          scrollClassName,
        )}
      >
        {children}
      </div>
      {backToTop ? (
        <BackToTopButton visible={backToTop.visible} onClick={backToTop.scrollToTop} />
      ) : null}
    </div>
  );
}
