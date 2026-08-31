import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditSourceCommentEntries,
  auditSourceStringEntries,
  classifySourcePath,
  classifyStringScanPath,
  extractCommentTokens,
  extractStringTokens,
  isSupportedSourcePath,
} from './inventory.mjs';
import {
  evaluateSourceCommentLanguageGate,
  evaluateSourceStringLanguageGate,
  SOURCE_STRING_LANGUAGE_ALLOWLIST,
  SOURCE_STRING_LANGUAGE_BASELINES,
} from './check.mjs';

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


test("a rust lifetime is not a string, so comments after it stay visible", () => {
  // Measured 2026-08-24: treating every `'` as a quote put the scanner inside a string from the
  // first `&'static str` onward, blinding it to 2,624 consecutive lines of src-tauri/src/lib.rs
  // while the gate reported zero. One lifetime is enough to reproduce it.
  const comments = extractCommentTokens("x.rs", "fn f(x: &'static str) {}\n// 한국어 주석\n");
  assert.equal(comments.length, 1);
  assert.match(comments[0].text, /한국어/);
});

test("an even number of lifetimes does not accidentally re-sync the scanner", () => {
  // This is why the old failure looked intermittent: two lifetimes paired up and closed the fake
  // string, so files with balanced quotes scanned correctly and hid the bug.
  const comments = extractCommentTokens("x.rs", "struct S<'a> { x: &'a str }\n// 한국어 주석\n");
  assert.equal(comments.length, 1);
});

test("genuine char literals are still stepped over, including escapes", () => {
  for (const literal of ["'x'", "'\\n'", "'\\''", "'\\u{1F600}'"]) {
    const comments = extractCommentTokens("x.rs", `let c = ${literal};\n// 한국어 주석\n`);
    assert.equal(comments.length, 1, `${literal} should not swallow the comment`);
  }
});

test("a comment marker inside a string literal is still not a comment", () => {
  // The repair must not overshoot: string contents stay invisible to the language gate.
  assert.equal(extractCommentTokens("x.rs", 'let s = "// 한국어";\n').length, 0);
});

test('scopes the printed-string scan to programs whose strings are output', () => {
  assert.equal(classifyStringScanPath('scripts/release-rehearsal.mjs'), 'scripts');
  assert.equal(classifyStringScanPath('mcp/src/index.js'), 'mcpServer');
  assert.equal(classifyStringScanPath('cli/src/commands/validate.mjs'), 'cliCommands');
  // Test names are Korean by convention here, fixtures must hold Korean input, and the product's
  // own locale data is not this ratchet's business.
  assert.equal(classifyStringScanPath('scripts/release-rehearsal.test.mjs'), null);
  assert.equal(classifyStringScanPath('tests/fixtures/frontmatter-cases.mjs'), null);
  assert.equal(classifyStringScanPath('src/entities/status/model/defaults.ts'), null);
  assert.equal(classifyStringScanPath('messages/ko.json'), null);
});

test('reads string and template literals but never a regex or a comment', () => {
  const source = [
    'const error = "실패했다";',
    'const label = `${count}개 남음`;',
    'const matcher = /(규칙|정책)/;',
    '// 한국어 주석',
  ].join('\n');
  const tokens = extractStringTokens('scripts/example.mjs', source);
  const texts = tokens.map((token) => source.slice(token.start, token.end));
  assert.ok(texts.some((text) => text.includes('실패했다')));
  assert.ok(texts.some((text) => text.includes('개 남음')));
  assert.ok(!texts.some((text) => text.includes('규칙')));
  assert.ok(!texts.some((text) => text.includes('주석')));

  const audit = auditSourceStringEntries([{ path: 'scripts/example.mjs', content: source }]);
  assert.equal(audit.scopes.scripts.unexpectedLines, 2);
});

test('an allowlist row exempts its own lines and nothing else', () => {
  const allowlist = [
    { id: 'expected-title', path: 'scripts/example.mjs', why: 'expected UI title', allow: /^const title/ },
  ];
  const audit = auditSourceStringEntries(
    [
      {
        path: 'scripts/example.mjs',
        content: 'const title = "지도 · Ontology Atlas";\nconsole.log("실패했다");\n',
      },
    ],
    allowlist,
  );
  assert.equal(audit.allowedLines, 1);
  assert.equal(audit.allowlistHits['expected-title'], 1);
  assert.deepEqual(audit.violations.map((row) => row.line), [2]);
});

