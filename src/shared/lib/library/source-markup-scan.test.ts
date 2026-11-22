import { describe, expect, it } from 'vitest';

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

describe('decodeXmlText', () => {
  it('turns named and numeric references into characters and leaves an unknown one as written', () => {
    expect(decodeXmlText('a &amp; b &lt;c&gt; &#65;&#x42; &nbsp;')).toBe('a & b <c> AB &nbsp;');
  });

  it('keeps a numeric reference that is not a number instead of throwing', () => {
    expect(decodeXmlText('&#xZZ; &#;')).toBe('&#xZZ; &#;');
  });
});

describe('textOf', () => {
  it('drops tags and decodes what is left', () => {
    expect(textOf('<w:t>x</w:t> &amp;<b/>y')).toBe('x &y');
  });
});

describe('tag scans', () => {
  it('matches a tag by its whole name, so `w:p` never starts at `<w:pStyle`', () => {
    expect(elementSpans('<w:p>1</w:p><w:pStyle w:val="x"/><w:p>2</w:p>', 'w:p')).toEqual([
      '<w:p>1</w:p>',
      '<w:p>2</w:p>',
    ]);
    expect(openTags('<sheet name="a"/><sheetData x="1">', 'sheet')).toEqual(['<sheet name="a"/']);
  });

  it('stops at an unclosed element and keeps the spans found before it', () => {
    expect(elementSpans('<w:p>1</w:p><w:p>2', 'w:p')).toEqual(['<w:p>1</w:p>']);
    expect(between('<si>a</si><si>b</si><si>c', '<si>', '</si>')).toEqual(['a', 'b']);
  });

  it('reads two attributes in order and refuses a tag that lacks the second', () => {
    expect(attributePair('<sheet name="a" r:id="r1"/>', 'name', 'r:id')).toEqual(['a', 'r1']);
    expect(attributePair('<sheet name="a"/>', 'name', 'r:id')).toBeNull();
  });
});

describe('worksheet scans', () => {
  it('keeps only rows that carry their own number', () => {
    expect(sheetRows('<row r="1"><c>x</c></row><row><c>y</c></row><row r="3"></row>')).toEqual([
      { number: '1', body: '<c>x</c>' },
      { number: '3', body: '' },
    ]);
  });

  it('reads a self-closing cell after the last closed one as an empty cell', () => {
    expect(rowCells('<c r="A1" t="s"><v>0</v></c><c r="B1"/>')).toEqual([
      { attrs: ' r="A1" t="s"', body: '<v>0</v>' },
      { attrs: ' r="B1"', body: '' },
    ]);
  });

  it('gives up on closing tags once one is missing, so unclosed cells cost one pass', () => {
    expect(rowCells('<c r="A1"><c r="B1"><c r="C1"/>')).toEqual([{ attrs: ' r="C1"', body: '' }]);
  });
});

describe('withoutElements', () => {
  it('drops a closed element with its content', () => {
    expect(withoutElements('a<script>x</script>b', 'script')).toBe('ab');
  });

  it('keeps everything after an element that never closes, because no end says where it stops', () => {
    expect(withoutElements('a<script>x</script>b<script>never closed', 'script')).toBe(
      'ab<script>never closed',
    );
  });
});
