import { inflateRaw } from './inflate-raw';

/**
 * **One raw source, cut into the units a citation can name — in the bundle this time.**
 *
 * `[[src:sources/settlement-policy.md#l14]]` is an address, and until now the only thing
 * that could resolve it was the MCP server: `mcp/src/source-text.mjs` reads the file and
 * returns its text already split into `l<n>` lines, `r<n>` records, `h:<slug>` document
 * headings and `s<i>r<n>` workbook rows. A person pressing that citation in the Library
 * got the file's card instead — path, format, size, sha256 — and had to leave the app,
 * open the document and count to line 14 to check the claim (measured 2026-09-11).
 *
 * This is that reader's TypeScript twin, for the same reason
 * `src/shared/lib/wiki-page-schema.ts` is `mcp/src/wiki-schema.mjs`'s twin: the MCP
 * package ships separately from the web bundle, so one physical module cannot serve both,
 * and `tests/contract/source-passage-parity.contract.test.ts` runs one fixture table
 * through the two of them. **The anchors and the unit text must match byte for byte** —
 * a reader shown a different passage than the one an agent cited is worse than a reader
 * shown nothing, because it looks like an answer.
 *
 * Three things are deliberately *not* copied from the MCP module:
 *
 * - `node:zlib`. A DOCX and an XLSX are zips of XML; `inflate-raw.ts` carries the
 *   decompressor the bundle needs and its header says why not the platform's.
 * - The 200-unit / 60,000-character window. That bound exists because the tool's answer
 *   leaves the machine on the next round trip; this reader hands the text to the screen
 *   of the person who pressed the citation, and nothing leaves. `readSourceUnits` keeps
 *   the windowed shape anyway so the parity table can compare like with like, and
 *   `citedPassage` reads the whole split. One consequence is worth naming: this reader
 *   can never report an anchor absent because it fell outside a window, which is a
 *   different fact from the file having changed (po-steward, 2026-09-11).
 * - Length-only verification of a zip entry. What this reader returns is shown to a
 *   person as the document's own words, so each entry's CRC-32 is checked and a mismatch
 *   is refused rather than quoted. The units of a sound file are identical either way;
 *   what differs is what happens to a damaged one.
 *
 * Nothing here is stored. The caller reads one file the person asked for, shows the unit
 * it names, and drops the text when the pane closes — `docs/DECISIONS.md`, 2026-09-07
 * "The MCP server reads a source's text on request; Atlas still keeps no converted copy".
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

// ── zip ─────────────────────────────────────────────────────────────────────────

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const utf8 = new TextDecoder('utf-8');

let crcTable: Uint32Array | null = null;

/**
 * CRC-32 of one decompressed entry, checked against the number the zip itself stores.
 *
 * The MCP module compares the inflated length only. That is enough for a tool whose
 * answer an agent reads and then cites; it is not enough for a passage offered to a
 * person **as the document's own words**, because a decoder defect that produces the
 * right number of wrong bytes would render as a quote (po-steward, 2026-09-11). A failed
 * check refuses with a stated reason; it never renders.
 */
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeUtf8(bytes: Uint8Array, start?: number, end?: number): string {
  return utf8.decode(start === undefined ? bytes : bytes.subarray(start, end));
}

/**
 * Every entry of a zip, by name, decompressed on demand.
 *
 * The same walk as the MCP module's: end-of-central-directory at the tail, central
 * directory, local header, one raw inflate per entry.
 */
