import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';

import {
  READ_SOURCE_MAX_CHARS,
  docxUnits,
  headingSlug,
  htmlUnits,
  readSourceText,
  readZipEntries,
  xlsxUnits,
} from './source-text.mjs';

// A minimal zip writer, shaped like Office output, for these tests only.

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param {Record<string, string>} files name → text; every entry deflated */
function zip(files, { store = false } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const packed = store ? data : deflateRawSync(data);
    const method = store ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const centralStart = offset;
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centrals.length / 2, 8);
  eocd.writeUInt16LE(centrals.length / 2, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

const paragraph = (text, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const DOCX = zip({
  '[Content_Types].xml': '<Types/>',
  'word/document.xml':
    '<?xml version="1.0"?><w:document><w:body>' +
    paragraph('Change Request CR3', 'Title') +
    paragraph('Project: Harbourside reading room renovation') +
    paragraph('Scope', 'Heading1') +
    paragraph('Retain the timber sash frames &amp; refurbish them.') +
    '<w:p><w:r><w:t>Reassign the glazing</w:t></w:r><w:r><w:tab/><w:t>subcontract.</w:t></w:r></w:p>' +
    paragraph('Effect', 'Heading2') +
    paragraph('The budget becomes 221,400.') +
    '<w:p><w:pPr/></w:p>' +
    '</w:body></w:document>',
});

const XLSX = zip({
  'xl/workbook.xml':
    '<workbook><sheets><sheet name="Quotes" sheetId="1" r:id="rId1"/><sheet name="Notes &amp; risks" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>contractor</t></si><si><t>price</t></si><si><r><t>Halden</t></r><r><t> Joinery</t></r></si></sst>',
  'xl/worksheets/sheet1.xml':
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>236500</v></c><c r="C2"/></row>' +
    '<row r="3"><c r="A3" t="inlineStr"><is><t>Brightwater</t></is></c><c r="B3"><f>B2-37600</f><v>198900</v></c></row>' +
    '<row r="4"/>' +
    '</sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>lift out of scope</t></is></c></row></sheetData></worksheet>',
});

test('the zip reader returns every entry, deflated or stored, by name', () => {
  const deflated = readZipEntries(zip({ 'a.txt': 'hello', 'dir/b.txt': 'world' }));
  assert.deepEqual([...deflated.keys()], ['a.txt', 'dir/b.txt']);
  assert.equal(deflated.get('dir/b.txt')().toString(), 'world');
  const stored = readZipEntries(zip({ 'a.txt': 'hello' }, { store: true }));
  assert.equal(stored.get('a.txt')().toString(), 'hello');
  assert.throws(() => readZipEntries(Buffer.from('not a zip at all, not even close')), /not a zip/);
});

test('a DOCX becomes paragraphs under heading anchors, with runs and tabs joined', () => {
  const units = docxUnits(DOCX);
  assert.deepEqual(
    units.map((unit) => [unit.anchor, unit.kind, unit.text]),
    [
      ['h:change-request-cr3', 'heading', 'Change Request CR3'],
      ['h:change-request-cr3', 'paragraph', 'Project: Harbourside reading room renovation'],
      ['h:scope', 'heading', 'Scope'],
      ['h:scope', 'paragraph', 'Retain the timber sash frames & refurbish them.'],
      ['h:scope', 'paragraph', 'Reassign the glazing subcontract.'],
      ['h:effect', 'heading', 'Effect'],
      ['h:effect', 'paragraph', 'The budget becomes 221,400.'],
    ],
  );
});

test('a DOCX with no headings at all cites page one', () => {
  const units = docxUnits(zip({ 'word/document.xml': `<w:document><w:body>${paragraph('Just a note.')}</w:body></w:document>` }));
  assert.deepEqual(units, [{ anchor: 'p1', heading: null, text: 'Just a note.', kind: 'paragraph' }]);
});

test('a DOCX gives normalized duplicate headings distinct anchors and reserves natural suffixes', () => {
  const source = zip({
    'word/document.xml':
      '<w:document><w:body>' +
      paragraph('Before the first heading.') +
      paragraph('Overview', 'Heading1') +
      paragraph('Overview details.') +
      paragraph('Scope', 'Heading2') +
      paragraph('Routine scope details.') +
      paragraph('scope!', 'Heading2') +
      paragraph('Red-tag scope details.') +
      paragraph('Scope 2', 'Heading2') +
      paragraph('Naturally suffixed scope details.') +
      paragraph('Café', 'Heading2') +
      paragraph('Accent details.') +
      paragraph('Cafe', 'Heading2') +
      paragraph('Normalized accent details.') +
      '</w:body></w:document>',
  });
  const before = Buffer.from(source);
  const units = docxUnits(source);
  assert.deepEqual(
    units.map((unit) => [unit.anchor, unit.kind, unit.text]),
    [
      ['p1', 'paragraph', 'Before the first heading.'],
      ['h:overview', 'heading', 'Overview'],
      ['h:overview', 'paragraph', 'Overview details.'],
      ['h:scope-1', 'heading', 'Scope'],
      ['h:scope-1', 'paragraph', 'Routine scope details.'],
      ['h:scope-3', 'heading', 'scope!'],
      ['h:scope-3', 'paragraph', 'Red-tag scope details.'],
      ['h:scope-2', 'heading', 'Scope 2'],
      ['h:scope-2', 'paragraph', 'Naturally suffixed scope details.'],
      ['h:cafe-1', 'heading', 'Café'],
      ['h:cafe-1', 'paragraph', 'Accent details.'],
      ['h:cafe-2', 'heading', 'Cafe'],
      ['h:cafe-2', 'paragraph', 'Normalized accent details.'],
    ],
  );
  assert.equal(new Set(units.filter((unit) => unit.kind === 'heading').map((unit) => unit.anchor)).size, 6);
  assert.deepEqual(source, before);

  const answer = readSourceText(source, 'sources/duplicate-headings.docx');
  assert.match(answer.note, /ambiguous legacy DOCX heading addresses/i);
  assert.match(answer.note, /h:cafe/);
  assert.match(answer.note, /h:scope/);
  assert.deepEqual(source, before);
});

test('an XLSX becomes sheet-and-row anchors with shared strings, inline strings and cached formula values resolved', () => {
  const units = xlsxUnits(XLSX);
  assert.deepEqual(
    units.map((unit) => [unit.anchor, unit.sheet, unit.text]),
    [
      ['s1r1', 'Quotes', 'contractor | price'],
      ['s1r2', 'Quotes', 'Halden Joinery | 236500'],
      ['s1r3', 'Quotes', 'Brightwater | 198900'],
      ['s2r1', 'Notes & risks', 'lift out of scope'],
    ],
  );
  assert.deepEqual(xlsxUnits(XLSX, { sheet: 2 }).map((unit) => unit.anchor), ['s2r1']);
});

test('heading slugs match the anchor grammar: lowercase, hyphens, letters of any script', () => {
  assert.equal(headingSlug('Error handling & retries'), 'error-handling-retries');
  assert.equal(headingSlug('  6. Constraints '), '6-constraints');
  assert.equal(headingSlug('Café — résumé'), 'cafe-resume');
  // No Latin letters, no slug: the document reader numbers such a heading.
  assert.equal(headingSlug('범위와 예산'), '');
  const korean = docxUnits(zip({ 'word/document.xml': `<w:document><w:body>${paragraph('범위와 예산', 'Heading1')}${paragraph('예산은 240,000.')}</w:body></w:document>` }));
  assert.deepEqual(korean.map((unit) => unit.anchor), ['h:heading-1', 'h:heading-1']);
});

test('readSourceText picks the reader by extension and counts rows and lines the way anchors do', () => {
  const csv = readSourceText(Buffer.from('contractor,price\nHalden,236500\n\nCorvid,251000\n'), 'sources/quotes.csv');
  assert.equal(csv.format, 'csv');
  assert.deepEqual(csv.units.map((unit) => unit.anchor), ['r1', 'r2', 'r4']);
  assert.equal(csv.truncated, false);

  const txt = readSourceText(Buffer.from('line one\n\nline three'), 'sources/notes.txt');
  assert.deepEqual(txt.units.map((unit) => [unit.anchor, unit.text]), [['l1', 'line one'], ['l3', 'line three']]);

  const docx = readSourceText(DOCX, 'sources/change-request-CR3.docx');
  assert.equal(docx.format, 'docx');
  assert.equal(docx.unitCount, 7);

  const pdf = readSourceText(Buffer.from('%PDF-1.4'), 'sources/site-survey.pdf');
  assert.equal(pdf.format, 'pdf');
  assert.deepEqual(pdf.units, []);
  assert.match(pdf.note, /natively/);
});

test('CSV keeps a quoted multiline record exact while anchors retain physical starting lines', () => {
  const sourceText = [
    '\uFEFFroute,batch_min,batch_max,inspect_count,applies_when,note',
    ...Array.from({ length: 210 }, (_, index) => `Archived-${String(index + 1).padStart(3, '0')},1,10,2,retired calibration trial,Historical fixture row; not a current handling route.`),
    'Rapid,51,80,11,"ambient only',
    'never use this row for chilled lots",Current route',
    'Controlled,51,80,19,chilled lots,Current route; see the field manual routing rule.',
    'Fragile,51,80,27,fragile lots only,Current route; no general default is implied.',
    '',
  ].join('\r\n');
  const source = Buffer.from(sourceText, 'utf8');
  const before = Buffer.from(source);
  const answer = readSourceText(source, 'sources/sampling-table.csv', { limit: 1000 });
  assert.equal(answer.unitCount, 214);
  assert.deepEqual(answer.units.find((unit) => unit.anchor === 'r212'), {
    anchor: 'r212',
    text: 'Rapid,51,80,11,"ambient only\r\nnever use this row for chilled lots",Current route',
    kind: 'row',
  });
  assert.equal(answer.units.some((unit) => unit.anchor === 'r213'), false);
  assert.equal(answer.units.find((unit) => unit.text.startsWith('Controlled')).anchor, 'r214');
  assert.equal(answer.units.find((unit) => unit.text.startsWith('Fragile')).anchor, 'r215');
  assert.deepEqual(source, before);

  const rapidWindow = readSourceText(source, 'sources/sampling-table.csv', { from: 212, limit: 1 });
  assert.deepEqual(rapidWindow.units.map((unit) => unit.anchor), ['r212']);
  assert.equal(rapidWindow.truncated, true);
  assert.equal(rapidWindow.next, 213);
  const continuation = readSourceText(source, 'sources/sampling-table.csv', { from: rapidWindow.next, limit: 2 });
  assert.deepEqual(continuation.units.map((unit) => unit.anchor), ['r214', 'r215']);
  assert.equal(continuation.truncated, false);
  assert.equal(continuation.next, undefined);
});

test('TSV handles BOM, CRLF, blank records and escaped quotes without losing text', () => {
  const source = Buffer.from(
    '\uFEFFname\tvalue\r\n"line\twith ""quote""\r\ncontinued"\tok\r\n   \r\nlast\trow\r\n',
    'utf8',
  );
  const before = Buffer.from(source);
  const answer = readSourceText(source, 'sources/quotes.tsv');
  assert.deepEqual(answer.units.map((unit) => [unit.anchor, unit.text]), [
    ['r1', 'name\tvalue'],
    ['r2', '"line\twith ""quote""\r\ncontinued"\tok'],
    ['r5', 'last\trow'],
  ]);
  assert.equal(answer.unitCount, 3);
  assert.deepEqual(source, before);
});

test('literal quotes in unquoted CSV and TSV cells do not swallow the following record', () => {
  const csv = readSourceText(Buffer.from('item,measurement\npipe,2" steel\nnext,row\n'), 'sources/literal-quote.csv', { limit: 1000 });
  assert.deepEqual(csv.units.map((unit) => [unit.anchor, unit.text]), [
    ['r1', 'item,measurement'],
    ['r2', 'pipe,2" steel'],
    ['r3', 'next,row'],
  ]);

  const tsv = readSourceText(Buffer.from('item\tmeasurement\npipe\t2" steel\nnext\trow\n'), 'sources/literal-quote.tsv', { limit: 1000 });
  assert.deepEqual(tsv.units.map((unit) => [unit.anchor, unit.text]), [
    ['r1', 'item\tmeasurement'],
    ['r2', 'pipe\t2" steel'],
    ['r3', 'next\trow'],
  ]);
});

test('an unclosed quoted field is retained through EOF instead of being silently discarded', () => {
  const source = Buffer.from('header,body\nok,"unterminated\nstill retained\n', 'utf8');
  const answer = readSourceText(source, 'sources/malformed.csv');
  assert.deepEqual(answer.units, [
    { anchor: 'r1', text: 'header,body', kind: 'row' },
    { anchor: 'r2', text: 'ok,"unterminated\nstill retained\n', kind: 'row' },
  ]);
  assert.match(answer.note, /unclosed quoted record/i);
  assert.match(answer.note, /r2/);
  assert.match(answer.note, /retained/i);
});

test('HTML loses its tags and scripts and keeps line anchors', () => {
  const units = htmlUnits('<html><head><style>p{}</style><script>x()</script></head><body><h1>Risk register</h1><p>Lift &amp; ramp</p><ul><li>one</li><li>two</li></ul></body></html>');
  assert.deepEqual(units.map((unit) => [unit.anchor, unit.text]), [['l1', 'Risk register'], ['l2', 'Lift & ramp'], ['l3', 'one'], ['l4', 'two']]);
});

test('a long source pages: `from` and `limit` window the units, and `next` says where to continue', () => {
  const text = Array.from({ length: 500 }, (_, index) => `line ${index + 1}`).join('\n');
  const first = readSourceText(Buffer.from(text), 'sources/log.txt');
  assert.equal(first.units.length, 200);
  assert.equal(first.truncated, true);
  assert.equal(first.next, 201);
  const second = readSourceText(Buffer.from(text), 'sources/log.txt', { from: 201, limit: 1000 });
  assert.equal(second.units[0].anchor, 'l201');
  assert.equal(second.units.length, 300);
  assert.equal(second.truncated, false);
  assert.equal(second.next, undefined);

  const wide = readSourceText(Buffer.from(Array.from({ length: 5 }, () => 'x'.repeat(20_000)).join('\n')), 'sources/wide.txt');
  assert.ok(wide.units.reduce((sum, unit) => sum + unit.text.length, 0) <= READ_SOURCE_MAX_CHARS + 20_000);
  assert.equal(wide.truncated, true);
});
