import {
  attributePair,
  between,
  decodeXmlText,
  elementSpans,
  openTags,
  rowCells,
  sheetRows,
  textOf,
  withoutElements,
} from './source-markup-scan';
import { readZipEntries } from './source-zip';

/**
 * TypeScript twin of `mcp/src/library/source-text.mjs`; anchors and unit text must match byte for byte
 * (`source-passage-parity.contract.test.ts`). Not copied: `node:zlib`, and the answer window
 * (nothing leaves the machine here). Nothing is stored.
 */

/** Units returned at most per call; `from` pages past it. Mirrors the MCP module. */
export const READ_SOURCE_DEFAULT_LIMIT = 200;
export const READ_SOURCE_MAX_LIMIT = 1000;
/** Characters of text returned at most per call, whatever the unit count. */
export const READ_SOURCE_MAX_CHARS = 60_000;

type SourceUnitKind = 'line' | 'row' | 'heading' | 'paragraph';

export interface SourceUnit {
  /** The address a citation writes after `#`. */
  anchor: string;
  text: string;
  kind: SourceUnitKind;
  /** The heading a DOCX paragraph sits under, heading units included. */
  heading?: string;
  /** The worksheet an XLSX row came from, by its own name. */
  sheet?: string;
}

export type SourceTextFormat = 'docx' | 'xlsx' | 'csv' | 'text' | 'html' | 'pdf' | 'binary';

export interface SourceTextAnswer {
  path: string;
  format: SourceTextFormat;
  unitCount: number;
  from: number;
  units: SourceUnit[];
  truncated: boolean;
  next?: number;
  note?: string;
}

const utf8 = new TextDecoder('utf-8');

export function decodeUtf8(bytes: Uint8Array, start?: number, end?: number): string {
  return utf8.decode(start === undefined ? bytes : bytes.subarray(start, end));
}

/**
 * A heading title as the anchor names it. The anchor grammar allows `[a-z0-9-]` only, so
 * accented letters lose their marks and a heading with no Latin letters at all gets no
 * slug here; the caller numbers it instead.
 */
