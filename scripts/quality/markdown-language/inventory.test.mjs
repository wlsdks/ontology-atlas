import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditMarkdownEntries,
  classifyMarkdownPath,
} from './inventory.mjs';
import { evaluateMarkdownLanguageGate } from './check.mjs';

test('classifies canonical Markdown by migration scope', () => {
  assert.equal(classifyMarkdownPath('AGENTS.md').kind, 'canonical');
  assert.equal(classifyMarkdownPath('AGENTS.md').scope, 'operational');
  assert.equal(classifyMarkdownPath('.claude/rules/documentation.md').scope, 'operational');
  assert.equal(classifyMarkdownPath('docs/guide/cli.md').scope, 'current');
  assert.equal(classifyMarkdownPath('docs/DECISIONS.md').scope, 'historical');
});

test('skips generated docs and byte-mirrored agent files', () => {
  assert.equal(classifyMarkdownPath('public/docs-vault/guide/cli.md').kind, 'generated');
  assert.equal(classifyMarkdownPath('.agents/skills/example/SKILL.md').kind, 'mirror');
});

test('allows the intentionally Korean vault template as locale content', () => {
  assert.equal(classifyMarkdownPath('cli/templates/vault-ko/README.md').kind, 'locale-template');

  const result = auditMarkdownEntries([
    { path: 'cli/templates/vault-ko/README.md', content: '# 내 온톨로지 문서함\n' },
  ]);

  assert.equal(result.unexpectedHangulCodePoints, 0);
  assert.equal(result.localeTemplateFiles, 1);
});

test('allows display_ko only inside the leading frontmatter block', () => {
  const result = auditMarkdownEntries([
    {
      path: 'docs/ontology/example.md',
      content: [
        '---',
        'title: Example',
        'display_ko: 예시',
        '---',
        '',
        '# Example',
      ].join('\n'),
    },
  ]);

  assert.equal(result.unexpectedHangulCodePoints, 0);
  assert.equal(result.allowedLocaleLines, 1);
});

test('allows a localized architecture role summary, and only by locale shape', () => {
  const result = auditMarkdownEntries([
    {
      path: 'docs/ontology/architecture/example.md',
      content: [
        '---',
        'summary_views: One module per screen a route can open.',
        'summary_views_ko: 라우트가 열 수 있는 화면 하나마다 모듈 하나입니다.',
        'summary_views_kor: 로케일이 아닌 접미사입니다.',
        '---',
        '',
        '# Example',
      ].join('\n'),
    },
  ]);

  assert.equal(result.allowedLocaleLines, 1);
  assert.equal(result.unexpectedLines, 1);
  assert.equal(result.violations[0].line, 4);
});

test('reports Korean prose, owner quotes, and display_ko outside frontmatter', () => {
  const result = auditMarkdownEntries([
    { path: 'AGENTS.md', content: '# Guide\n한국어 산문\n' },
    { path: 'docs/GUIDE.md', content: 'Owner: "그대로 해줘"\n' },
    { path: 'docs/BAD.md', content: '# Body\ndisplay_ko: 본문에서는 허용되지 않음\n' },
  ]);

  assert.equal(result.unexpectedFiles, 3);
  assert.equal(result.unexpectedLines, 3);
  assert.ok(result.unexpectedHangulCodePoints > 0);
  assert.deepEqual(
    result.violations.map(({ path, line }) => [path, line]),
    [
      ['AGENTS.md', 2],
      ['docs/GUIDE.md', 1],
      ['docs/BAD.md', 2],
    ],
  );
});

test('counts a Korean focused-test title quoted in an Evidence coordinate apart from prose', () => {
  const result = auditMarkdownEntries([
    {
      path: 'docs/ontology/elements/search-palette.md',
      content: [
        '---',
        'kind: element',
        '---',
        '## Evidence',
        '- Primary implementation: `src/widgets/search-palette/ui/SearchPalette.tsx#SearchPalette`',
        '- Focused test: `src/widgets/search-palette/ui/SearchPalette.test.tsx#열리면 role=dialog 로 렌더된다`',
        '- Focused test: `src/a.test.ts#타이틀` 그리고 설명',
        '- Supporting implementation: `src/x.ts#한글`',
        '한국어 산문',
        '',
      ].join('\n'),
    },
  ]);
  // The quoted coordinate is counted on its own ratchet, never as prose.
  assert.equal(result.quotedEvidenceLines, 1);
  assert.equal(result.scopes.current.quotedEvidenceLines, 1);
  // Hangul outside the backticks, a non-test coordinate, and plain prose stay violations.
  assert.equal(result.unexpectedLines, 3);
  assert.deepEqual(result.violations.map((row) => row.line), [7, 8, 9]);
});

test('fails closed when no canonical Markdown is scanned', () => {
  const result = auditMarkdownEntries([
    { path: 'public/docs-vault/README.md', content: '# Generated\n' },
    { path: '.agents/agents/example.md', content: '# Mirror\n' },
  ]);

  assert.equal(result.scannedFiles, 0);
  assert.equal(result.skippedFiles, 2);
});

test('ratchets each migration scope in both directions', () => {
  const audit = auditMarkdownEntries([
    { path: 'AGENTS.md', content: '규칙\n' },
    { path: 'docs/GUIDE.md', content: '현재 문서\n' },
    { path: 'docs/DECISIONS.md', content: '과거 기록\n' },
    {
      path: 'docs/ontology/example.md',
      content: '---\ndisplay_ko: 예시\n---\n# Example\n',
    },
    { path: 'cli/templates/vault-ko/README.md', content: '# 한국어 템플릿\n' },
    { path: 'public/docs-vault/GUIDE.md', content: '# Generated\n' },
    { path: '.agents/agents/example.md', content: '# Mirror\n' },
  ]);
  const exact = Object.fromEntries(
    Object.entries(audit.scopes).map(([scope, value]) => [
      scope,
      {
        unexpectedFiles: value.unexpectedFiles,
        unexpectedHangulCodePoints: value.unexpectedHangulCodePoints,
      },
    ]),
  );

  assert.deepEqual(evaluateMarkdownLanguageGate(audit, exact), []);

  const tooLow = structuredClone(exact);
  tooLow.operational.unexpectedHangulCodePoints -= 1;
  assert.match(evaluateMarkdownLanguageGate(audit, tooLow).join('\n'), /regressed/);

  const tooHigh = structuredClone(exact);
  tooHigh.current.unexpectedHangulCodePoints += 1;
  assert.match(evaluateMarkdownLanguageGate(audit, tooHigh).join('\n'), /lower the baseline/);
});
