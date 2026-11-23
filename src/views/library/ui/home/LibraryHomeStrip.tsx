"use client";

import { type ReactNode, type RefObject } from "react";
import type { useTranslations } from "next-intl";
import { BookOpen, HelpCircle, MoreHorizontal } from "lucide-react";

import { ChromeChip } from "@/shared/ui";
import type { LibraryHomeStripDoor } from "../../model/home/library-home-strip";

type Translator = ReturnType<typeof useTranslations<"library">>;

const DOOR_ICON = {
  guide: HelpCircle,
  questions: BookOpen,
} as const;

/**
 * How to use, Questions and Conversation (and the updated answer's review while one waits) as 36px
 * chrome chips at the page header's end. Each stays in place while its surface is open, selected, and
 * a second press closes it. Below `lg` they fold into one More door, whose list holds the same entries.
 */
export function LibraryHomeStrip({
  doors,
  conversation,
  review,
  overflowOpen,
  onToggleOverflow,
  guideAnchorRef,
  questionsAnchorRef,
  overflowAnchorRef,
  t,
}: {
  /** How to use and Questions; their popovers hang from these chips. */
  doors: readonly LibraryHomeStripDoor[];
  /** The conversation door, which carries a running turn's phase; null where no agent can talk. */
  conversation: ReactNode;
  /** The updated answer's review, while a proposal waits. */
  review: ReactNode;
  overflowOpen: boolean;
  onToggleOverflow: () => void;
  /**
   * The controls a popup hangs from, so it can read their rect and hand focus back. One prop per
   * anchor: a ref reached through a descriptor reads to `react-hooks/refs` as a value touched in render.
   */
  guideAnchorRef: RefObject<HTMLButtonElement | null>;
  questionsAnchorRef: RefObject<HTMLButtonElement | null>;
  overflowAnchorRef: RefObject<HTMLButtonElement | null>;
  t: Translator;
}) {
  return (
    <span data-testid="library-doors" className="flex min-w-0 items-center gap-2">
      <span className="flex min-w-0 items-center gap-2 max-lg:hidden">
        {/* First, so the doors that are always there keep their place when it comes and goes. */}
        {review}
        {doors.map((door) => {
          const Icon = DOOR_ICON[door.id as keyof typeof DOOR_ICON];
          return (
            <ChromeChip
              key={door.id}
              ref={door.id === "guide" ? guideAnchorRef : questionsAnchorRef}
              onClick={door.onPress}
              data-testid={door.testId}
              data-library-door={door.id}
              aria-expanded={door.open === undefined ? undefined : door.open}
              title={door.tooltip ?? door.label}
              active={door.open === true}
              icon={Icon ? <Icon aria-hidden /> : undefined}
              className="min-w-0 max-w-[14rem] flex-none shadow-none"
            >
              {door.label}
            </ChromeChip>
          );
        })}
        {conversation}
      </span>
      <ChromeChip
        ref={overflowAnchorRef}
        onClick={onToggleOverflow}
        data-testid="library-home-overflow"
        data-library-door="overflow"
        aria-expanded={overflowOpen}
        title={t("home.more")}
        aria-label={t("home.more")}
        active={overflowOpen}
        compact
        icon={<MoreHorizontal aria-hidden />}
        className="flex-none shadow-none lg:hidden"
      />
    </span>
  );
}