export function headingSlug(title: string): string {
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

interface DocxParagraph {
  text: string;
  kind: 'heading' | 'paragraph';
  base?: string;
}

/**
 * A DOCX: its paragraphs in order. A paragraph styled as a heading opens a section, and
 * every paragraph under it carries that heading's `h:<slug>` anchor. Paragraphs before
 * the first heading carry `p1`, the one page a short letter or note has.
 */
function parseDocx(bytes: Uint8Array): { units: SourceUnit[]; ambiguousAnchors: string[] } {
  const entries = readZipEntries(bytes);
  const document = entries.get('word/document.xml');
  if (!document) throw new Error('not a DOCX: word/document.xml is missing');
  const xml = decodeUtf8(document());
  const paragraphs: DocxParagraph[] = [];
  let headingCount = 0;
  for (const paragraph of elementSpans(xml, 'w:p')) {
    // Runs keep their order; tabs and breaks become spaces so words do not fuse.
    const text = textOf(
      paragraph
        .replace(/<w:tab\/>/g, ' ')
        .replace(/<w:br\b[^<>]*\/>/g, ' ')
        .replace(/<w:t\b[^<>]*>/g, '<w:t>'),
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const style =
      openTags(paragraph, 'w:pStyle')
        .map((tag) => /w:val="([^"]+)"/.exec(tag)?.[1])
        .find(Boolean) ?? '';
    if (/^(heading|title)\d*$/i.test(style) || /^(제목|見出し)\d*$/.test(style)) {
      headingCount += 1;
      paragraphs.push({
        text,
        kind: 'heading',
        base: `h:${headingSlug(text) || `heading-${headingCount}`}`,
      });
      continue;
    }
    paragraphs.push({ text, kind: 'paragraph' });
  }

  const baseCounts = new Map<string, number>();
  for (const paragraph of paragraphs) {
    if (paragraph.kind !== 'heading' || !paragraph.base) continue;
    baseCounts.set(paragraph.base, (baseCounts.get(paragraph.base) ?? 0) + 1);
  }
  // Reserve every natural base before allocating duplicate suffixes. This keeps a
  // unique heading such as `Scope 2` at h:scope-2 even when h:scope is repeated.
  const reservedBases = new Set(baseCounts.keys());
  const usedAnchors = new Set<string>();
  const nextSuffixByBase = new Map<string, number>();
  const ambiguousAnchors = [...baseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([base, count]) => `${base} (${count} occurrences)`);

  const units: SourceUnit[] = [];
  let anchor = 'p1';
  let heading: string | undefined;
  for (const paragraph of paragraphs) {
    if (paragraph.kind === 'heading' && paragraph.base) {
      heading = paragraph.text;
      if (baseCounts.get(paragraph.base) === 1) {
        anchor = paragraph.base;
      } else {
        let suffix = nextSuffixByBase.get(paragraph.base) ?? 1;
        let generated: string;
        do {
          generated = `${paragraph.base}-${suffix}`;
          suffix += 1;
        } while (reservedBases.has(generated) || usedAnchors.has(generated));
        nextSuffixByBase.set(paragraph.base, suffix);
        anchor = generated;
      }
      usedAnchors.add(anchor);
      units.push({ anchor, heading, text: paragraph.text, kind: 'heading' });
      continue;
    }
    units.push({ anchor, heading, text: paragraph.text, kind: 'paragraph' });
  }
  return { units, ambiguousAnchors };
}

/**
 * An XLSX: every sheet's rows, `s<n>r<m>` where `n` counts sheets in workbook order and
 * `m` is the row's own number in the sheet. Cells are joined with ` | ` so a row reads
 * as one line; shared strings are resolved, formulas give their cached value.
 */
function xlsxUnits(bytes: Uint8Array, { sheet }: { sheet?: number } = {}): SourceUnit[] {
  const entries = readZipEntries(bytes);
  const workbook = entries.get('xl/workbook.xml');
  if (!workbook) throw new Error('not an XLSX: xl/workbook.xml is missing');
  const sheets = openTags(decodeUtf8(workbook()), 'sheet')
    .map((tag) => attributePair(tag, 'name', 'r:id'))
    .filter((pair): pair is [string, string] => pair !== null)
    .map(([name, rid], index) => ({ index: index + 1, name: decodeXmlText(name), rid }));
  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  const rels = relsEntry ? decodeUtf8(relsEntry()) : '';
  const targetByRid = new Map(
    openTags(rels, 'Relationship')
      .map((tag) => attributePair(tag, 'Id', 'Target'))
      .filter((pair): pair is [string, string] => pair !== null),
  );
  const shared: string[] = [];
  const sharedEntry = entries.get('xl/sharedStrings.xml');
  const sharedXml = sharedEntry ? decodeUtf8(sharedEntry()) : undefined;
  if (sharedXml) {
    for (const item of between(sharedXml, '<si>', '</si>')) shared.push(textOf(item));
  }
  const units: SourceUnit[] = [];
  for (const meta of sheets) {
    if (sheet !== undefined && meta.index !== sheet) continue;
    const target = (targetByRid.get(meta.rid) ?? `worksheets/sheet${meta.index}.xml`).replace(
      /^\/?(xl\/)?/,
      '',
    );
    const sheetEntry = entries.get(`xl/${target}`);
    if (!sheetEntry) continue;
    const sheetXml = decodeUtf8(sheetEntry());
    for (const row of sheetRows(sheetXml)) {
      const cells: string[] = [];
      for (const { attrs, body } of rowCells(row.body)) {
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        let value = '';
        if (type === 's') {
          const index = Number.parseInt(textOf(between(body, '<v>', '</v>')[0] ?? ''), 10);
          value = shared[index] ?? '';
        } else if (type === 'inlineStr') {
          value = textOf(between(body, '<is>', '</is>')[0] ?? '');
        } else {
          value = textOf(between(body, '<v>', '</v>')[0] ?? '');
        }
        cells.push(value.replace(/\s+/g, ' ').trim());
      }
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      const text = cells.join(' | ').trim();
      if (!text) continue;
      units.push({ anchor: `s${meta.index}r${row.number}`, sheet: meta.name, text, kind: 'row' });
    }
  }
  return units;
}

/**
 * A CSV or TSV: one unit per non-empty record, with `r<n>` naming its physical
 * starting line. This is a quote-aware boundary scan rather than a full CSV
 * validator: a malformed unclosed quote retains the rest of the source as one
 * record so text is never silently discarded.
 */
function tableUnits(
  text: string,
  delimiter = ',',
): { units: SourceUnit[]; unclosedQuoteStartLine?: number } {
  const source = String(text).replace(/^﻿/, '');
  const units: SourceUnit[] = [];
  let recordStart = 0;
  let recordStartLine = 1;
  let physicalLine = 1;
  let inQuotes = false;
  let atFieldStart = true;

  const pushRecord = (end: number) => {
    const record = source.slice(recordStart, end);
    if (record.trim()) units.push({ anchor: `r${recordStartLine}`, text: record, kind: 'row' });
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          index += 1;
        } else {
          inQuotes = false;
          atFieldStart = false;
        }
        continue;
      }
      if (character !== '\r' && character !== '\n') continue;
      const crlf = character === '\r' && source[index + 1] === '\n';
      physicalLine += 1;
      if (crlf) index += 1;
      continue;
    }

    if (character === '"' && atFieldStart) {
      inQuotes = true;
      continue;
    }
    if (character === delimiter) {
      atFieldStart = true;
      continue;
    }
    if (character !== '\r' && character !== '\n') {
      atFieldStart = false;
      continue;
    }

    const crlf = character === '\r' && source[index + 1] === '\n';
    physicalLine += 1;
    pushRecord(index);
    if (crlf) index += 1;
    recordStart = index + 1;
    recordStartLine = physicalLine;
    atFieldStart = true;
  }
  pushRecord(source.length);
  return { units, unclosedQuoteStartLine: inQuotes ? recordStartLine : undefined };
}

