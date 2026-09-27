/**
 * A raw source's text cut into the units a wiki citation anchor names (heading,
 * sheet and row, row, line; `wiki-schema.mjs`), so an agent cites the anchor it
 * was handed and needs no shell (which raises an execute card in the app on a
 * read-only turn). Read on request, nothing kept. DOCX and XLSX get a real
 * parser; CSV and text split the way their anchors count; a PDF is left to the
 * agent's runtime. The zip reader is deliberately small (central directory,
 * local header, one `inflateRawSync` per entry) so no third-party parser sits
 * between a person's document and the wiki quoting it.
 */
import { inflateRawSync } from 'node:zlib';

/** Units returned at most per call; `from` pages past it. */
export const READ_SOURCE_DEFAULT_LIMIT = 200;
export const READ_SOURCE_MAX_LIMIT = 1000;
/** Characters of text returned at most per call, whatever the unit count. */
export const READ_SOURCE_MAX_CHARS = 60_000;


const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * @param {Buffer} buffer
 * @returns {Map<string, () => Buffer>} every entry by name, decompressed on demand
 */
export function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('not a zip file: too short');
  // The end-of-central-directory record sits at the tail, before a comment of up to 64 KiB.
  let eocd = -1;
  const floor = Math.max(0, buffer.length - 22 - 0xffff);
  for (let index = buffer.length - 22; index >= floor; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory record');
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error('zip central directory is damaged');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.set(name, () => {
      if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error(`zip entry ${name} is damaged`);
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = buffer.subarray(start, start + compressedSize);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) {
        const out = inflateRawSync(raw);
        if (uncompressedSize !== 0xffffffff && out.length !== uncompressedSize) {
          throw new Error(`zip entry ${name} inflated to ${out.length} bytes, expected ${uncompressedSize}`);
        }
        return out;
      }
      throw new Error(`zip entry ${name} uses compression method ${method}, which is not supported`);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}


const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** `&amp;` and friends, plus numeric references, back to characters. */
function decodeXmlText(text) {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

/** The character data of every `<tag>` element in order, tags themselves dropped. */
function textOf(xml) {
  return decodeXmlText(xml.replace(/<[^>]+>/g, ''));
}

/**
 * A heading title as the anchor names it. The anchor grammar allows `[a-z0-9-]` only, so
 * accented letters lose their marks and a heading with no Latin letters at all (a Korean
 * one, say) gets no slug here; the caller numbers it instead.
 */
export function headingSlug(title) {
  return String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}


/**
 * A DOCX: its paragraphs in order. A paragraph styled as a heading opens a section, and
 * every paragraph under it carries that heading's `h:<slug>` anchor. Paragraphs before
 * the first heading carry `p1`, the one page a short letter or note has.
 */
function parseDocx(buffer) {
  const entries = readZipEntries(buffer);
  const document = entries.get('word/document.xml');
  if (!document) throw new Error('not a DOCX: word/document.xml is missing');
  const xml = document().toString('utf8');
  const paragraphs = [];
  let headingCount = 0;
  for (const match of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const paragraph = match[0];
    // Tabs and breaks become spaces so words do not fuse.
    const text = textOf(
      paragraph.replace(/<w:tab\/>/g, ' ').replace(/<w:br\b[^>]*\/>/g, ' ').replace(/<w:t\b[^>]*>/g, '<w:t>'),
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const style = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(paragraph)?.[1] ?? '';
    if (/^(heading|title)\d*$/i.test(style) || /^(제목|見出し)\d*$/.test(style)) {
      headingCount += 1;
      paragraphs.push({ text, kind: 'heading', base: `h:${headingSlug(text) || `heading-${headingCount}`}` });
      continue;
    }
    paragraphs.push({ text, kind: 'paragraph' });
  }

  const baseCounts = new Map();
  for (const paragraph of paragraphs) {
    if (paragraph.kind !== 'heading') continue;
    baseCounts.set(paragraph.base, (baseCounts.get(paragraph.base) ?? 0) + 1);
  }
  // Reserve every natural base first, so a unique `Scope 2` keeps h:scope-2 even
  // when h:scope repeats.
  const reservedBases = new Set(baseCounts.keys());
  const usedAnchors = new Set();
  const nextSuffixByBase = new Map();
  const ambiguousAnchors = [...baseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([base, count]) => `${base} (${count} occurrences)`);

  const units = [];
  let anchor = 'p1';
  let heading = null;
  for (const paragraph of paragraphs) {
    if (paragraph.kind === 'heading') {
      heading = paragraph.text;
      if (baseCounts.get(paragraph.base) === 1) {
        anchor = paragraph.base;
      } else {
        let suffix = nextSuffixByBase.get(paragraph.base) ?? 1;
        let generated;
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

export function docxUnits(buffer) {
  return parseDocx(buffer).units;
}

/**
 * An XLSX: every sheet's rows, `s<n>r<m>` where `n` counts sheets in workbook order and
 * `m` is the row's own number in the sheet. Cells are joined with ` | ` so a row reads
 * as one line; shared strings are resolved, formulas give their cached value.
 */
export function xlsxUnits(buffer, { sheet } = {}) {
  const entries = readZipEntries(buffer);
  const workbook = entries.get('xl/workbook.xml');
  if (!workbook) throw new Error('not an XLSX: xl/workbook.xml is missing');
  const sheets = [...workbook().toString('utf8').matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g)].map(
    (match, index) => ({ index: index + 1, name: decodeXmlText(match[1]), rid: match[2] }),
  );
  const rels = entries.get('xl/_rels/workbook.xml.rels')?.().toString('utf8') ?? '';
  const targetByRid = new Map(
    [...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  const shared = [];
  const sharedXml = entries.get('xl/sharedStrings.xml')?.().toString('utf8');
  if (sharedXml) {
    for (const item of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(item[1]));
  }
  const units = [];
  for (const meta of sheets) {
    if (sheet !== undefined && meta.index !== sheet) continue;
    const target = (targetByRid.get(meta.rid) ?? `worksheets/sheet${meta.index}.xml`).replace(/^\/?(xl\/)?/, '');
    const sheetXml = entries.get(`xl/${target}`)?.().toString('utf8');
    if (!sheetXml) continue;
    for (const row of sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cell of row[2].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1];
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
function tableUnits(text, delimiter = ',') {
  const source = String(text).replace(/^\uFEFF/, '');
  const units = [];
  let recordStart = 0;
  let recordStartLine = 1;
  let physicalLine = 1;
  let inQuotes = false;
  let atFieldStart = true;

  const pushRecord = (end) => {
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
function lineUnits(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line, index) => ({ anchor: `l${index + 1}`, text: line.trim(), kind: 'line' }))
    .filter((unit) => unit.text);
}

/** An HTML file: tags dropped, then lines like a text file. */
export function htmlUnits(html) {
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


const FORMAT_BY_EXTENSION = {
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

/**
 * Reads one raw source into citable units.
 *
 * @param {Buffer} buffer the file's bytes
 * @param {string} path vault-relative, `sources/<file>`
 * @param {{ from?: number, limit?: number, sheet?: number }} [options] `from` is
 *   the 1-based first unit, `limit` the count, `sheet` one workbook sheet number.
 * @returns {{ path, format, units, unitCount, from, truncated, note? }}
 */
export function readSourceText(buffer, path, options = {}) {
  const extension = String(path).toLowerCase().split('.').pop() ?? '';
  const format = FORMAT_BY_EXTENSION[extension] ?? 'binary';
  const from = Math.max(1, Math.trunc(Number(options.from) || 1));
  const limit = Math.min(READ_SOURCE_MAX_LIMIT, Math.max(1, Math.trunc(Number(options.limit) || READ_SOURCE_DEFAULT_LIMIT)));

  let units;
  let note;
  switch (format) {
    case 'docx': {
      const parsed = parseDocx(buffer);
      units = parsed.units;
      if (parsed.ambiguousAnchors.length > 0) {
        note =
          `Ambiguous legacy DOCX heading addresses: ${parsed.ambiguousAnchors.join(', ')}. ` +
          'Duplicate headings use distinct generated anchors in the returned units; cite those anchors instead.';
      }
      break;
    }
    case 'xlsx':
      units = xlsxUnits(buffer, { sheet: options.sheet });
      break;
    case 'csv': {
      const parsed = tableUnits(buffer.toString('utf8'), extension === 'tsv' ? '\t' : ',');
      units = parsed.units;
      if (parsed.unclosedQuoteStartLine !== undefined) {
        note =
          `Unclosed quoted record begins at physical line r${parsed.unclosedQuoteStartLine}; ` +
          'its raw remainder was retained as one unit through EOF. This is not a full CSV/TSV validity check.';
      }
      break;
    }
    case 'text':
      units = lineUnits(buffer.toString('utf8'));
      break;
    case 'html':
      units = htmlUnits(buffer.toString('utf8'));
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

  const unitCount = units.length;
  const window = units.slice(from - 1, from - 1 + limit);
  const kept = [];
  let chars = 0;
  for (const unit of window) {
    chars += unit.text.length;
    if (chars > READ_SOURCE_MAX_CHARS && kept.length > 0) break;
    kept.push(unit);
  }
  const truncated = from - 1 + kept.length < unitCount;
  const answer = { path, format, unitCount, from, units: kept, truncated };
  if (truncated) answer.next = from + kept.length;
  if (note) answer.note = note;
  return answer;
}
