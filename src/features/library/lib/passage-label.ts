import type { useTranslations } from 'next-intl';

import { passageLabelFor, type PassageLabel } from '@/shared/lib/source-passage';

type Translate = ReturnType<typeof useTranslations<'library'>>;

/**
 * **The place an anchor names, in words — in the extractor's precision and no finer.**
 *
 * This lived inside `SourceSummary.tsx` while exactly one surface printed it. Slice U2
 * gave it a second consumer: a search hit's caption in the index column names the same
 * place as the passage section in the pane, and one wording in one column with another in
 * the other would be one fact in two voices. The citation inside a page's own body is the
 * third (2026-09-25), which is why it lives in the feature rather than in one view: the
 * document viewer that draws that body is a widget.
 *
 * The precision rule is the reason it is a function of `PassageLabel` rather than of the
 * raw anchor. A DOCX heading anchor is a heading, not a line — the extractor never
 * counted lines in that file, so "line 4" would send a person looking for something it
 * does not know. A workbook row says which sheet, because `s1r3` is row 3 of sheet 1 and
 * a person reading "row 3" in a two-sheet workbook has a 50% chance of the wrong one.
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

/**
 * **What a `[[src:…]]` citation says when its author wrote no `|label`** (2026-09-25).
 *
 * A compiled page cites `[[src:sources/budget.md#l5]]`, and the page body printed exactly
 * that — `src:sources/budget.md#l5` on every fact — because a wikilink without a label
 * shows its target, while the Source pane and the search captions a click away said
 * "line 5". The address is the file's and the agent's; a reader gets the place in words,
 * through `passageLabelText`, so the three surfaces say one thing one way.
 *
 * The anchor is read on its own, without opening the file: the body is drawn before any
 * source is read, and reading every cited file to name its places would make a page wait on
 * its sources. `passageLabelFor` with no units is exactly as precise as the address is —
 * `l5` is line 5 and `p3` page 3, while a heading anchor stays an address rather than a
 * guessed title.
 *
 * `nameFile` is the caller's: the file's name is left out only where the screen already
 * names that file beside the page — the page's one declared original in its header. On a
 * one-source page the name on every fact was the header's own words again; wherever the
 * reader could not tell which file a place belongs to, the citation names it.
 */
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