/** A text file: one unit per non-empty line, `l<n>` counting from the first line. */
function lineUnits(text: string): SourceUnit[] {
  return String(text)
    .split(/\r?\n/)
    .map((line, index) => ({ anchor: `l${index + 1}`, text: line.trim(), kind: 'line' as const }))
    .filter((unit) => unit.text);
}

/** An HTML file: tags dropped, then lines like a text file. */
function htmlUnits(html: string): SourceUnit[] {
  const text = decodeXmlText(
    withoutElements(withoutElements(String(html), 'script'), 'style')
      .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article|header|footer)\b[^<>]*>/gi, '\n')
      .replace(/<br\b[^<>]*\/?>/gi, '\n')
      .replace(/<[^<>]*>/g, ''),
  );
  return lineUnits(text);
}

const FORMAT_BY_EXTENSION: Record<string, SourceTextFormat> = {
  docx: 'docx',
  xlsx: 'xlsx',
  csv: 'csv',
  tsv: 'csv',
  txt: 'text',
  md: 'text',
  markdown: 'text',
  log: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',
  html: 'html',
  htm: 'html',
  pdf: 'pdf',
};

function sourceTextFormat(path: string): SourceTextFormat {
  const extension = String(path).toLowerCase().split('.').pop() ?? '';
  return FORMAT_BY_EXTENSION[extension] ?? 'binary';
}

interface SplitSource {
  format: SourceTextFormat;
  units: SourceUnit[];
  note?: string;
}

/** Every unit in the file, unwindowed — what the screen of the person who pressed needs. */
function splitSourceText(
  bytes: Uint8Array,
  path: string,
  options: { sheet?: number } = {},
): SplitSource {
  const extension = String(path).toLowerCase().split('.').pop() ?? '';
  const format = sourceTextFormat(path);
  let units: SourceUnit[];
  let note: string | undefined;
  switch (format) {
    case 'docx': {
      const parsed = parseDocx(bytes);
      units = parsed.units;
      if (parsed.ambiguousAnchors.length > 0) {
        note =
          `Ambiguous legacy DOCX heading addresses: ${parsed.ambiguousAnchors.join(', ')}. ` +
          'Duplicate headings use distinct generated anchors in the returned units; cite those anchors instead.';
      }
      break;
    }
    case 'xlsx':
      units = xlsxUnits(bytes, { sheet: options.sheet });
      break;
    case 'csv': {
      const parsed = tableUnits(decodeUtf8(bytes), extension === 'tsv' ? '\t' : ',');
      units = parsed.units;
      if (parsed.unclosedQuoteStartLine !== undefined) {
        note =
          `Unclosed quoted record begins at physical line r${parsed.unclosedQuoteStartLine}; ` +
          'its raw remainder was retained as one unit through EOF. This is not a full CSV/TSV validity check.';
      }
      break;
    }
    case 'text':
      units = lineUnits(decodeUtf8(bytes));
      break;
    case 'html':
      units = htmlUnits(decodeUtf8(bytes));
      break;
    case 'pdf':
      units = [];
      note =
        'A PDF is read natively by the agent runtime, page by page; cite `#p<n>` with the page number. This tool returns no text for it.';
      break;
    default:
      units = [];
      note = `No text reader for \`.${extension}\`. Cite the file by page (\`#p<n>\`) only when a person can find that page in it.`;
  }
  return { format, units, note };
}

/**
 * The MCP tool's windowed shape, so `source-passage-parity.contract.test.ts` can compare the two
 * readers answer for answer. The screen uses `citedPassage`.
 */
export function readSourceUnits(
  bytes: Uint8Array,
  path: string,
  options: { from?: number; limit?: number; sheet?: number } = {},
): SourceTextAnswer {
  const from = Math.max(1, Math.trunc(Number(options.from) || 1));
  const limit = Math.min(
    READ_SOURCE_MAX_LIMIT,
    Math.max(1, Math.trunc(Number(options.limit) || READ_SOURCE_DEFAULT_LIMIT)),
  );
  const { format, units, note } = splitSourceText(bytes, path, { sheet: options.sheet });
  const unitCount = units.length;
  const window = units.slice(from - 1, from - 1 + limit);
  const kept: SourceUnit[] = [];
  let chars = 0;
  for (const unit of window) {
    chars += unit.text.length;
    if (chars > READ_SOURCE_MAX_CHARS && kept.length > 0) break;
    kept.push(unit);
  }
  const truncated = from - 1 + kept.length < unitCount;
  const answer: SourceTextAnswer = { path, format, unitCount, from, units: kept, truncated };
  if (truncated) answer.next = from + kept.length;
  if (note) answer.note = note;
  return answer;
}

/** Unwindowed: the MCP window would report a phrase past it as no match. */
export function sourceUnits(
  bytes: Uint8Array,
  path: string,
): { format: SourceTextFormat; units: SourceUnit[]; note?: string } {
  return splitSourceText(bytes, path);
}