function readZipEntries(bytes: Uint8Array): Map<string, () => Uint8Array> {
  if (bytes.length < 22) throw new Error('not a zip file: too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  for (let index = bytes.length - 22; index >= floor; index -= 1) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory record');
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, () => Uint8Array>();
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error('zip central directory is damaged');
    }
    const method = view.getUint16(offset + 10, true);
    const declaredCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeUtf8(bytes, offset + 46, offset + 46 + nameLength);
    entries.set(name, () => {
      if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
        throw new Error(`zip entry ${name} is damaged`);
      }
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);
      const verified = (out: Uint8Array): Uint8Array => {
        if (uncompressedSize !== 0xffffffff && out.length !== uncompressedSize) {
          throw new Error(
            `zip entry ${name} inflated to ${out.length} bytes, expected ${uncompressedSize}`,
          );
        }
        // A zip with no CRC recorded (a streamed entry) cannot be checked; one that
        // records a CRC is checked, and a mismatch is refused rather than quoted.
        if (declaredCrc !== 0 && crc32(out) !== declaredCrc) {
          throw new Error(`zip entry ${name} failed its CRC-32 check; its text is not trustworthy`);
        }
        return out;
      };
      if (method === 0) return verified(raw.slice());
      if (method === 8) {
        return verified(
          inflateRaw(raw, uncompressedSize === 0xffffffff ? undefined : uncompressedSize),
        );
      }
      throw new Error(`zip entry ${name} uses compression method ${method}, which is not supported`);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// ── xml, the little that Office text needs ───────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** `&amp;` and friends, plus numeric references, back to characters. */
