/**
 * One share rule for the band, the rows and the panel: a floored percent, 100 only when every source
 * has a page, and "under 1%" above zero and under one percent.
 */
export interface SourceShare {
  percent: number;
  underOne: boolean;
}

export function sourceShare(withPage: number, total: number): SourceShare {
  if (total <= 0 || withPage <= 0) return { percent: 0, underOne: false };
  if (withPage >= total) return { percent: 100, underOne: false };
  return { percent: Math.floor((withPage * 100) / total), underOne: withPage * 100 < total };
}

/**
 * The share for a drawn fraction while a bar moves: floored, never 100 before the settled value is,
 * and "under 1%" only when the settled value says so.
 */
export function drawnSourceShare(drawn: number, settled: SourceShare): SourceShare {
  if (settled.underOne) return settled;
  const percent = Math.min(100, Math.floor(Math.max(0, drawn) * 100 + 1e-6));
  return { percent: percent === 100 && settled.percent !== 100 ? 99 : percent, underOne: false };
}

type ShareMessages = (key: "progress.underOne" | "progress.percent", values?: { percent: number }) => string;

export function formatSourceShare(share: SourceShare, t: ShareMessages): string {
  return share.underOne ? t("progress.underOne") : t("progress.percent", { percent: share.percent });
}
