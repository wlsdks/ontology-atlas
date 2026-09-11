import type { useTranslations } from 'next-intl';

import type { PassageLabel } from '@/shared/lib/source-passage';

/**
 * **The place an anchor names, in words — in the extractor's precision and no finer.**
 *
 * This lived inside `SourceSummary.tsx` while exactly one surface printed it. Slice U2
 * gave it a second consumer: a search hit's caption in the index column names the same
 * place as the passage section in the pane, and one wording in one column with another in
 * the other would be one fact in two voices.
 *
 * The precision rule is the reason it is a function of `PassageLabel` rather than of the
 * raw anchor. A DOCX heading anchor is a heading, not a line — the extractor never
 * counted lines in that file, so "line 4" would send a person looking for something it
 * does not know. A workbook row says which sheet, because `s1r3` is row 3 of sheet 1 and
 * a person reading "row 3" in a two-sheet workbook has a 50% chance of the wrong one.
 */
export function passageLabelText(
  label: PassageLabel,
  anchor: string,
  t: ReturnType<typeof useTranslations<'library'>>,
): string {
  switch (label.kind) {
    case 'line':
      return t('source.passage.label.line', { number: label.number });
    case 'record':
      return t('source.passage.label.record', { number: label.number });
    case 'heading':
      return t('source.passage.label.heading', { title: label.title });
    case 'sheet-row':
      return t('source.passage.label.sheetRow', { sheet: label.sheet, row: label.row });
    case 'page':
      return t('source.passage.label.page', { number: label.number });
    default:
      return t('source.passage.label.anchor', { anchor });
  }
}
