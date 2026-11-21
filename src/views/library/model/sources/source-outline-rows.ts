import type { useTranslations } from "next-intl";

import type { SourceOutline } from "@/shared/lib/library/source-passage";
import type { SourceOutlineState } from "../../lib/sources/use-source-outline";

export interface OutlineRow {
  text: string;
  anchor?: string;
}

/**
 * Outline rows keep the reader's addresses: Markdown headings use line anchors, DOCX headings `h:`.
 * A format the reader cannot describe says so rather than inventing counts. The count rides on the
 * section label, so the list holds pressable addresses only.
 */
export function outlineRows(
  outline: SourceOutline,
  t: ReturnType<typeof useTranslations<"library">>,
): { rows: OutlineRow[]; count: string | null } {
  const rows: OutlineRow[] = [];
  for (const sheet of outline.sheets) {
    rows.push({ text: t("source.outline.sheet", { sheet: sheet.sheet, rows: sheet.rows }) });
  }
  for (const heading of outline.headings) {
    rows.push({ text: heading.title, anchor: heading.anchor });
  }
  const paragraphs = outline.unitCount - outline.headings.length;
  const count =
    outline.format === "docx" && paragraphs > 0
      ? t("source.outline.paragraphs", { count: paragraphs })
      : outline.format === "csv"
        ? t("source.outline.records", { count: outline.unitCount })
        : null;
  return { rows, count };
}

/**
 * The rows once, so the section's marker, its sentence and its list cannot disagree: a format whose
 * shape this reader cannot describe prints the sentence and no list, whether it yielded no units at
 * all (PDF) or its units carry no structure worth listing (Markdown, text, HTML).
 */
export function outlineSummary(
  outline: SourceOutlineState,
  t: ReturnType<typeof useTranslations<"library">>,
): { rows: OutlineRow[]; count: string | null; unreadable: boolean } {
  if (outline.phase !== "ready" || !outline.outline) return { rows: [], count: null, unreadable: false };
  const { rows, count } = outlineRows(outline.outline, t);
  return { rows, count, unreadable: rows.length === 0 && count === null };
}