function decodeXmlText(text: string): string {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

/** The character data of every `<tag>` element in order, tags themselves dropped. */
function textOf(xml: string): string {
  return decodeXmlText(xml.replace(/<[^>]+>/g, ''));
}

/**
 * A heading title as the anchor names it. The anchor grammar allows `[a-z0-9-]` only, so
 * accented letters lose their marks and a heading with no Latin letters at all gets no
 * slug here; the caller numbers it instead.
 */
function headingSlug(title: string): string {
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// ── formats ─────────────────────────────────────────────────────────────────────

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
  for (const match of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const paragraph = match[0];
    // Runs keep their order; tabs and breaks become spaces so words do not fuse.
    const text = textOf(
      paragraph
        .replace(/<w:tab\/>/g, ' ')
        .replace(/<w:br\b[^>]*\/>/g, ' ')
        .replace(/<w:t\b[^>]*>/g, '<w:t>'),
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const style = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(paragraph)?.[1] ?? '';
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
  const sheets = [
    ...decodeUtf8(workbook()).matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g),
  ].map((match, index) => ({
    index: index + 1,
    name: decodeXmlText(match[1] ?? ''),
    rid: match[2] ?? '',
  }));
  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  const rels = relsEntry ? decodeUtf8(relsEntry()) : '';
  const targetByRid = new Map(
    [...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map(
      (match) => [match[1] ?? '', match[2] ?? ''] as const,
    ),
  );
  const shared: string[] = [];
  const sharedEntry = entries.get('xl/sharedStrings.xml');
  const sharedXml = sharedEntry ? decodeUtf8(sharedEntry()) : undefined;
  if (sharedXml) {
    for (const item of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(item[1] ?? ''));
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
    for (const row of sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1] ?? '';
        const body = cell[2] ?? '';
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        let value = '';
        if (type === 's') {
          const index = Number.parseInt(textOf(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''), 10);
          value = shared[index] ?? '';
        } else if (type === 'inlineStr') {
          value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
        } else {
          value = textOf(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
        }
        cells.push(value.replace(/\s+/g, ' ').trim());
      }
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      const text = cells.join(' | ').trim();
      if (!text) continue;
      units.push({ anchor: `s${meta.index}r${row[1]}`, sheet: meta.name, text, kind: 'row' });
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
    String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article|header|footer)\b[^>]*>/gi, '\n')
      .replace(/<br\b[^>]*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  );
  return lineUnits(text);
}

// ── the reader's answer ─────────────────────────────────────────────────────────

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
 * Read one raw source into citable units, in the MCP tool's own windowed shape.
 *
 * This exists so `tests/contract/source-passage-parity.contract.test.ts` can compare the
 * two readers answer for answer, including pagination and the character cap. The screen
 * uses `citedPassage` instead.
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

/**
 * **Every unit in the file, unwindowed — what a search over the text needs.**
 *
 * `readSourceUnits` exists to match the MCP tool answer for answer, window and all, and
 * that window is why it cannot serve a search: a phrase at unit 1,400 of a long file
 * would be reported as *no match*, which is a false negative wearing an answer's
 * clothes. The window is a bound on what crosses a tool's round trip; nothing crosses
 * anything here, so there is nothing to bound.
 *
 * Same reasoning as `citedPassage`, which calls the same splitter for the same reason.
 */
export function sourceUnits(
  bytes: Uint8Array,
  path: string,
): { format: SourceTextFormat; units: SourceUnit[]; note?: string } {
  return splitSourceText(bytes, path);
}

/**
 * What a document is made of, in the extractor's own kinds — the file's shape without
 * its contents.
 */
export interface SourceOutline {
  format: SourceTextFormat;
  /** Every unit the reader found, so a count is never a guess at one. */
  unitCount: number;
  /**
   * Headings the extractor itself named, with the anchors it minted for them.
   *
   * Only DOCX populates this today. A Markdown `##` line is a `line` unit to this
   * reader, not a heading, and promoting it here would invent a structure the citation
   * grammar cannot address — so Markdown reports its line count instead and the
   * derivation waits for its own decision.
   */
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

/**
 * **The file's shape, read once when a person opens its pane.**
 *
 * This is the half of a document Atlas could always have shown and never did: the pane
 * knew the path, the format, the size and the hash, and nothing about whether the file
 * held three headings or three hundred rows. A person with no agent could not learn what
 * was in their own document without leaving the app (measured 2026-09-11).
 *
 * It is deliberately **counts and names, never bodies**. `docs/DECISIONS.md` 2026-09-07
 * keeps no converted copy, and a pane that rendered whole documents would be that copy
 * in all but name. The one place text appears is the passage a citation named, which a
 * person asked for by pressing its address.
 */
export function sourceOutline(bytes: Uint8Array, path: string): SourceOutline {
  const { format, units, note } = splitSourceText(bytes, path);
  const headings = units
    .filter((unit) => unit.kind === 'heading')
    .map((unit) => ({ anchor: unit.anchor, title: unit.heading ?? unit.text }));
  /*
   * Insertion order, which for a workbook is the sheet order `xlsxUnits` walked. A Map
   * keyed by name also collapses the case a sheet's rows are not contiguous, which is
   * not something this reader promises either way.
   */
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

// ── the passage one citation names ──────────────────────────────────────────────

/**
 * What the anchor turns out to be, as a fact rather than a sentence.
 *
 * The screen writes the words; the reader decides what kind of place this is, and it is
 * never allowed to be more precise than the extractor was. A DOCX heading anchor names a
 * heading, not a line — a person told "line 4" for `h:records` would go looking for a
 * line 4 that the extractor never counted.
 */
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
   * `resolved` — the anchor named units in this file, and `cited` holds them.
   * `unresolved` — the file no longer has that address; `candidates` is non-empty only
   * when the extractor itself reported an ambiguity, never as a guess.
   * `no-text` — a format this reader does not turn into text (a PDF). `note` says so.
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
 * `l14` → line 14, `s1r3` → sheet 1 row 3, `h:records` → the heading it names.
 *
 * Exported because a search hit's caption names the same place as the passage section,
 * and two functions deciding what `s1r3` is called would eventually disagree about it.
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

/**
 * The passage a citation names, with its neighbours for orientation.
 *
 * An unresolved anchor returns `state: 'unresolved'` and no text at all. That is the
 * whole point: the nearest paragraph to a renamed heading is not the cited one, and
 * showing it would let a page keep an address it lost while looking checked.
 */
export function citedPassage(
  bytes: Uint8Array,
  path: string,
  anchor: string,
  contextUnits: number = PASSAGE_CONTEXT_UNITS,
): CitedPassage {
  const { format, units, note } = splitSourceText(bytes, path);
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
     * Only the extractor's own ambiguity may offer an alternative, and only the
     * occurrences of *this* heading. `h:scope` splitting into `h:scope-1` and
     * `h:scope-3` is a fact the extractor reported in its note; `h:scope-2`, which
     * belongs to a differently named heading ("Scope 2") that merely sorts nearby, is a
     * guess — so the match is the heading's own slug, not a string prefix.
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
