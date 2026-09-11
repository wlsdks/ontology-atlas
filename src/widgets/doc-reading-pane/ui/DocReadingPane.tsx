"use client";

import type { ReactNode, RefObject } from "react";

import { cn } from "@/shared/lib/cn";

import { OUTLINE_RAIL_LANE_CLASS } from "../lib/outline-rail";
import { useOutlineRailFit } from "../lib/use-outline-rail-fit";
import { BackToTopButton } from "./BackToTopButton";
import { DocReadingOutlineRail, type OutlineHeading } from "./DocReadingOutlineRail";

/**
 * **One reading pane, two destinations.**
 *
 * Docs reads the ontology's own Markdown; the Library reads a wiki page compiled from
 * gathered sources. They are different documents with different sidebars beside them,
 * but the act of reading one is the same act: a scroll container holding a centred
 * measure, an outline in the right-hand margin, and a way back to the top.
 *
 * That shape lived inside `DocsVaultPage` until 2026-09-06 and moved here when the
 * Library became a destination of its own. Copying it would have meant two answers to
 * the outline's position, two scroll-end reserves, and — the reason the extraction was
 * not optional — two places to fix the overlap the dock caused.
 *
 * **The `relative` wrapper is load-bearing.** It is the positioning reference for both
 * the outline rail (absolute in the empty margin) and back-to-top (laid over, *outside*
 * the scroll container, so it holds its screen position while the body scrolls). The
 * body's own centred measure is unaffected: the rail consumes margin, never text width
 * (`.claude/rules/design.md`).
 *
 * ## The rail's lane is reserved, not borrowed from the centring (2026-09-12)
 *
 * The column used to centre in the whole pane, and the rail lived in whatever the centring
 * left on the right. That made the pane pay for the lane twice — once where the rail is and
 * once in its mirror image — so a wider reading measure took the rail away from a 1512 window
 * with no dock (`lib/outline-rail.ts` carries the arithmetic). The scroller now carries
 * `padding-right: gap + railWidth` while the rail is drawn, the column centres in what is
 * left, and the composition is `[gutter] [column] [gap] [rail] [gutter]` with both gutters
 * equal. Measured at 1512 (pane 1168): the left void falls from 334px to 153px and the
 * reading line grows from 500px to 629px.
 */
export interface DocReadingPaneProps {
  /**
   * The scroll container's ref, owned by the caller because the scroll spy and the
   * back-to-top threshold both subscribe to it and both are keyed by the caller's own
   * document identity.
   */
  scrollRef: RefObject<HTMLDivElement | null>;
  /**
   * The outline, or null when the caller has decided there is none to draw — while
   * editing, or on a document with too few headings (`shouldShowOutlineRail`). Whether
   * the pane is *wide enough* is not the caller's question and is answered here.
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
        This rail is the sole owner of the outline. The document-info inspector used to
        hold a second copy, which required a rule demoting the rail whenever it opened —
        removing that panel on 2026-07-28 removed the double exposure itself.

        `fit` is measured on this element rather than on the window, so a dock opening
        beside the reader takes the rail away instead of drawing it over the text.
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
           * **The scroll end owes room to whatever stands over it.**
           *
           * Two things can cover the last line of a document, and each is answered by
           * reserving, never by taking the cover away — a control a person cannot reach is
           * worse than a gap they never notice.
           *
           * ① Below `lg` the fixed bottom tab bar cut this container 17px short (measured
           *    identically at 768/834/600), hiding the last line at the end of the scroll.
           * ② The back-to-top pill is laid over this container, so at the end of the scroll
           *    it stops on top of whatever is under it. Owner report on the installed app,
           *    2026-09-08: at the foot of the Library's check results it covered the
           *    "N more names" fold chip. Measured the same day on the wiki reader, the last
           *    line ended 8px *below* the pill's top edge at 1400×860, 1200×800 and
           *    1040×720, and at 1040 — the app's window floor, where this pane is narrowest —
           *    60px of that line's width was behind the pill.
           *
           * The clearance token already contains the tab reserve below `lg` (it is derived
           * from the pill's own inset, which steps above the bar there), so when the pill is
           * drawn one utility answers both; when it is not — the Docs editor — ① is still owed.
           * Two `pb` utilities on one element would be a merge contest, which is why this is
           * a branch and not a pair.
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
