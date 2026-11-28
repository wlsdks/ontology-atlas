import type { useTranslations } from "use-intl";

import { wikiIndexDay } from "../../lib/wiki/wiki-index";

/** A moment as the wiki list says it: Just now, Today, Yesterday, N days ago, or a short date. */
export function wikiDayText(
  writtenAtMs: number,
  nowMs: number,
  locale: string,
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  const day = wikiIndexDay(writtenAtMs, nowMs);
  if (!day) return null;
  if (day.kind === "ago") return t("wikiIndex.day.ago", { count: day.days });
  if (day.kind !== "date") return t(`wikiIndex.day.${day.kind}`);
  return new Date(day.ms).toLocaleDateString(locale, day.otherYear
    ? { year: "numeric", month: "short", day: "numeric" }
    : { month: "short", day: "numeric" });
}
