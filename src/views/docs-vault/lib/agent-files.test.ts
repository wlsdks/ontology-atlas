import { describe, expect, it } from 'vitest';
import {
  analyzeAgentFiles,
  buildAgentFilesUiModel,
  manifestIncludesRepoRoot,
  selectAgentFileDocs,
  WEB_SCAN_ANALYZE_OPTIONS,
} from './agent-files';

// 순수 분석 로직 자체는 tests/contract/agent-files.contract.test.ts 가 CLI
// 구현과 함께 fixture 매트릭스로 검증한다. 여기서는 웹 전용 어댑터만 —
// repo-root 게이트, manifest → 엔트리 선별, UI 모델 조인.

describe('manifestIncludesRepoRoot — honest repo-root gate', () => {
  it('is true when CLAUDE.md or AGENTS.md sits at the manifest root', () => {
    expect(manifestIncludesRepoRoot([{ path: 'CLAUDE.md' }])).toBe(true);
    expect(manifestIncludesRepoRoot([{ path: 'AGENTS.md' }, { path: 'docs/a.md' }])).toBe(true);
  });

  it('is false for a vault picked below the repo root (docs/ontology …)', () => {
    expect(manifestIncludesRepoRoot([])).toBe(false);
    expect(
      manifestIncludesRepoRoot([
        { path: 'README.md' },
        { path: 'capabilities/mcp-server.md' },
        // nested copies do not make the vault the repo root
        { path: 'sub/CLAUDE.md' },
      ]),
    ).toBe(false);
  });
});

describe('selectAgentFileDocs', () => {
  it('keeps only classified agent files from the manifest', () => {
    const docs = [
      { path: 'CLAUDE.md', slug: 'CLAUDE' },
      { path: 'AGENTS.md', slug: 'AGENTS' },
      { path: 'GEMINI.md', slug: 'GEMINI' },
      { path: 'README.md', slug: 'README' },
      { path: 'docs/FEATURES.md', slug: 'docs/FEATURES' },
    ];
    expect(selectAgentFileDocs(docs).map((d) => d.path)).toEqual([
      'CLAUDE.md',
      'AGENTS.md',
      'GEMINI.md',
    ]);
  });
});

describe('buildAgentFilesUiModel', () => {
  it('joins analysis records to manifest slugs and counts drift', () => {
    const docs = [
      { path: 'CLAUDE.md', slug: 'CLAUDE' },
      { path: 'AGENTS.md', slug: 'AGENTS' },
    ];
    const analysis = analyzeAgentFiles({
      files: [
        { path: 'CLAUDE.md', content: 'no import\n' },
        { path: 'AGENTS.md', content: '# guide\n' },
      ],
      existingPaths: docs.map((d) => d.path),
      unverifiablePrefixes: [...WEB_SCAN_ANALYZE_OPTIONS.unverifiablePrefixes],
      verifiableExtensions: [...WEB_SCAN_ANALYZE_OPTIONS.verifiableExtensions],
    });
    const model = buildAgentFilesUiModel(analysis, docs);
    expect(model.records.map((r) => r.slug)).toEqual(['AGENTS', 'CLAUDE']);
    const claude = model.records.find((r) => r.slug === 'CLAUDE');
    expect(claude?.drift).toEqual(['missing-agents-import']);
    expect(claude?.tools).toEqual(['claude-code']);
    expect(model.driftCount).toBe(1);
  });

  it('marks dot-path refs unverified in web mode instead of false-missing', () => {
    const docs = [{ path: 'AGENTS.md', slug: 'AGENTS' }];
    const analysis = analyzeAgentFiles({
      files: [{ path: 'AGENTS.md', content: '@.claude/rules/design.md\n' }],
      existingPaths: docs.map((d) => d.path),
      unverifiablePrefixes: [...WEB_SCAN_ANALYZE_OPTIONS.unverifiablePrefixes],
      verifiableExtensions: [...WEB_SCAN_ANALYZE_OPTIONS.verifiableExtensions],
    });
    expect(analysis.checks.atRefs.unverifiedRefs).toBe(1);
    expect(analysis.checks.atRefs.missingRefs).toBe(0);
    expect(buildAgentFilesUiModel(analysis, docs).driftCount).toBe(0);
  });
});
