// Documents the corpus plants below a vault's `sources/`: a ZIP archive written entry by entry, and
// the smallest DOCX and XLSX a reader opens. Each function returns the file as base64, the form a
// `write-file` step takes.
import { crc32, deflateRawSync } from 'node:zlib';

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;

/** One ZIP archive. An entry is `{ name, data, stored?: boolean, declaredSize?: number }`. */
function zipOf(entries) {
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const { name, data, stored = false, declaredSize } of entries) {
    const bytes = Buffer.from(data);
    const packed = stored ? bytes : deflateRawSync(bytes);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(crc32(bytes), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(declaredSize ?? bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(crc32(bytes), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(declaredSize ?? bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_DIRECTORY, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directoryBytes, end]);
}

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** A DOCX whose body is `bodyXml` (paragraph and table markup). */
export function docxOf(bodyXml) {
  const document = `<?xml version="1.0"?><w:document xmlns:w="${WORD}"><w:body>${bodyXml}</w:body></w:document>`;
  return zipOf([{ name: 'word/document.xml', data: document }]).toString('base64');
}

/** An XLSX of `sheets`, each `{ name, rows: [[cell, ...], ...] }`; text cells go through the shared strings. */
export function xlsxOf(sheets) {
  const strings = [];
  const stringIndex = (text) => {
    if (!strings.includes(text)) strings.push(text);
    return strings.indexOf(text);
  };
  const sheetXml = ({ rows }) => {
    const body = rows
      .map((cells, rowIndex) => {
        const row = cells
          .map((cell, column) => {
            const reference = `${String.fromCharCode(65 + column)}${rowIndex + 1}`;
            return typeof cell === 'number'
              ? `<c r="${reference}"><v>${cell}</v></c>`
              : `<c r="${reference}" t="s"><v>${stringIndex(cell)}</v></c>`;
          })
          .join('');
        return `<row r="${rowIndex + 1}">${row}</row>`;
      })
      .join('');
    return `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`;
  };
  const worksheets = sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet) }));
  const workbook = `<workbook><sheets>${sheets
    .map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('')}</sheets></workbook>`;
  const relations = `<Relationships>${sheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join('')}</Relationships>`;
  const shared = `<sst>${strings.map((text) => `<si><t>${text}</t></si>`).join('')}</sst>`;
  return zipOf([
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: relations },
    { name: 'xl/sharedStrings.xml', data: shared },
    ...worksheets,
  ]).toString('base64');
}

/** A DOCX whose one part inflates to 70 MiB from about 70 KiB, past the 64 MiB a read unpacks. */
export function docxPastTheUnpackBudget() {
  return zipOf([{ name: 'word/document.xml', data: Buffer.alloc(70 * 1024 * 1024) }]).toString('base64');
}

/** A DOCX cut short inside its central directory. */
export function docxCutShort() {
  const whole = zipOf([{ name: 'word/document.xml', data: '<w:document/>' }]);
  return whole.subarray(0, whole.length - 30).toString('base64');
}
