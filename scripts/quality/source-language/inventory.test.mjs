import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditSourceCommentEntries,
  classifySourcePath,
  extractCommentTokens,
  isSupportedSourcePath,
} from './inventory.mjs';
import { evaluateSourceCommentLanguageGate } from './check.mjs';

test('classifies current, test, and historical prototype source', () => {
  assert.equal(classifySourcePath('src/example.ts'), 'current');
  assert.equal(classifySourcePath('tests/contract/example.test.ts'), 'testFixture');
  assert.equal(classifySourcePath('docs/prototypes/example.html'), 'historicalPrototype');
  assert.equal(isSupportedSourcePath('docs/GUIDE.md'), false);
  assert.equal(isSupportedSourcePath('.githooks/pre-push'), true);
  assert.equal(isSupportedSourcePath('tests/fixtures/example.tsx.fixture'), true);
});

test('finds TypeScript comments but ignores Korean string literals', () => {
  const result = auditSourceCommentEntries([
    {
      path: 'src/example.ts',
      content: [
        'const label = "한국어 문자열";',
        '// 한국어 줄 주석',
        '/* 한국어 블록 주석 */',
      ].join('\n'),
    },
  ]);
  assert.equal(result.unexpectedFiles, 1);
  assert.equal(result.unexpectedLines, 2);
  assert.ok(result.unexpectedLanguageCodePoints > 0);
});

test('finds comments after template expressions and ignores comment markers inside literals', () => {
  const result = auditSourceCommentEntries([
    {
      path: 'src/example.ts',
      content: [
        'const route = `/${segment}`; // 템플릿 뒤 주석',
        'const literal = `문자열 // 주석 아님`;',
        'const expression = `${value /* 표현식 주석 */}`;',
      ].join('\n'),
    },
  ]);
  assert.equal(result.unexpectedFiles, 1);
  assert.equal(result.unexpectedLines, 2);
});

test('finds Han and kana introduced by translation tools', () => {
  const result = auditSourceCommentEntries([
    {
      path: 'src/example.ts',
      content: ['// 中文 comment', '// 日本語 comment'].join('\n'),
    },
  ]);
  assert.equal(result.unexpectedFiles, 1);
  assert.equal(result.unexpectedLines, 2);
  assert.ok(result.unexpectedLanguageCodePoints > 0);
});

test('finds Rust, CSS, hash, and HTML comments', () => {
  const entries = [
    { path: 'src-tauri/src/lib.rs', content: 'let text = "한국어"; // 러스트 주석\n' },
    { path: 'app/globals.css', content: '/* CSS 주석 */\n.a { color: #fff; }\n' },
    { path: '.github/workflows/checks.yml', content: 'name: checks # 워크플로 주석\n' },
    { path: 'docs/prototypes/example.html', content: '<!-- 프로토타입 주석 -->\n' },
  ];
  const result = auditSourceCommentEntries(entries);
  assert.equal(result.unexpectedFiles, 4);
  assert.equal(result.scopes.current.unexpectedFiles, 3);
  assert.equal(result.scopes.historicalPrototype.unexpectedFiles, 1);
});

test('finds CSS and JavaScript comments embedded in HTML without reading prose as code', () => {
  const result = auditSourceCommentEntries([
    {
      path: 'docs/prototypes/embedded.html',
      content: [
        '<!-- owner\'s English note -->',
        '<style>/* CSS 한국어 주석 */</style>',
        '<script>// JS 한국어 주석\nconst label = `한국어 문자열`;\n/** 인라인 주석 */</script>',
      ].join('\n'),
    },
  ]);
  assert.equal(result.unexpectedFiles, 1);
  assert.equal(result.unexpectedLines, 3);
});

test('extractor exposes exact comment ranges for safe rewrites', () => {
  const source = 'const value = 1; // 설명\n';
  const [comment] = extractCommentTokens('src/example.ts', source);
  assert.equal(source.slice(comment.start, comment.end), '// 설명');
});

test('fails closed on idle scans', () => {
  const audit = auditSourceCommentEntries([{ path: 'README.md', content: '# no source\n' }]);
  assert.match(evaluateSourceCommentLanguageGate(audit, {}).join('\n'), /zero files or zero comments/);
});

test('ratchets every source-comment scope in both directions', () => {
  const audit = auditSourceCommentEntries([
    { path: 'src/current.ts', content: '// 현재 주석\n' },
    { path: 'tests/example.test.ts', content: '// 테스트 주석\n' },
    { path: 'docs/prototypes/example.html', content: '<!-- 과거 주석 -->\n' },
  ]);
  const exact = Object.fromEntries(
    Object.entries(audit.scopes).map(([scope, value]) => [
      scope,
      {
        unexpectedFiles: value.unexpectedFiles,
        unexpectedLanguageCodePoints: value.unexpectedLanguageCodePoints,
      },
    ]),
  );
  assert.deepEqual(evaluateSourceCommentLanguageGate(audit, exact), []);

  const tooLow = structuredClone(exact);
  tooLow.current.unexpectedLanguageCodePoints -= 1;
  assert.match(evaluateSourceCommentLanguageGate(audit, tooLow).join('\n'), /regressed/);

  const tooHigh = structuredClone(exact);
  tooHigh.testFixture.unexpectedLanguageCodePoints += 1;
  assert.match(evaluateSourceCommentLanguageGate(audit, tooHigh).join('\n'), /lower the baseline/);
});
