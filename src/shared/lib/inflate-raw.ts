/**
 * **Raw DEFLATE, decompressed inside the bundle.**
 *
 * A DOCX and an XLSX are zips of XML, and a zip stores its entries as raw DEFLATE
 * (RFC 1951). `mcp/src/source-text.mjs` reaches for `node:zlib`'s `inflateRawSync` for
 * exactly this; the web bundle has no `node:zlib`, and its twin in
 * `source-passage.ts` needs the same bytes to produce the same units.
 *
 * ## Why not the platform's own decompressor
 *
 * `DecompressionStream('deflate-raw')` exists — from Safari 16.4. `src-tauri/tauri.conf.json`
 * sets `minimumSystemVersion: "12.0"`, and what that pins is the OS floor, not the
 * WebKit build: a Monterey machine that took Safari 16.4 has it and one that did not
 * does not, which is the honest claim (po-evidence corrected an earlier flat "macOS 12
 * does not have it" here, 2026-09-11). Either way it is **not guaranteed at the floor**,
 * and the fallback would have to exist anyway — so it is the only path rather than the
 * second one, and there is one thing to keep correct instead of two. It is also a
 * stream: every caller of the reader would become asynchronous to borrow one
 * synchronous step.
 *
 * ## Why not a dependency
 *
 * The same reason `mcp/src/source-text.mjs` gives for writing its own zip reader: a
 * third-party parser between a person's document and the quote that cites it. This is
 * ~120 lines of a published, frozen format, and
 * `tests/contract/source-passage-parity.contract.test.ts` holds it against
 * `node:zlib` itself — the fixture DOCX and XLSX, plus generated streams at every block
 * type — so the claim "the same bytes" is measured rather than asserted.
 *
 * The decoder is the canonical bit-by-bit one (Mark Adler's `puff` shape): correctness
 * and a small footprint over speed, which is right for a file a person pressed once.
 */

/** Copy lengths for symbols 257–285, and the extra bits each reads (RFC 1951 §3.2.5). */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

/** Copy distances for symbols 0–29, and their extra bits. */
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA_BITS = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

/** The order a dynamic block writes its code-length code lengths in. */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const MAX_CODE_BITS = 15;

/**
 * A canonical Huffman table: how many codes exist at each bit length, and the symbols in
 * code order. Decoding walks lengths 1…15 and never builds a lookup array, which is what
 * keeps this short enough to read.
 */
interface HuffmanTable {
  counts: Int32Array;
  symbols: Int32Array;
}

class InflateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InflateError';
  }
}

function buildHuffman(lengths: readonly number[], count: number): HuffmanTable {
  const counts = new Int32Array(MAX_CODE_BITS + 1);
  for (let symbol = 0; symbol < count; symbol += 1) {
    counts[lengths[symbol] ?? 0] += 1;
  }
  // Length 0 means "this symbol is not in the alphabet"; it never takes a code.
  counts[0] = 0;
  // Where each bit length's block of symbols starts, then a running cursor inside it, so
  // `symbols` ends up in code order: all 1-bit codes, then all 2-bit codes, and so on.
  const nextSlot = new Int32Array(MAX_CODE_BITS + 2);
  for (let bits = 1; bits <= MAX_CODE_BITS; bits += 1) {
    nextSlot[bits + 1] = nextSlot[bits]! + counts[bits]!;
  }
  const symbols = new Int32Array(count);
  for (let symbol = 0; symbol < count; symbol += 1) {
    const length = lengths[symbol] ?? 0;
    if (length === 0) continue;
    symbols[nextSlot[length]!] = symbol;
    nextSlot[length] += 1;
  }
  return { counts, symbols };
}

/** A bit reader over the stream, least significant bit first, as DEFLATE writes it. */
class BitReader {
  private bitBuffer = 0;
  private bitCount = 0;
  private index = 0;

  constructor(private readonly bytes: Uint8Array) {}

  bit(): number {
    if (this.bitCount === 0) {
      if (this.index >= this.bytes.length) throw new InflateError('deflate stream ended mid-symbol');
      this.bitBuffer = this.bytes[this.index]!;
      this.index += 1;
      this.bitCount = 8;
    }
    const value = this.bitBuffer & 1;
    this.bitBuffer >>>= 1;
    this.bitCount -= 1;
    return value;
  }

  bits(count: number): number {
    let value = 0;
    for (let position = 0; position < count; position += 1) {
      value |= this.bit() << position;
    }
    return value;
  }

  /** Drop the rest of the current byte — what a stored block's header does. */
  alignToByte(): void {
    this.bitBuffer = 0;
    this.bitCount = 0;
  }

  readBytes(count: number): Uint8Array {
    if (this.index + count > this.bytes.length) {
      throw new InflateError('stored deflate block runs past the end of the stream');
    }
    const slice = this.bytes.subarray(this.index, this.index + count);
    this.index += count;
    return slice;
  }
}

function decodeSymbol(reader: BitReader, table: HuffmanTable): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let length = 1; length <= MAX_CODE_BITS; length += 1) {
    code |= reader.bit();
    const count = table.counts[length]!;
    if (code - first < count) return table.symbols[index + (code - first)]!;
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new InflateError('no Huffman code matched within 15 bits');
}

let fixedLiteralTable: HuffmanTable | null = null;
let fixedDistanceTable: HuffmanTable | null = null;

function fixedTables(): { literal: HuffmanTable; distance: HuffmanTable } {
  if (!fixedLiteralTable || !fixedDistanceTable) {
    const literalLengths = new Array<number>(288);
    for (let symbol = 0; symbol < 144; symbol += 1) literalLengths[symbol] = 8;
    for (let symbol = 144; symbol < 256; symbol += 1) literalLengths[symbol] = 9;
    for (let symbol = 256; symbol < 280; symbol += 1) literalLengths[symbol] = 7;
    for (let symbol = 280; symbol < 288; symbol += 1) literalLengths[symbol] = 8;
    fixedLiteralTable = buildHuffman(literalLengths, 288);
    fixedDistanceTable = buildHuffman(new Array<number>(30).fill(5), 30);
  }
  return { literal: fixedLiteralTable, distance: fixedDistanceTable };
}

