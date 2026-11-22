import { decodeUtf8, sourceUnits, type SourceTextFormat } from './source-units';

/**
 * What a document is made of, in the extractor's own kinds — the file's shape without
 * its contents.
 */
export interface SourceOutline {
  format: SourceTextFormat;
  /** Every unit the reader found, so a count is never a guess at one. */
  unitCount: number;
  /** Markdown headings keep their line anchors, so the outline and MCP citations address the same bytes. */
  headings: Array<{ anchor: string; title: string }>;
  /** Worksheets and how many rows each holds, in the workbook's own sheet order. */
  sheets: Array<{ sheet: string; rows: number }>;
  /**
   * True when this reader cannot describe the file's shape at all — a PDF, or any
   * format it has no text reader for. The screen says so rather than printing `0`,
   * which is a different and untrue fact.
   */
  unreadable: boolean;
  /** The extractor's own note about this file, unchanged. */
  note?: string;
}

/** Read the selected file's outline without persisting a converted copy.
 * A person can then request a heading's passage using its original citation anchor. */
export function sourceOutline(bytes: Uint8Array, path: string): SourceOutline {
  const { format, units, note } = sourceUnits(bytes, path);
  const headings = units
    .filter((unit) => unit.kind === 'heading')
    .map((unit) => ({ anchor: unit.anchor, title: unit.heading ?? unit.text }));
  if (/\.(?:md|markdown)$/i.test(path) && format === 'text') {
    const originalLines = decodeUtf8(bytes).split(/\r?\n/);
    let fence: { marker: string; length: number } | null = null;
    let frontmatter = units[0]?.anchor === 'l1' && units[0]?.text.trim() === '---';
    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index]!;
      const line = originalLines[Number(unit.anchor.slice(1)) - 1] ?? '';
      if (frontmatter) {
        if (index > 0 && /^(?:---|\.\.\.)\s*$/.test(line)) frontmatter = false;
        continue;
      }
      const fenced = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (fenced && fenced[1]![0] === fence.marker && fenced[1]!.length >= fence.length && !fenced[2]!.trim()) fence = null;
        continue;
      }
      if (fenced) {
        fence = { marker: fenced[1]![0]!, length: fenced[1]!.length };
        continue;
      }
      const atx = /^ {0,3}#{1,6}(?:[ \t]+(.*)|$)/.exec(line);
      if (atx) {
        const title = (atx[1] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
        if (title) headings.push({ anchor: unit.anchor, title });
        continue;
      }
      const previous = units[index - 1];
      if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) && previous &&
          Number(unit.anchor.slice(1)) === Number(previous.anchor.slice(1)) + 1 &&
          !/^(?: {4}|\t|\s*(?:#|>|[-*+]\s|`|~))/.test(originalLines[Number(previous.anchor.slice(1)) - 1] ?? '') &&
          !headings.some((heading) => heading.anchor === previous.anchor)) {
        headings.push({ anchor: previous.anchor, title: previous.text.trim() });
      }
    }
  }
  /* Insertion order is the sheet order `xlsxUnits` walked. */
  const rowsBySheet = new Map<string, number>();
  for (const unit of units) {
    if (unit.kind !== 'row' || !unit.sheet) continue;
    rowsBySheet.set(unit.sheet, (rowsBySheet.get(unit.sheet) ?? 0) + 1);
  }
  return {
    format,
    unitCount: units.length,
    headings,
    sheets: [...rowsBySheet].map(([sheet, rows]) => ({ sheet, rows })),
    unreadable: units.length === 0,
    note,
  };
}
