import assert from 'node:assert/strict';
import test from 'node:test';

import { extractTestTitles, nonLatinTestTitles, isTestSourcePath } from './test-titles.mjs';

const texts = (source, path = 'a.test.ts') => extractTestTitles(path, source).map((e) => `${e.kind}:${e.text}`);

test('reads titles through modifiers, each tables and playwright steps', () => {
  const source = [
    "describe('outer', () => {});",
    "it.skip('skipped', () => {});",
    "test.describe.only('pw block', () => {});",
    "it.each([[1]])('row %s', () => {});",
    "await test.step('a step', async () => {});",
    'bench(`template ${x}`, () => {});',
  ].join('\n');
  assert.deepEqual(texts(source), [
    'title:outer',
    'title:skipped',
    'title:pw block',
    'title:row %s',
    'title:a step',
    'title:template ${x}',
  ]);
});

test('evaluates messages and titles assembled with + and templates', () => {
  const source = [
    "expect(a, 'one ' + 'two').toBe(1);",
    "expect(a, `line ${n}` + ' then ' + `${'literal'} end`).toBe(1);",
    "assert.equal(a, b, ('why: ' + detail));",
    "it('case ' + name, () => {});",
    'expect(a, prefix + suffix).toBe(1);',
  ].join('\n');
  assert.deepEqual(texts(source), [
    'message:one two',
    'message:line ${n} then literal end',
    'message:why: ${detail}',
    'title:case ${name}',
  ]);
});

test('reads an expect.poll message from its options', () => {
  const source = [
    "await expect.poll(() => count(), { timeout: 10_000, message: 'poll ' + label }).toBe(1);",
    "await expect.poll(() => count(), { 'message': `quoted ${n}` }).toBe(1);",
    "await expect.poll(() => count(), { timeout: 10_000, intervals: [100] }).toBe(1);",
    'await expect.poll(() => count()).toBe(1);',
  ].join('\n');
  assert.deepEqual(texts(source), ['message:poll ${label}', 'message:quoted ${n}']);
  assert.deepEqual(
    nonLatinTestTitles('a.spec.ts', "await expect.poll(() => n, { timeout: 5_000, message: '한글 메시지' }).toBe(1);").map((e) => e.kind),
    ['message'],
  );
});

test('reads the literals of a message it cannot evaluate', () => {
  const source = [
    "expect(a, ok ? '' : 'why it failed').toBe(1);",
    "expect(a, ['first line', 'second line'].join('\\n')).toBe(1);",
  ].join('\n');
  assert.deepEqual(texts(source), ['message:why it failed', 'message:first line … second line']);
});

test('flags Hangul in an assembled message', () => {
  const source = [
    "expect(a, '한글 ' + detail).toBe(1);",
    "expect(a, `첫 줄\\n` +",
    "  `둘째 줄`).toBe(1);",
    "expect(a, ok ? '' : `한글 ${n}`).toBe(1);",
    "expect(a, 'english ' + '영어 아님').toBe(1);",
    "expect(a, 'english ' + detail).toBe(1);",
  ].join('\n');
  assert.deepEqual(
    nonLatinTestTitles('a.test.ts', source).map((e) => [e.kind, e.line]),
    [['message', 1], ['message', 2], ['message', 4], ['message', 5]],
  );
});

test('reads expect and node assert messages at their argument positions', () => {
  const source = [
    "expect(a, 'expect message').toBe(1);",
    "expect.soft(a, 'soft message').toBe(1);",
    "assert(a, 'bare message');",
    "assert.ok(a, 'ok message');",
    "assert.equal(a, b, 'equal message');",
    "assert.match(a, /x/, 'match message');",
    "assert.equal(a, 'not a message');",
  ].join('\n');
  assert.deepEqual(texts(source), [
    'message:expect message',
    'message:soft message',
    'message:bare message',
    'message:ok message',
    'message:equal message',
    'message:match message',
  ]);
});

test('flags Hangul in titles and messages but not in test bodies or each tables', () => {
  const source = [
    "it('한글 제목', () => {});",
    "it('english title', () => { expect(parse('한글 입력')).toBe('값'); });",
    "it.each([['한글']])('matches %s', () => {});",
    "expect(a, '한글 메시지').toBe(1);",
    "test('steps', async () => { await test.step('한글 단계', () => {}); });",
  ].join('\n');
  assert.deepEqual(
    nonLatinTestTitles('a.test.tsx', source).map((e) => [e.kind, e.line]),
    [['title', 1], ['message', 4], ['title', 5]],
  );
});

test('recognises test and spec files only', () => {
  assert.equal(isTestSourcePath('src/a.test.ts'), true);
  assert.equal(isTestSourcePath('tests/e2e/a.spec.ts'), true);
  assert.equal(isTestSourcePath('mcp/src/a.test.mjs'), true);
  assert.equal(isTestSourcePath('src/a.ts'), false);
});

test('flags Han, kana and Hangul in a title and leaves Latin alone', () => {
  const count = (text) => nonLatinTestTitles('a.test.ts', `it('${text}', () => {});`).length;
  for (const text of ['한글', '日本語', 'ひらがな', 'カタカナ', '简体中文']) assert.equal(count(text), 1, text);
  assert.equal(count('plain English'), 0);
});
