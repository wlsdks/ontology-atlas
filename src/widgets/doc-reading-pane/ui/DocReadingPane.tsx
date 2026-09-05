"use client";

import type { ReactNode, RefObject } from "react";

import { cn } from "@/shared/lib/cn";

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
        // Scroll-end reserve below lg — this container's bottom cut 17px behind the fixed
        // tab bar (measured identically at 768/834/600), hiding the last line at the end
        // of the scroll. The tab bar reserve plus 12px is taken as inner padding of the
        // scroll content.
        className={cn(
          "min-h-0 flex-1 overflow-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]",
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
