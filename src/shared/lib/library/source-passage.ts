import { headingSlug, sourceUnits, type SourceTextFormat, type SourceUnit } from './source-units';

/** Never more precise than the extractor: a DOCX heading anchor names a heading, not a line. */
export type PassageLabel =
  | { kind: 'line'; number: number }
  | { kind: 'record'; number: number }
  | { kind: 'heading'; title: string }
  | { kind: 'sheet-row'; sheet: string; row: number }
  | { kind: 'page'; number: number }
  | { kind: 'anchor' };

/** Up to this many units either side of the cited one, for orientation. */
const PASSAGE_CONTEXT_UNITS = 2;

export interface CitedPassage {
  path: string;
  anchor: string;
  format: SourceTextFormat;
  /**
   * `resolved`: the anchor named units and `cited` holds them. `unresolved`: the file no longer has
   * that address; `candidates` is non-empty only on a reported ambiguity. `no-text`: a format this
   * reader does not turn into text.
   */
  state: 'resolved' | 'unresolved' | 'no-text';
  /**
   * The cited units. More than one for a `h:<slug>` anchor, which the extractor assigns
   * to a heading *and* every paragraph beneath it — the section is the unit there.
   */
  cited: SourceUnit[];
  before: SourceUnit[];
  after: SourceUnit[];
  label: PassageLabel;
  unitCount: number;
  /** Anchors the extractor generated for a colliding heading, when this one collided. */
  candidates: string[];
  /** The extractor's own note about this file, unchanged. */
  note?: string;
}

/**
 * `l14` → line 14, `s1r3` → sheet 1 row 3, `h:records` → the heading it names. Shared so a search
 * hit's caption and the passage section name a place the same way.
 */
export function passageLabelFor(anchor: string, cited: readonly SourceUnit[]): PassageLabel {
  const first = cited[0];
  if (first?.kind === 'heading' || (first && anchor.startsWith('h:'))) {
    return { kind: 'heading', title: first.heading ?? first.text };
  }
  const sheetRow = /^s(\d+)r(\d+)$/.exec(anchor);
  if (sheetRow) {
    return {
      kind: 'sheet-row',
      sheet: first?.sheet ?? sheetRow[1]!,
      row: Number(sheetRow[2]),
    };
  }
  const line = /^l(\d+)$/.exec(anchor);
  if (line) return { kind: 'line', number: Number(line[1]) };
  const record = /^r(\d+)$/.exec(anchor);
  if (record) return { kind: 'record', number: Number(record[1]) };
  const page = /^p(\d+)$/.exec(anchor);
  if (page) return { kind: 'page', number: Number(page[1]) };
  return { kind: 'anchor' };
}

/** An unresolved anchor returns no text: the nearest paragraph to a renamed heading is not the cited one. */
export function citedPassage(
  bytes: Uint8Array,
  path: string,
  anchor: string,
  contextUnits: number = PASSAGE_CONTEXT_UNITS,
): CitedPassage {
  const { format, units, note } = sourceUnits(bytes, path);
  const base: CitedPassage = {
    path,
    anchor,
    format,
    state: 'unresolved',
    cited: [],
    before: [],
    after: [],
    label: passageLabelFor(anchor, []),
    unitCount: units.length,
    candidates: [],
    note,
  };
  if (units.length === 0) return { ...base, state: 'no-text' };

  const firstIndex = units.findIndex((unit) => unit.anchor === anchor);
  if (firstIndex < 0) {
    /*
     * Only the extractor's reported ambiguity offers alternatives, matched on this heading's own
     * slug rather than a prefix: `h:scope-2` may belong to a heading named "Scope 2".
     */
    const wantedSlug = anchor.startsWith('h:') ? anchor.slice(2) : '';
    const candidates =
      note && wantedSlug && note.includes(`${anchor} (`)
        ? units
            .filter(
              (unit) =>
                unit.kind === 'heading' &&
                unit.anchor !== anchor &&
                headingSlug(unit.text) === wantedSlug,
            )
            .map((unit) => unit.anchor)
        : [];
    return { ...base, candidates };
  }
  let lastIndex = firstIndex;
  while (lastIndex + 1 < units.length && units[lastIndex + 1]!.anchor === anchor) lastIndex += 1;
  const cited = units.slice(firstIndex, lastIndex + 1);
  return {
    ...base,
    state: 'resolved',
    cited,
    before: units.slice(Math.max(0, firstIndex - contextUnits), firstIndex),
    after: units.slice(lastIndex + 1, lastIndex + 1 + contextUnits),
    label: passageLabelFor(anchor, cited),
  };
}
