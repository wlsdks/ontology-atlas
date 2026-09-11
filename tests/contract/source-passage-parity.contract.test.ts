import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { inflateRaw } from '@/shared/lib/inflate-raw';
import {
  citedPassage,
  readSourceUnits,
  READ_SOURCE_DEFAULT_LIMIT,
  READ_SOURCE_MAX_CHARS,
  READ_SOURCE_MAX_LIMIT,
} from '@/shared/lib/source-passage';
import {
  CITED_PASSAGE_CASES,
  SOURCE_PASSAGE_CASES,
  zipFile,
} from '../fixtures/source-passage-cases.mjs';
import {
  readSourceText as readSourceTextUntyped,
  READ_SOURCE_DEFAULT_LIMIT as MCP_DEFAULT_LIMIT,
  READ_SOURCE_MAX_CHARS as MCP_MAX_CHARS,
  READ_SOURCE_MAX_LIMIT as MCP_MAX_LIMIT,
} from '../../mcp/src/source-text.mjs';

type UnitLike = { anchor: string; text: string; kind: string; heading?: string; sheet?: string };

/**
 * The MCP module is plain ESM with JSDoc, so its optional `next`/`note` fields are not
 * in the inferred type. Naming the shape here keeps the comparison honest: if the tool's
 * answer loses a field, this declaration is what has to change.
 */
const readSourceTextMcp = readSourceTextUntyped as (
  buffer: Buffer,
  path: string,
  options?: { from?: number; limit?: number; sheet?: number },
) => {
  path: string;
  format: string;
  unitCount: number;
  from: number;
  units: UnitLike[];
  truncated: boolean;
  next?: number;
  note?: string;
};

/**
 * **One address, one passage — whoever resolves it.**
 *
 * `[[src:sources/settlement-policy.md#l14]]` is written by an agent through the MCP
 * server's `read_source` (`mcp/src/source-text.mjs`) and, since slice U1, resolved for a
 * person by the Library pane through `src/shared/lib/source-passage.ts`. Two physical
 * modules exist for the reason `tests/contract/wiki-page-schema.contract.test.ts` gives
 * about the wiki format: the MCP package ships separately from the web bundle, and
 * neither imports the other.
 *
 * What may not differ is the split. A one-unit disagreement does not look like a bug on
 * screen — it looks like an answer, with somebody else's sentence standing under the
 * fact that cited this one. So every case below is compared **byte for byte**: anchors,
 * kinds, the `sheet` and `heading` fields, the extractor's note, pagination, and the
 * unit text itself.
 *
 * The DOCX and XLSX halves also pin the one piece of machinery the twin does not share:
 * `mcp/` inflates a zip entry with `node:zlib`, the bundle with `src/shared/lib/inflate-raw.ts`,
 * and "the same bytes" has to be measured rather than asserted.
 */

function comparable(units: readonly UnitLike[]) {
  return units.map((unit) => ({
    anchor: unit.anchor,
    kind: unit.kind,
    heading: unit.heading ?? null,
    sheet: unit.sheet ?? null,
    text: unit.text,
  }));
}

describe('the source-passage reader and read_source split a file identically', () => {
  it('agrees on the bounds both readers page with', () => {
    expect(READ_SOURCE_DEFAULT_LIMIT).toBe(MCP_DEFAULT_LIMIT);
    expect(READ_SOURCE_MAX_LIMIT).toBe(MCP_MAX_LIMIT);
    expect(READ_SOURCE_MAX_CHARS).toBe(MCP_MAX_CHARS);
  });

  it('covers every format a citation can name', () => {
    const formats = new Set(
      SOURCE_PASSAGE_CASES.map(
        (testCase) => readSourceUnits(testCase.bytes, testCase.path).format,
      ),
    );
    // An empty or one-format sweep would pass this file vacuously.
    expect([...formats].sort()).toEqual(['binary', 'csv', 'docx', 'html', 'pdf', 'text', 'xlsx']);
  });

  for (const testCase of SOURCE_PASSAGE_CASES) {
    for (const call of testCase.calls) {
      it(`${testCase.name} — ${JSON.stringify(call)}`, () => {
        const mine = readSourceUnits(testCase.bytes, testCase.path, call);
        const theirs = readSourceTextMcp(Buffer.from(testCase.bytes), testCase.path, call);
        expect(mine.format).toBe(theirs.format);
        expect(mine.unitCount).toBe(theirs.unitCount);
        expect(mine.from).toBe(theirs.from);
        expect(mine.truncated).toBe(theirs.truncated);
        expect(mine.next ?? null).toBe(theirs.next ?? null);
        expect(mine.note ?? null).toBe(theirs.note ?? null);
        expect(comparable(mine.units)).toEqual(comparable(theirs.units));
      });
    }
  }
});

