/**
 * One table of raw sources, run through **both** readers that split them into citable
 * units: `mcp/src/source-text.mjs` (the MCP server's `read_source`) and
 * `src/shared/lib/source-passage.ts` (the twin the Library pane reads a passage with).
 *
 * A wiki fact cites `[[src:sources/<file>#<anchor>]]`. If the two readers disagree by one
 * unit boundary, an agent cites an address that the screen resolves to a *different*
 * passage — a reader who presses it is shown someone else's sentence as the evidence for
 * this one. That is worse than showing nothing, so the gate compares anchors, kinds,
 * sheet and heading fields, the note, and the unit text **byte for byte**.
 *
 * Cases are built in code rather than committed as files wherever the bytes matter more
 * than the format: a DOCX and an XLSX are zips, and the parity that needs proving there
 * is the decompressor's. `zipFile` writes stored (method 0) and deflated (method 8)
 * entries so both branches of the twin's zip reader are exercised, and the DEFLATE
 * levels chosen cover a stored block, a fixed-Huffman block and a dynamic-Huffman block.
 */
import { deflateRawSync } from 'node:zlib';

const encoder = new TextEncoder();

/** CRC-32, so the zips this table builds carry the checksum a real one would. */
function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A minimal zip of the given entries.
 *
 * @param {Array<{ name: string, text: string, store?: boolean, level?: number }>} entries
 */
