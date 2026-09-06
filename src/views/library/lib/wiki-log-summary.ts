/**
 * The wiki log keeps its summaries in one machine form — `disagreement 0 · superseded 2`,
 * `a, b (new)`, `ran; counts not stated` — so `grep` reads the same words in every vault.
 * The Library header is where a person reads them, in the screen's language (installed
 * app, 2026-09-07: a Korean header said "ran; counts not stated").
 */
export type LogSummaryTranslator = (key: string, values?: Record<string, string | number>) => string;

const COUNT_KEYS: Record<string, string> = {
  disagreement: "wiki.logCount.disagreement",
  superseded: "wiki.logCount.superseded",
  "missing-link": "wiki.logCount.missingLink",
  "name-without-page": "wiki.logCount.nameWithoutPage",
};

export function localizeWikiLogSummary(summary: string, t: LogSummaryTranslator): string {
  const trimmed = summary.trim();
  if (trimmed === "ran; counts not stated") return t("wiki.logNoCounts");
  const parts = trimmed.split(" · ");
  if (parts.every((part) => /^[a-z-]+ \d+$/.test(part))) {
    return parts
      .map((part) => {
        const [key, count] = part.split(" ");
        const messageKey = COUNT_KEYS[key];
        return messageKey ? t(messageKey, { count: Number(count) }) : part;
      })
      .join(" · ");
  }
  return trimmed
    .replace(/\(new\)/g, `(${t("wiki.logNew")})`)
    .replace(/\(revised\)/g, `(${t("wiki.logRevised")})`)
    .replace(/\bnothing new\b/g, t("wiki.logNothingNew"));
}