describe('the passage a citation names', () => {
  for (const expectation of CITED_PASSAGE_CASES) {
    it(`${expectation.anchor} in ${expectation.case}`, () => {
      const testCase = SOURCE_PASSAGE_CASES.find((entry) => entry.name === expectation.case);
      expect(testCase, `no case named ${expectation.case}`).toBeDefined();
      const passage = citedPassage(testCase!.bytes, testCase!.path, expectation.anchor);
      expect(passage.state).toBe(expectation.state);
      expect(passage.cited.map((unit) => unit.text)).toEqual(expectation.cited);
      if (expectation.label) expect(passage.label).toEqual(expectation.label);
      if (expectation.before) {
        expect(passage.before.map((unit) => unit.text)).toEqual(expectation.before);
      }
      if (expectation.after) {
        expect(passage.after.map((unit) => unit.text)).toEqual(expectation.after);
      }
      if (expectation.candidates) expect(passage.candidates).toEqual(expectation.candidates);
    });
  }

  it('resolves every unit the MCP reader returns, at any page, to the same text', () => {
    for (const testCase of SOURCE_PASSAGE_CASES) {
      let from = 1;
      let guard = 0;
      for (;;) {
        const answer = readSourceTextMcp(Buffer.from(testCase.bytes), testCase.path, {
          from,
          limit: READ_SOURCE_MAX_LIMIT,
        });
        for (const unit of answer.units) {
          const passage = citedPassage(testCase.bytes, testCase.path, unit.anchor);
          expect(passage.state, `${testCase.path}#${unit.anchor}`).toBe('resolved');
          // A `h:` anchor names a heading and the paragraphs beneath it, so the tool's
          // unit must be *one of* the cited units and identical to its counterpart.
          expect(
            passage.cited.map((cited) => cited.text),
            `${testCase.path}#${unit.anchor}`,
          ).toContain(unit.text);
        }
        if (!answer.truncated || !answer.next) break;
        from = answer.next;
        guard += 1;
        expect(guard, 'pagination did not terminate').toBeLessThan(20);
      }
    }
  });

  it('never offers a passage, or a candidate, for an address the file does not hold', () => {
    const docx = SOURCE_PASSAGE_CASES.find((entry) => entry.name.startsWith('a DOCX with unique'))!;
    // `h:records` exists in this file; `h:retention` never did. No note, no ambiguity,
    // therefore no candidate and no text — the whole point of the unresolved state.
    const passage = citedPassage(docx.bytes, docx.path, 'h:retention');
    expect(passage.state).toBe('unresolved');
    expect(passage.cited).toEqual([]);
    expect(passage.candidates).toEqual([]);
    expect(passage.before).toEqual([]);
    expect(passage.after).toEqual([]);
  });
});

describe('the bundle inflates a zip entry the way node:zlib does', () => {
  it('matches on every DEFLATE block type, including the module that says so', () => {
    const samples: Buffer[] = [
      Buffer.from(''),
      Buffer.from('a'),
      Buffer.from('abcabcabcabcabcabc'.repeat(64)),
      Buffer.from(Array.from({ length: 70_000 }, (_, index) => (index * 37) % 251)),
      Buffer.from('가나다라'.repeat(2_000)),
      readFileSync('mcp/src/source-text.mjs'),
    ];
    for (const sample of samples) {
      // level 0 is a stored block, 1 reaches fixed Huffman, 6 and 9 dynamic Huffman.
      for (const level of [0, 1, 6, 9]) {
        const packed = deflateRawSync(sample, { level });
        const mine = Buffer.from(inflateRaw(new Uint8Array(packed), sample.length));
        expect(
          mine.equals(inflateRawSync(packed)),
          `level ${level}, ${sample.length} bytes`,
        ).toBe(true);
      }
    }
  });

  it('refuses a zip entry whose CRC-32 does not match rather than quoting it', () => {
    const body = '<w:document><w:body/></w:document>';
    const sound = zipFile([{ name: 'word/document.xml', text: body, store: true }]);
    expect(() => citedPassage(sound, 'sources/sound.docx', 'h:any')).not.toThrow();
    const damaged = Uint8Array.from(sound);
    /*
     * One byte of a **stored** entry, so the entry still has exactly the length the
     * directory claims and inflation cannot notice. Length was the MCP module's only
     * check; this is the case that motivated adding the checksum.
     */
    const start = 30 + 'word/document.xml'.length;
    damaged[start] = damaged[start]! ^ 0x01;
    expect(() => citedPassage(damaged, 'sources/damaged.docx', 'h:any')).toThrow(/CRC-32/);
  });
});

describe('the passage reader stays out of the compile path', () => {
  it('is not imported by the agent feature, whose refusal of these formats still stands', () => {
    // `git grep` exits 1 on no match, which is the passing case here.
    const offenders = execFileSync(
      'sh',
      [
        '-c',
        "git grep -l -e source-passage -e inflate-raw -- src/features/vault-agent || true",
      ],
      { encoding: 'utf8' },
    ).trim();
    /*
     * `src/features/vault-agent/model/source-text.ts` keeps `docx` and `xlsx` in
     * `PARSER_SOURCE_FORMATS`, and the person is told the format needs a reader Atlas
     * does not ship on that route. Wiring this module into Compile would change what
     * leaves the computer on the next turn — `SOURCE_TEXT_CHAR_CAP`'s own header says
     * every character read is a character that leaves — so it is a transfer decision
     * with its own record, not a side effect of a reading pane (po-steward, 2026-09-11).
     */
    expect(offenders).toBe('');
  });
});
