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
  assert.equal(classifyMarkdownPath('.claude/LOOP-PRINCIPLES.md').scope, 'historical');
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
