"use client";

import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { controlClass } from "@/shared/ui/control-class";
import { writeLibraryIndexSegment, type LibraryIndexSegment } from "@/shared/lib/preferences/library-preferences";

export function ListNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p
      data-testid={testId}
      className="px-3 pt-1 text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
    >
      {children}
    </p>
  );
}

/** A search whose matches all sit in the other list names where they are and switches there. */
export function OtherSegmentLink({
  count,
  segment,
  t,
}: {
  count: number;
  segment: LibraryIndexSegment;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <>
      {t("search.noneHere")}{" "}
      <button
        type="button"
        data-testid="library-search-other-half"
        onClick={() => writeLibraryIndexSegment(segment)}
        // Accent, not muted: in a quaternary caption a muted link reads as more caption, and this is the one way out of the dead end.
        className={controlClass({ shape: "link", size: "sm", tone: "accent", hoverInk: "strong", className: "atlas-touch-floor" })}
      >
        {t(segment === "wiki" ? "search.showPages" : "search.showSources", { count })}
      </button>
    </>
  );
}