function dynamicTables(reader: BitReader): { literal: HuffmanTable; distance: HuffmanTable } {
  const literalCount = reader.bits(5) + 257;
  const distanceCount = reader.bits(5) + 1;
  const codeLengthCount = reader.bits(4) + 4;
  const codeLengths = new Array<number>(19).fill(0);
  for (let index = 0; index < codeLengthCount; index += 1) {
    codeLengths[CODE_LENGTH_ORDER[index]!] = reader.bits(3);
  }
  const codeLengthTable = buildHuffman(codeLengths, 19);

  const lengths = new Array<number>(literalCount + distanceCount).fill(0);
  let index = 0;
  while (index < lengths.length) {
    const symbol = decodeSymbol(reader, codeLengthTable);
    if (symbol < 16) {
      lengths[index] = symbol;
      index += 1;
      continue;
    }
    let repeatLength = 0;
    let repeatCount = 0;
    if (symbol === 16) {
      if (index === 0) throw new InflateError('a code-length repeat began with nothing to repeat');
      repeatLength = lengths[index - 1]!;
      repeatCount = 3 + reader.bits(2);
    } else if (symbol === 17) {
      repeatCount = 3 + reader.bits(3);
    } else {
      repeatCount = 11 + reader.bits(7);
    }
    if (index + repeatCount > lengths.length) {
      throw new InflateError('a code-length repeat ran past the alphabet');
    }
    for (let step = 0; step < repeatCount; step += 1) {
      lengths[index] = repeatLength;
      index += 1;
    }
  }
  return {
    literal: buildHuffman(lengths.slice(0, literalCount), literalCount),
    distance: buildHuffman(lengths.slice(literalCount), distanceCount),
  };
}

/** An output buffer that grows by doubling; a zip entry's size is known but not trusted. */
class OutputBuffer {
  private bytes: Uint8Array;
  private length = 0;

  constructor(initialCapacity: number) {
    this.bytes = new Uint8Array(Math.max(64, initialCapacity));
  }

  private reserve(extra: number): void {
    if (this.length + extra <= this.bytes.length) return;
    let capacity = this.bytes.length;
    while (capacity < this.length + extra) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  push(byte: number): void {
    this.reserve(1);
    this.bytes[this.length] = byte;
    this.length += 1;
  }

  append(slice: Uint8Array): void {
    this.reserve(slice.length);
    this.bytes.set(slice, this.length);
    this.length += slice.length;
  }

  /** The back-reference copy: overlapping runs are legal and must be copied byte by byte. */
  copyBack(distance: number, count: number): void {
    if (distance > this.length) {
      throw new InflateError('a copy pointed before the start of the decompressed data');
    }
    this.reserve(count);
    let from = this.length - distance;
    for (let step = 0; step < count; step += 1) {
      this.bytes[this.length] = this.bytes[from]!;
      this.length += 1;
      from += 1;
    }
  }

  result(): Uint8Array {
    return this.bytes.subarray(0, this.length);
  }
}

/**
 * Raw DEFLATE bytes → the bytes they encode.
 *
 * @param bytes one zip entry's compressed body (no zlib or gzip header)
 * @param expectedSize the size the zip's directory claims, used only to size the first
 *   allocation; a stream that decodes to a different length is still returned, and the
 *   caller compares — the same division `mcp/src/source-text.mjs` keeps.
 */
export function inflateRaw(bytes: Uint8Array, expectedSize?: number): Uint8Array {
  const reader = new BitReader(bytes);
  const output = new OutputBuffer(
    typeof expectedSize === 'number' && expectedSize > 0 && expectedSize < 1 << 26
      ? expectedSize
      : bytes.length * 4,
  );
  for (;;) {
    const isFinal = reader.bit() === 1;
    const type = reader.bits(2);
    if (type === 0) {
      reader.alignToByte();
      const header = reader.readBytes(4);
      const length = header[0]! | (header[1]! << 8);
      const complement = header[2]! | (header[3]! << 8);
      if ((length ^ 0xffff) !== complement) {
        throw new InflateError('a stored block declared a length its complement contradicts');
      }
      output.append(reader.readBytes(length));
    } else if (type === 1 || type === 2) {
      const tables = type === 1 ? fixedTables() : dynamicTables(reader);
      for (;;) {
        const symbol = decodeSymbol(reader, tables.literal);
        if (symbol < 256) {
          output.push(symbol);
          continue;
        }
        if (symbol === 256) break;
        const lengthIndex = symbol - 257;
        if (lengthIndex >= LENGTH_BASE.length) {
          throw new InflateError(`length symbol ${symbol} is not in the alphabet`);
        }
        const copyLength = LENGTH_BASE[lengthIndex]! + reader.bits(LENGTH_EXTRA_BITS[lengthIndex]!);
        const distanceSymbol = decodeSymbol(reader, tables.distance);
        if (distanceSymbol >= DISTANCE_BASE.length) {
          throw new InflateError(`distance symbol ${distanceSymbol} is not in the alphabet`);
        }
        const distance =
          DISTANCE_BASE[distanceSymbol]! + reader.bits(DISTANCE_EXTRA_BITS[distanceSymbol]!);
        output.copyBack(distance, copyLength);
      }
    } else {
      throw new InflateError('block type 3 is reserved and cannot appear in a deflate stream');
    }
    if (isFinal) break;
  }
  return output.result();
}