export function zipFile(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = encoder.encode(entry.text);
    const body = entry.store ? raw : new Uint8Array(deflateRawSync(raw, { level: entry.level ?? 9 }));
    const name = encoder.encode(entry.name);
    const crc = crc32(raw);
    const local = new Uint8Array(30 + name.length + body.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, entry.store ? 0 : 8, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, entry.store ? 0 : 8, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, body.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

const DOCX_BODY = (paragraphs) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="x"><w:body>${paragraphs.join('')}</w:body></w:document>`;
const HEADING = (text, level = 1) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const PARAGRAPH = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const SHEET = (rows) =>
  `<worksheet><sheetData>${rows
    .map(
      (cells, rowIndex) =>
        `<row r="${rowIndex + 1}">${cells
          .map((cell, cellIndex) => `<c r="${String.fromCharCode(65 + cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${cell}</t></is></c>`)
          .join('')}</row>`,
    )
    .join('')}</sheetData></worksheet>`;

/**
 * Every case is `{ name, path, bytes, calls }`, where `calls` are the option objects the
 * windowed reader is asked for — pagination is part of the contract, not a detail.
 */
export const SOURCE_PASSAGE_CASES = [
  {
    name: 'a Markdown policy, lines with blanks between them',
    path: 'sources/settlement-policy.md',
    bytes: encoder.encode(
      '# Settlement Policy\n\n## Settlement cycle\n\nCard payments settle on T+2 business days. Bank transfers settle same day when\nthe transfer clears before 15:00 KST, and on the next business day otherwise.\n\nA weekend or public holiday does not count as a business day.\n',
    ),
    calls: [{}, { from: 3, limit: 2 }],
  },
  {
    name: 'a CSV whose quoted record spans two physical lines',
    path: 'sources/fee-schedule.csv',
    bytes: encoder.encode(
      'method,region,note\ncard_domestic,KR,"settles T+2,\nholidays excluded"\nbank_transfer,KR,same day\n',
    ),
    calls: [{}, { from: 2, limit: 1 }],
  },
  {
    name: 'a TSV with a literal quote inside a field',
    path: 'sources/measurements.tsv',
    bytes: encoder.encode('item\tmeasurement\npipe\t2" steel\nnext\trow\n'),
    calls: [{ limit: 1000 }],
  },
  {
    name: 'a CSV with an unclosed quote, which must report its note',
    path: 'sources/malformed.csv',
    bytes: encoder.encode('a,b\n"unterminated,c\nd,e\n'),
    calls: [{}],
  },
  {
    name: 'an HTML export, tags dropped and then counted as lines',
    path: 'sources/merchant-onboarding.html',
    bytes: encoder.encode(
      '<html><head><style>b{color:red}</style></head><body><h1>Merchant Onboarding</h1><p>A merchant is live when three things are true.</p><ul><li>Registration verified</li><li>Account confirmed</li></ul><script>void 0</script></body></html>',
    ),
    calls: [{}],
  },
  {
    name: 'a DOCX with unique headings, deflated',
    path: 'sources/dispute-handling-standard.docx',
    bytes: zipFile([
      { name: '[Content_Types].xml', text: '<Types/>', store: true },
      {
        name: 'word/document.xml',
        text: DOCX_BODY([
          HEADING('Dispute Handling Standard'),
          PARAGRAPH('This standard is the single source for how a disputed transaction is worked.'),
          HEADING('Response window', 2),
          PARAGRAPH('Evidence must reach the network within 7 calendar days of notification.'),
          HEADING('Records', 2),
          PARAGRAPH('Every case keeps the original notification and the network&#8217;s decision.'),
        ]),
        level: 9,
      },
    ]),
    calls: [{}, { from: 5, limit: 2 }],
  },
  {
    name: 'a DOCX with colliding headings, whose generated anchors and note are the contract',
    path: 'sources/legacy-standard.docx',
    bytes: zipFile([
      {
        name: 'word/document.xml',
        text: DOCX_BODY([
          PARAGRAPH('A note before any heading at all.'),
          HEADING('Scope'),
          PARAGRAPH('First scope.'),
          HEADING('Scope 2'),
          PARAGRAPH('A uniquely named section that must keep h:scope-2.'),
          HEADING('Scope'),
          PARAGRAPH('Second scope, which may not borrow the first anchor.'),
        ]),
        level: 6,
      },
    ]),
    calls: [{}],
  },
  {
    name: 'a DOCX stored without compression',
    path: 'sources/stored.docx',
    bytes: zipFile([
      {
        name: 'word/document.xml',
        text: DOCX_BODY([HEADING('Stored'), PARAGRAPH('A zip entry with compression method 0.')]),
        store: true,
      },
    ]),
    calls: [{}],
  },
  {
    name: 'an XLSX with two sheets, shared strings and a trailing empty cell',
    path: 'sources/dispute-metrics.xlsx',
    bytes: zipFile([
      {
        name: 'xl/workbook.xml',
        text: '<workbook><sheets><sheet name="Quarterly" sheetId="1" r:id="rId1"/><sheet name="Reason codes" sheetId="2" r:id="rId2"/></sheets></workbook>',
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        text: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      },
      {
        name: 'xl/sharedStrings.xml',
        text: '<sst><si><t>quarter</t></si><si><t>disputes_opened</t></si></sst>',
      },
      {
        name: 'xl/worksheets/sheet1.xml',
        text: `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>2026-Q1</t></is></c><c r="B2"><v>412</v></c><c r="C2" t="inlineStr"><is><t></t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>2026-Q2</t></is></c><c r="B3"><v>388</v></c></row><row r="4"/></sheetData></worksheet>`,
        level: 1,
      },
      { name: 'xl/worksheets/sheet2.xml', text: SHEET([['reason_code', 'meaning'], ['10.4', 'Other fraud']]) },
    ]),
    calls: [{}, { sheet: 2 }, { from: 3, limit: 1 }],
  },
  {
    name: 'a long text file, where the default window truncates and pages',
    path: 'sources/log.txt',
    bytes: encoder.encode(Array.from({ length: 260 }, (_, index) => `line ${index + 1}`).join('\n')),
    calls: [{}, { from: 201, limit: 1000 }],
  },
  {
    name: 'a PDF, which returns no text and says so',
    path: 'sources/site-survey.pdf',
    bytes: encoder.encode('%PDF-1.4 binary'),
    calls: [{}],
  },
  {
    name: 'a format with no reader at all',
    path: 'sources/photo.heic',
    bytes: new Uint8Array([0, 1, 2, 3, 4, 5]),
    calls: [{}],
  },
];

/**
 * Anchors the passage selector must resolve, or refuse, on the cases above. `cited` is
 * the exact text of every unit the anchor names, in order — a `h:<slug>` anchor names a
 * heading **and** the paragraphs under it, so more than one line is the normal answer
 * there rather than the exception.
 */
export const CITED_PASSAGE_CASES = [
  {
    case: 'a Markdown policy, lines with blanks between them',
    anchor: 'l5',
    state: 'resolved',
    label: { kind: 'line', number: 5 },
    cited: ['Card payments settle on T+2 business days. Bank transfers settle same day when'],
    before: ['# Settlement Policy', '## Settlement cycle'],
    after: [
      'the transfer clears before 15:00 KST, and on the next business day otherwise.',
      'A weekend or public holiday does not count as a business day.',
    ],
  },
  {
    case: 'a Markdown policy, lines with blanks between them',
    anchor: 'l40',
    state: 'unresolved',
    cited: [],
    candidates: [],
  },
  {
    case: 'a CSV whose quoted record spans two physical lines',
    anchor: 'r2',
    state: 'resolved',
    label: { kind: 'record', number: 2 },
    cited: ['card_domestic,KR,"settles T+2,\nholidays excluded"'],
  },
  {
    case: 'a DOCX with unique headings, deflated',
    anchor: 'h:records',
    state: 'resolved',
    label: { kind: 'heading', title: 'Records' },
    cited: ['Records', 'Every case keeps the original notification and the network’s decision.'],
  },
  {
    case: 'a DOCX with colliding headings, whose generated anchors and note are the contract',
    anchor: 'h:scope',
    state: 'unresolved',
    cited: [],
    candidates: ['h:scope-1', 'h:scope-3'],
  },
  {
    case: 'a DOCX with colliding headings, whose generated anchors and note are the contract',
    anchor: 'h:scope-2',
    state: 'resolved',
    label: { kind: 'heading', title: 'Scope 2' },
    cited: ['Scope 2', 'A uniquely named section that must keep h:scope-2.'],
  },
  {
    case: 'a DOCX with colliding headings, whose generated anchors and note are the contract',
    anchor: 'p1',
    state: 'resolved',
    label: { kind: 'page', number: 1 },
    cited: ['A note before any heading at all.'],
  },
  {
    case: 'an XLSX with two sheets, shared strings and a trailing empty cell',
    anchor: 's1r3',
    state: 'resolved',
    label: { kind: 'sheet-row', sheet: 'Quarterly', row: 3 },
    cited: ['2026-Q2 | 388'],
  },
  {
    case: 'an XLSX with two sheets, shared strings and a trailing empty cell',
    anchor: 's2r2',
    state: 'resolved',
    label: { kind: 'sheet-row', sheet: 'Reason codes', row: 2 },
    cited: ['10.4 | Other fraud'],
  },
  {
    /**
     * The one the window would have broken: unit 250 of a 260-line file. The MCP tool
     * answers `l250` only on its second page; the pane's reader must never report it
     * absent, because "not in this window" and "not in the file" are different facts.
     */
    case: 'a long text file, where the default window truncates and pages',
    anchor: 'l250',
    state: 'resolved',
    label: { kind: 'line', number: 250 },
    cited: ['line 250'],
  },
  {
    case: 'a PDF, which returns no text and says so',
    anchor: 'p2',
    state: 'no-text',
    cited: [],
  },
];
