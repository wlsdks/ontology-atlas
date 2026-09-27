import type { useTranslations } from 'next-intl';

import { passageLabelFor, type PassageLabel } from '@/shared/lib/source-passage';

type Translate = ReturnType<typeof useTranslations<'library'>>;

/**
 * The place an anchor names, in words, no finer than the extractor knows: a DOCX heading is
 * not a line, and a workbook row names its sheet. Shared by the pane, search captions and
 * page citations so they say one thing one way.
 */
export function passageLabelText(label: PassageLabel, anchor: string, t: Translate): string {
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

interface SourceCitationWords {
  /** What the citation shows: the place, preceded by the file's name when it is needed. */
  text: string;
  /** The place alone, or `null` for a citation of a whole file. Accessible names carry it. */
  place: string | null;
}

/** Words for a label-less `[[src:…]]` citation, from the anchor alone; `nameFile` drops a name the header already shows. */
export function sourceCitationWords(
  citation: { path: string; anchor?: string },
  { nameFile }: { nameFile: boolean },
  t: Translate,
): SourceCitationWords {
  const file = citation.path.split('/').pop() || citation.path;
  if (!citation.anchor) return { text: file, place: null };
  const place = passageLabelText(passageLabelFor(citation.anchor, []), citation.anchor, t);
  return { text: nameFile ? `${file} · ${place}` : place, place };
}
