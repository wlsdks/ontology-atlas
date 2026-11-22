import type { useTranslations } from "next-intl";

import type {
  WikiIndexEntry,
  WikiIndexGroupKey,
  WikiIndexItem,
  WikiIndexReason,
} from "../../lib/wiki/wiki-index";
import { wikiDayText } from "./wiki-day-text";

type Translate = ReturnType<typeof useTranslations<"library">>;
/** `t` is typed against the catalogue, and a rule code is data the validator chooses. */
type RulePath = "report.rule.uncited-fact";

export function groupLabel(key: WikiIndexGroupKey, t: Translate): string {
  return key.startsWith("folder:") ? `${key.slice("folder:".length)}/` : t(`wikiIndex.group.${key as "attention"}`);
}

function reasonText(reason: WikiIndexReason, t: Translate): string {
  if (reason.kind !== "rule") return t(`wikiIndex.reason.${reason.kind}`);
  const path = `report.rule.${reason.code}` as RulePath;
  return t.has(path) ? t(path) : reason.code;
}

function provenance(entry: WikiIndexEntry, t: Translate): string {
  const sources = entry.page.sourcePaths;
  if (sources.length === 0) return t("wikiIndex.row.noSource");
  if (sources.length > 1) return t("wikiIndex.row.sources", { count: sources.length });
  return sources[0]!.slice(sources[0]!.lastIndexOf("/") + 1);
}

/** What one page row says: why it needs a look, where it came from, when it was written. */
export function wikiRowText({ entry, group, nowMs, locale, t }: {
  entry: WikiIndexEntry;
  group: WikiIndexGroupKey;
  nowMs: number;
  locale: string;
  t: Translate;
}): { needsLook: boolean; detail: string; date: string | null; label: string } {
  const reasons = entry.reasons.map((reason) => reasonText(reason, t));
  const detail = group === "attention"
    ? reasons.length > 1 ? t("wikiIndex.row.moreReasons", { reason: reasons[0]!, count: reasons.length - 1 }) : reasons[0]!
    : provenance(entry, t);
  const date = wikiDayText(entry.writtenAtMs, nowMs, locale, t);
  const label = [entry.title, entry.page.summary, reasons.join(", "), provenance(entry, t), date].filter(Boolean).join(" · ");
  return { needsLook: reasons.length > 0, detail, date, label };
}

export function itemKey(item: WikiIndexItem): string {
  return item.type === "row" ? `${item.group}\u0000${item.entry.page.slug}` : `${item.type}\u0000${item.group}`;
}

/** The arrival step by kind of group, so a group appearing late never shifts the others' delays. */
export function arrivalStep(group: WikiIndexGroupKey): number {
  if (group === "attention") return 0;
  if (group === "answers") return 1;
  return group.startsWith("folder:") ? 2 : 3;
}
