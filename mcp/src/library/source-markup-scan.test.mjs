import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
} from './source-markup-scan.mjs';

describe('decodeXmlText', () => {
  it('turns named and numeric references into characters and leaves an unknown one as written', () => {
    assert.equal(decodeXmlText('a &amp; b &lt;c&gt; &#65;&#x42; &nbsp;'), 'a & b <c> AB &nbsp;');
  });

  it('keeps a numeric reference that is not a number instead of throwing', () => {
    assert.equal(decodeXmlText('&#xZZ; &#;'), '&#xZZ; &#;');
  });
});

describe('textOf', () => {
  it('drops tags and decodes what is left', () => {
    assert.equal(textOf('<w:t>x</w:t> &amp;<b/>y'), 'x &y');
  });
});

describe('tag scans', () => {
  it('matches a tag by its whole name, so `w:p` never starts at `<w:pStyle`', () => {
    assert.deepEqual(elementSpans('<w:p>1</w:p><w:pStyle w:val="x"/><w:p>2</w:p>', 'w:p'), [
      '<w:p>1</w:p>',
      '<w:p>2</w:p>',
    ]);
    assert.deepEqual(openTags('<sheet name="a"/><sheetData x="1">', 'sheet'), ['<sheet name="a"/']);
  });

  it('stops at an unclosed element and keeps the spans found before it', () => {
    assert.deepEqual(elementSpans('<w:p>1</w:p><w:p>2', 'w:p'), ['<w:p>1</w:p>']);
    assert.deepEqual(between('<si>a</si><si>b</si><si>c', '<si>', '</si>'), ['a', 'b']);
  });

  it('reads two attributes in order and refuses a tag that lacks the second', () => {
    assert.deepEqual(attributePair('<sheet name="a" r:id="r1"/>', 'name', 'r:id'), ['a', 'r1']);
    assert.equal(attributePair('<sheet name="a"/>', 'name', 'r:id'), null);
  });
});

describe('worksheet scans', () => {
  it('keeps only rows that carry their own number', () => {
    assert.deepEqual(sheetRows('<row r="1"><c>x</c></row><row><c>y</c></row><row r="3"></row>'), [
      { number: '1', body: '<c>x</c>' },
      { number: '3', body: '' },
    ]);
  });

  it('reads a self-closing cell after the last closed one as an empty cell', () => {
    assert.deepEqual(rowCells('<c r="A1" t="s"><v>0</v></c><c r="B1"/>'), [
      { attrs: ' r="A1" t="s"', body: '<v>0</v>' },
      { attrs: ' r="B1"', body: '' },
    ]);
  });

  it('gives up on closing tags once one is missing, so unclosed cells cost one pass', () => {
    assert.deepEqual(rowCells('<c r="A1"><c r="B1"><c r="C1"/>'), [{ attrs: ' r="C1"', body: '' }]);
  });
});

describe('withoutElements', () => {
  it('drops a closed element with its content', () => {
    assert.equal(withoutElements('a<script>x</script>b', 'script'), 'ab');
  });

  it('keeps everything after an element that never closes, because no end says where it stops', () => {
    assert.equal(
      withoutElements('a<script>x</script>b<script>never closed', 'script'),
      'ab<script>never closed',
    );
  });
});
