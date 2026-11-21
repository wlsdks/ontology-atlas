import { useCallback, useState, type RefObject } from "react";

import type { LibrarySelection } from "../library-selection";
import type { ReaderLanding } from "./reader-landing";

export interface TrailStop {
  slug: string;
  title: string;
  /** The scroll position the page was left at, so Back returns to it. */
  top: number;
}

/** The pages a link press left, valid only while the page `at` is the one open. */
export interface ReaderTrail {
  at: string | null;
  stack: TrailStop[];
}

const NO_STOPS: TrailStop[] = [];

/** The stops Back can return to: the trail counts only while the page it leads from is open. */
export function activeTrailStops(trail: ReaderTrail, selected: LibrarySelection): TrailStop[] {
  return selected?.kind === "wiki" && trail.at === selected.slug ? trail.stack : NO_STOPS;
}

/** The trail after a link press opens `slug` from the page `from`; unchanged when no page was open. */
export function trailAfterOpening(
  stops: readonly TrailStop[],
  from: { slug: string; title: string } | null,
  top: number,
  slug: string,
): ReaderTrail | null {
  return from ? { at: slug, stack: [...stops, { slug: from.slug, title: from.title, top }] } : null;
}

/** The trail and landing after Back; null when there is nowhere to go back to. */
export function trailAfterBack(stops: readonly TrailStop[]): { trail: ReaderTrail; landing: ReaderLanding } | null {
  const last = stops[stops.length - 1];
  if (!last) return null;
  return { trail: { at: last.slug, stack: stops.slice(0, -1) }, landing: { slug: last.slug, top: last.top } };
}

/** Link presses between wiki pages and the Back that retraces them, each page keeping its scroll. */
export function useReaderTrail({ selected, openPage, articleScrollRef, landingRef, choose }: {
  selected: LibrarySelection;
  /** The open page, or null when the selection is not a wiki page. */
  openPage: { slug: string; title: string } | null;
  articleScrollRef: RefObject<HTMLElement | null>;
  landingRef: RefObject<ReaderLanding | null>;
  choose: (next: LibrarySelection) => void;
}) {
  const [trail, setTrail] = useState<ReaderTrail>({ at: null, stack: [] });
  const activeTrail = activeTrailStops(trail, selected);
  const openLinkedPage = useCallback((slug: string) => {
    const next = trailAfterOpening(activeTrail, openPage, articleScrollRef.current?.scrollTop ?? 0, slug);
    if (next) setTrail(next);
    choose({ kind: "wiki", slug });
  }, [activeTrail, articleScrollRef, choose, openPage]);
  const backAlongTrail = () => {
    const back = trailAfterBack(activeTrail);
    if (!back) return;
    setTrail(back.trail);
    landingRef.current = back.landing;
    choose({ kind: "wiki", slug: back.landing.slug });
  };
  return { activeTrail, openLinkedPage, backAlongTrail };
}
