import assert from 'node:assert/strict';
import test from 'node:test';

import { citedSymbol, linesDecide, lineCites, preSectionParagraphs, servedLines, statesRule } from './line-cites.mjs';

test('every written form of a line cite parses to the same range', () => {
  const forms = ['src/a.ts:L12-L30', 'src/a.ts#L12-30', 'src/a.ts L12–30', 'src/a.ts:12-30'];
  for (const form of forms) {
    assert.deepEqual(lineCites(`The rule is at ${form}.`), [{ path: 'src/a.ts', startLine: 12, endLine: 30 }], form);
  }
  assert.deepEqual(lineCites('src/a.ts:L7'), [{ path: 'src/a.ts', startLine: 7, endLine: 7 }]);
});

test('a reversed range is put in order and a cite of 400 lines or more is dropped', () => {
  assert.deepEqual(lineCites('src/a.ts:L30-L12'), [{ path: 'src/a.ts', startLine: 12, endLine: 30 }]);
  assert.deepEqual(lineCites('src/a.ts:L1-L500'), []);
  assert.deepEqual(lineCites('src/a.ts:L0'), []);
});

test('a prose bracket around a cite does not become part of the path', () => {
  assert.deepEqual(lineCites('(see src/a.ts:L2)'), [{ path: 'src/a.ts', startLine: 2, endLine: 2 }]);
});

test('a cite counts as served only when every cited line sits in a range the session read', () => {
  const reads = new Map([['src/a.ts', [{ startLine: 10, endLine: 20 }, { startLine: 21, endLine: 40 }]]]);
  assert.equal(servedLines(reads, { path: 'src/a.ts', startLine: 12, endLine: 30 }), true);
  assert.equal(servedLines(reads, { path: 'src/a.ts', startLine: 5, endLine: 12 }), false);
  assert.equal(servedLines(reads, { path: 'src/b.ts', startLine: 12, endLine: 12 }), false);
  assert.equal(servedLines(null, { path: 'src/a.ts', startLine: 1, endLine: 1 }), false);
});

test('the cited lines decide only when one of them holds a condition', () => {
  const text = ['const a = 1;', 'export function f(x) {', '  if (!x) throw new Error("no");', '  return x;', '}'].join('\n');
  assert.equal(linesDecide(text, { startLine: 3, endLine: 3 }), true);
  assert.equal(linesDecide(text, { startLine: 1, endLine: 1 }), false);
  assert.equal(linesDecide(text, { startLine: 4, endLine: 5 }), false);
});

test('the symbol a body cites after its path is found in each form builders write', () => {
  assert.equal(citedSymbol({ body: 'Starts in `src/x.ts` `issueInvoice`.' }, 'src/x.ts'), 'issueInvoice');
  assert.equal(citedSymbol({ body: 'Starts at src/x.py#Owner.method now.' }, 'src/x.py'), 'Owner.method');
  assert.equal(citedSymbol({ body: 'Read src/x.ts and then more.' }, 'src/x.ts'), null);
  assert.equal(citedSymbol({ body: 'Read src/x.ts:L10 for it.' }, 'src/x.ts'), null);
});

test('the paragraphs before the first heading are the definition and the rules after it', () => {
  const body = 'Defines it.\n\nIt is skipped unless set.\n\n## Includes\n- thing\n';
  assert.deepEqual(preSectionParagraphs(body), ['Defines it.', 'It is skipped unless set.']);
});

test('a rule word inside a code span does not make a paragraph state a rule', () => {
  assert.equal(statesRule('It recalculates the `default` namespace as of now.'), false);
  assert.equal(statesRule('It answers with `error.msg.amount.must.be.greater`.'), false);
  assert.equal(statesRule('A locked loan is refused with 409 when `closeOfBusiness` holds it.'), true);
  assert.equal(statesRule('It falls back to `en` before any other locale.'), true);
});