test('an allowlist row that stopped matching fails instead of silently widening', () => {
  const allowlist = [{ id: 'stale', path: 'scripts/example.mjs', why: 'gone', allow: /nothing/ }];
  const audit = auditSourceStringEntries(
    [{ path: 'scripts/example.mjs', content: 'const ok = "English only";\n' }],
    allowlist,
  );
  const errors = evaluateSourceStringLanguageGate(audit, SOURCE_STRING_LANGUAGE_BASELINES, allowlist);
  assert.match(errors.join('\n'), /allowlist row "stale".*matched nothing/s);
});

test('the printed-string gate fails closed on an idle scan', () => {
  const audit = auditSourceStringEntries([{ path: 'src/example.ts', content: 'const a = 1;\n' }]);
  assert.match(
    evaluateSourceStringLanguageGate(audit, SOURCE_STRING_LANGUAGE_BASELINES, []).join('\n'),
    /scanned zero files or zero string literals/,
  );
});

test('the printed-string gate ratchets in both directions', () => {
  const audit = auditSourceStringEntries([
    { path: 'scripts/example.mjs', content: 'throw new Error("실패했다");\n' },
    { path: 'mcp/src/example.mjs', content: 'const ok = "English";\n' },
    { path: 'cli/src/example.mjs', content: 'const ok = "English";\n' },
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
  assert.deepEqual(evaluateSourceStringLanguageGate(audit, exact, []), []);

  const tooLow = structuredClone(exact);
  tooLow.scripts.unexpectedLanguageCodePoints -= 1;
  assert.match(evaluateSourceStringLanguageGate(audit, tooLow, []).join('\n'), /regressed/);

  const tooHigh = structuredClone(exact);
  tooHigh.mcpServer.unexpectedFiles += 1;
  assert.match(evaluateSourceStringLanguageGate(audit, tooHigh, []).join('\n'), /lower the baseline/);
});

test('gate probe: one planted Korean error string turns the live baselines red', () => {
  // The probe the gate discipline asks for, kept as a test so it runs on every change instead of
  // once by hand. The planted line is the exact shape this round translated away — an error
  // message an operator reads — and it is planted in `mcp/src`, whose live baseline is zero, so
  // the assertion measures the shipped baselines rather than a copy of them.
  const plant = (message) => [
    { path: 'mcp/src/example.mjs', content: `throw new Error("${message}");\n` },
    { path: 'scripts/example.mjs', content: 'const ok = "English";\n' },
    { path: 'cli/src/example.mjs', content: 'const ok = "English";\n' },
  ];
  const red = evaluateSourceStringLanguageGate(
    auditSourceStringEntries(plant('태그를 찍으면 여기서 멈춘다'), SOURCE_STRING_LANGUAGE_ALLOWLIST),
    SOURCE_STRING_LANGUAGE_BASELINES,
    [],
  );
  assert.match(red.join('\n'), /mcpServer printed strings unexpectedFiles regressed: 0 -> 1/);

  const green = evaluateSourceStringLanguageGate(
    auditSourceStringEntries(plant('it stops right here'), SOURCE_STRING_LANGUAGE_ALLOWLIST),
    SOURCE_STRING_LANGUAGE_BASELINES,
    [],
  );
  assert.deepEqual(green.filter((error) => error.startsWith('mcpServer')), []);
  assert.deepEqual(green.filter((error) => error.startsWith('cliCommands')), []);
});

test('every allowlist row states why the Korean is data', () => {
  for (const row of SOURCE_STRING_LANGUAGE_ALLOWLIST) {
    assert.ok(row.id && row.path, 'a row needs an id and a path');
    assert.ok((row.why ?? '').length > 40, `${row.id} needs a reason a reviewer can judge`);
    assert.ok(row.allow === 'file' || row.allow instanceof RegExp, `${row.id} needs a matcher`);
  }
});
