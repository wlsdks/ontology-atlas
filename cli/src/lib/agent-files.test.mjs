import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGENT_FILE_RULES,
  AGENT_TOOL_LABELS,
  CODEX_PROJECT_DOC_CAP_BYTES,
  analyzeAgentFiles,
  classifyAgentFilePath,
  extractAtRefs,
} from './agent-files.mjs';

describe('agent-files — classification table', () => {
  it('maps every known agent-file pattern to a rule with kind + tools', () => {
    const expectations = [
      ['CLAUDE.md', 'claude-md', 'instructions', ['claude-code']],
      ['AGENTS.md', 'agents-md', 'instructions', ['codex', 'cursor', 'antigravity', 'gemini-cli', 'copilot']],
      ['GEMINI.md', 'gemini-md', 'instructions', ['antigravity', 'gemini-cli']],
      ['.claude/rules/design.md', 'claude-rules', 'rules', ['claude-code']],
      ['.claude/skills/ontology-sync/SKILL.md', 'claude-skills', 'skill', ['claude-code']],
      ['.claude/agents/design-guardian.md', 'claude-agents', 'agent', ['claude-code']],
      ['.agents/skills/ontology-sync/SKILL.md', 'agents-skills', 'skill', ['codex']],
      ['src/AGENTS.md', 'nested-agents-md', 'instructions', ['codex', 'cursor', 'antigravity', 'gemini-cli', 'copilot']],
      ['.cursor/rules/base.mdc', 'cursor-rules', 'rules', ['cursor']],
      ['.cursorrules', 'cursorrules', 'rules', ['cursor']],
      ['.github/copilot-instructions.md', 'copilot-instructions', 'instructions', ['copilot']],
      ['.claude/hooks/block-npm-publish.sh', 'claude-hooks', 'config', ['claude-code']],
      ['.claude/settings.json', 'claude-settings', 'config', ['claude-code']],
      ['.codex/config.toml', 'codex-dir', 'config', ['codex']],
      ['.codex/hooks/block-npm-publish.sh', 'codex-dir', 'config', ['codex']],
      ['.mcp.json', 'mcp-json', 'mcp-config', ['claude-code', 'cursor']],
    ];
    for (const [path, ruleId, kind, tools] of expectations) {
      const hit = classifyAgentFilePath(path);
      assert.ok(hit, `expected ${path} to classify`);
      assert.equal(hit.ruleId, ruleId, path);
      assert.equal(hit.kind, kind, path);
      assert.deepEqual(hit.tools, tools, path);
    }
  });

  it('does not classify ordinary repo files', () => {
    for (const path of [
      'README.md',
      'docs/DESIGN-SYSTEM.md',
      'src/CLAUDE.md.bak',
      '.claude/settings.local.json', // personal override, never committed
      '.cursor/rules/base.md', // cursor rules must be .mdc
      'nested/CLAUDE.md', // repo-root slice: root files only
      'cli/templates/vault/AGENTS.md', // starter-vault product data, three deep
      'a/b/AGENTS.md', // nested pointers are one level only
    ]) {
      assert.equal(classifyAgentFilePath(path), null, path);
    }
  });

  it('keeps the tool mapping as data — every rule tool has a label', () => {
    for (const rule of AGENT_FILE_RULES) {
      for (const tool of rule.tools) {
        assert.ok(AGENT_TOOL_LABELS[tool], `missing label for tool ${tool} (rule ${rule.id})`);
      }
    }
  });
});

describe('agent-files — extractAtRefs', () => {
  it('extracts path-like @references with a file extension', () => {
    const refs = extractAtRefs(
      [
        '@AGENTS.md',
        'see @docs/DESIGN-SYSTEM.md and (@.claude/rules/design.md) too',
        '- **Rules** — `@.claude/rules/git.md`',
      ].join('\n'),
    ).map((r) => r.ref);
    assert.deepEqual(refs, [
      'AGENTS.md',
      'docs/DESIGN-SYSTEM.md',
      '.claude/rules/design.md',
      '.claude/rules/git.md',
    ]);
  });

  it('ignores emails, npm scopes, css at-rules and extensionless tokens', () => {
    const refs = extractAtRefs(
      [
        'contact devqamain@gmail.com please',
        'uses `@modelcontextprotocol/sdk` and @anthropic-ai/sdk',
        '@media (prefers-color-scheme: dark) {}',
        '@theme block',
        'next-intl @4.11',
      ].join('\n'),
    );
    assert.deepEqual(refs, []);
  });

  it('trims sentence-final punctuation from refs', () => {
    const refs = extractAtRefs('read @docs/FEATURES.md.').map((r) => r.ref);
    assert.deepEqual(refs, ['docs/FEATURES.md']);
  });
});

function analyze(files, overrides = {}) {
  return analyzeAgentFiles({ files, existingPaths: [], ...overrides });
}

function driftCodes(result) {
  return result.drift.map((d) => `${d.check}:${d.code}:${d.path}`);
}

describe('agent-files — drift check ① CLAUDE.md ↔ AGENTS.md bridge', () => {
  it('passes when CLAUDE.md imports @AGENTS.md and AGENTS.md exists', () => {
    const result = analyze([
      { path: 'CLAUDE.md', content: '# CLAUDE.md\n\n@AGENTS.md\n' },
      { path: 'AGENTS.md', content: '# AGENTS.md\n' },
    ]);
    assert.equal(result.checks.claudeAgentsBridge.status, 'ok');
  });

  it('flags a missing @AGENTS.md import when both files exist', () => {
    const result = analyze([
      { path: 'CLAUDE.md', content: '# CLAUDE.md\n\nno import here\n' },
      { path: 'AGENTS.md', content: '# AGENTS.md\n' },
    ]);
    assert.equal(result.checks.claudeAgentsBridge.status, 'drift');
    assert.ok(driftCodes(result).includes('claude-agents-bridge:missing-agents-import:CLAUDE.md'));
  });

  it('flags an import pointing at a missing AGENTS.md', () => {
    const result = analyze([{ path: 'CLAUDE.md', content: '@AGENTS.md\n' }]);
    assert.equal(result.checks.claudeAgentsBridge.status, 'drift');
    assert.ok(driftCodes(result).includes('claude-agents-bridge:broken-agents-import:CLAUDE.md'));
  });

  it('does not treat a backticked mention as an import', () => {
    const result = analyze([
      { path: 'CLAUDE.md', content: 'the `@AGENTS.md` import line goes below\n' },
      { path: 'AGENTS.md', content: '# AGENTS.md\n' },
    ]);
    assert.equal(result.checks.claudeAgentsBridge.status, 'drift');
  });

  it('is not applicable without CLAUDE.md, or with CLAUDE.md alone and no import', () => {
    assert.equal(
      analyze([{ path: 'AGENTS.md', content: '# a\n' }]).checks.claudeAgentsBridge.status,
      'not-applicable',
    );
    assert.equal(
      analyze([{ path: 'CLAUDE.md', content: 'standalone\n' }]).checks.claudeAgentsBridge.status,
      'not-applicable',
    );
  });
});

describe('agent-files — drift check ② duplicated skill trees byte diff', () => {
  const claudeSkill = (rel, content) => ({ path: `.claude/skills/${rel}`, content });
  const agentsSkill = (rel, content) => ({ path: `.agents/skills/${rel}`, content });

  it('reports in-sync shared skills as ok', () => {
    const result = analyze([
      claudeSkill('ontology-sync/SKILL.md', 'same bytes'),
      agentsSkill('ontology-sync/SKILL.md', 'same bytes'),
    ]);
    assert.equal(result.checks.skillCopy.status, 'ok');
    assert.equal(result.checks.skillCopy.comparedFiles, 1);
    assert.deepEqual(result.checks.skillCopy.sharedSkills, ['ontology-sync']);
  });

  it('flags byte divergence between the two copies', () => {
    const result = analyze([
      claudeSkill('ontology-sync/SKILL.md', 'version A'),
      agentsSkill('ontology-sync/SKILL.md', 'version B — drifted'),
    ]);
    assert.equal(result.checks.skillCopy.status, 'drift');
    assert.ok(
      driftCodes(result).includes('skill-copy:skill-copy-diverged:ontology-sync/SKILL.md'),
    );
    // both physical files carry the drift marker
    const byPath = new Map(result.records.map((r) => [r.path, r.drift]));
    assert.deepEqual(byPath.get('.claude/skills/ontology-sync/SKILL.md'), ['skill-copy-diverged']);
    assert.deepEqual(byPath.get('.agents/skills/ontology-sync/SKILL.md'), ['skill-copy-diverged']);
  });

  it('flags a file present on only one side of a shared skill', () => {
    const result = analyze([
      claudeSkill('ontology-sync/SKILL.md', 'same'),
      agentsSkill('ontology-sync/SKILL.md', 'same'),
      claudeSkill('ontology-sync/helper.sh', 'only here'),
    ]);
    assert.equal(result.checks.skillCopy.status, 'drift');
    assert.ok(
      driftCodes(result).includes('skill-copy:skill-copy-file-missing:ontology-sync/helper.sh'),
    );
  });

  it('treats a skill living in only one tree as informational, not drift', () => {
    const result = analyze([claudeSkill('claude-only/SKILL.md', 'x')]);
    assert.equal(result.checks.skillCopy.status, 'not-applicable');
    assert.deepEqual(result.checks.skillCopy.claudeOnlySkills, ['claude-only']);
    assert.deepEqual(result.drift, []);
  });
});

/**
 * The seat-brief pair exists for a **different reason** than the skill pair. For
 * Claude Code `.claude/agents/*.md` is the subagent summoning registry (a seat
 * missing from it cannot be spawned); for a tool without subagents
 * `.agents/agents/*.md` is the reference document it opens while walking a council
 * sequentially. Different purposes, identical content.
 *
 * Measured 2026-08-04: 15 seats existed only under `.claude/agents/`, and both
 * council skills summoned them **by name alone**. A Codex session received five
 * (PO) and nine (design) names it could neither summon nor read, and improvised —
 * silently.
 *
 * Why a one-sided seat is **not** informational the way a one-sided skill is: a
 * skill may legitimately belong to one tool, but council seats exist so both tools
 * can run the same protocol, and a seat present on one side only means the protocol
 * does not hold for the other tool.
 */
describe('agent-files — drift check: .claude/agents ↔ .agents/agents', () => {
  const claudeAgent = (name, content) => ({ path: `.claude/agents/${name}`, content });
  const agentsAgent = (name, content) => ({ path: `.agents/agents/${name}`, content });

  it('reports an in-sync pair as ok', () => {
    const result = analyze([
      claudeAgent('po-evidence.md', 'same bytes'),
      agentsAgent('po-evidence.md', 'same bytes'),
    ]);
    assert.equal(result.checks.agentCopy.status, 'ok');
    assert.equal(result.checks.agentCopy.comparedFiles, 1);
    assert.equal(result.checks.agentCopy.divergedFiles, 0);
    assert.deepEqual(result.drift, []);
  });

  it('flags byte divergence and marks both physical files', () => {
    const result = analyze([
      claudeAgent('design-lead.md', 'version A'),
      agentsAgent('design-lead.md', 'version B — drifted'),
    ]);
    assert.equal(result.checks.agentCopy.status, 'drift');
    assert.ok(driftCodes(result).includes('agent-copy:agent-copy-diverged:design-lead.md'));
    const byPath = new Map(result.records.map((r) => [r.path, r.drift]));
    assert.deepEqual(byPath.get('.claude/agents/design-lead.md'), ['agent-copy-diverged']);
    assert.deepEqual(byPath.get('.agents/agents/design-lead.md'), ['agent-copy-diverged']);
  });

  it('flags a seat that exists in only one tree', () => {
    const result = analyze([claudeAgent('po-wedge.md', 'claude only')]);
    assert.equal(result.checks.agentCopy.status, 'drift');
    assert.equal(result.checks.agentCopy.oneSidedFiles, 1);
    assert.ok(driftCodes(result).includes('agent-copy:agent-copy-file-missing:po-wedge.md'));
  });

  it('stays not-applicable when neither tree has seats', () => {
    const result = analyze([{ path: '.claude/skills/ontology-sync/SKILL.md', content: 'x' }]);
    assert.equal(result.checks.agentCopy.status, 'not-applicable');
  });
});

describe('agent-files — drift check ③ @reference existence', () => {
  it('accepts refs that resolve against existingPaths or scanned files', () => {
    const result = analyze(
      [{ path: 'AGENTS.md', content: '@docs/DESIGN-SYSTEM.md\n@CLAUDE.md\n' }],
      { existingPaths: ['docs/DESIGN-SYSTEM.md', 'CLAUDE.md'] },
    );
    assert.equal(result.checks.atRefs.status, 'ok');
    assert.equal(result.checks.atRefs.refsChecked, 2);
  });

  it('resolves refs relative to the referencing file as a fallback', () => {
    const result = analyze(
      [{ path: '.claude/rules/forbidden.md', content: 'see @design.md\n' }],
      { existingPaths: ['.claude/rules/design.md'] },
    );
    assert.equal(result.checks.atRefs.status, 'ok');
  });

  it('flags refs that resolve nowhere', () => {
    const result = analyze([{ path: 'AGENTS.md', content: '@docs/GONE.md\n' }]);
    assert.equal(result.checks.atRefs.status, 'drift');
    assert.ok(driftCodes(result).includes('at-refs:at-ref-missing:AGENTS.md'));
    assert.equal(result.drift.find((d) => d.code === 'at-ref-missing')?.detail?.ref, 'docs/GONE.md');
  });

  it('marks dot-path refs unverified instead of missing when the scanner cannot see them', () => {
    const result = analyze(
      [{ path: 'AGENTS.md', content: '@.claude/rules/design.md\n' }],
      { existingPaths: [], unverifiablePrefixes: ['.'] },
    );
    assert.equal(result.checks.atRefs.status, 'ok');
    assert.equal(result.checks.atRefs.unverifiedRefs, 1);
    assert.deepEqual(result.drift, []);
  });

  it('marks refs outside verifiable extensions as unverified', () => {
    const result = analyze(
      [{ path: 'AGENTS.md', content: '@scripts/run.sh\n' }],
      { existingPaths: [], verifiableExtensions: ['.md'] },
    );
    assert.equal(result.checks.atRefs.unverifiedRefs, 1);
    assert.deepEqual(result.drift, []);
  });
});

describe('agent-files — drift check ④ AGENTS.md Codex 32 KiB cap', () => {
  it('passes under the cap and reports the byte count', () => {
    const result = analyze([{ path: 'AGENTS.md', content: 'small' }]);
    assert.equal(result.checks.codexSizeCap.status, 'ok');
    assert.equal(result.checks.codexSizeCap.agentsMdBytes, 5);
    assert.equal(result.checks.codexSizeCap.capBytes, CODEX_PROJECT_DOC_CAP_BYTES);
  });

  it('flags AGENTS.md over 32 KiB', () => {
    const result = analyze([{ path: 'AGENTS.md', content: 'x'.repeat(CODEX_PROJECT_DOC_CAP_BYTES + 1) }]);
    assert.equal(result.checks.codexSizeCap.status, 'drift');
    assert.ok(driftCodes(result).includes('codex-size-cap:agents-md-over-codex-cap:AGENTS.md'));
  });

  it('uses scanner-provided bytes over decoded content length', () => {
    const result = analyze([
      { path: 'AGENTS.md', content: 'tiny', bytes: CODEX_PROJECT_DOC_CAP_BYTES + 10 },
    ]);
    assert.equal(result.checks.codexSizeCap.status, 'drift');
  });

  it('is not applicable without AGENTS.md', () => {
    const result = analyze([{ path: 'CLAUDE.md', content: 'x' }]);
    assert.equal(result.checks.codexSizeCap.status, 'not-applicable');
  });
});

describe('agent-files — analyzeAgentFiles result shape', () => {
  it('returns records sorted by path with kind/tools/bytes and per-file drift codes', () => {
    const result = analyze([
      { path: 'CLAUDE.md', content: '@AGENTS.md\n' },
      { path: 'AGENTS.md', content: '# ok\n' },
      { path: '.mcp.json', content: '{}' },
      { path: 'not-an-agent-file.md', content: 'ignored' },
    ]);
    assert.deepEqual(
      result.records.map((r) => r.path),
      ['.mcp.json', 'AGENTS.md', 'CLAUDE.md'],
    );
    for (const record of result.records) {
      assert.ok(Array.isArray(record.tools));
      assert.ok(Array.isArray(record.drift));
      assert.equal(typeof record.bytes, 'number');
      assert.equal(typeof record.kind, 'string');
    }
    assert.equal(result.summary.files, 3);
    assert.equal(result.summary.driftCount, 0);
  });
});

describe('agent-files — English-only agent text', () => {
  const file = (path, content) => ({ path, content });

  it('passes when every scanned agent file is English', () => {
    const result = analyzeAgentFiles({
      requireEnglish: true,
      files: [
        file('CLAUDE.md', '# Project\n\n@AGENTS.md\n'),
        file('AGENTS.md', '# Guide\n'),
        file('.claude/hooks/block-unsafe-git.sh', 'REASON="a force push deletes commits"\n'),
      ],
    });
    assert.equal(result.checks.agentLanguage.status, 'ok');
    assert.equal(result.checks.agentLanguage.flaggedFiles, 0);
    assert.equal(result.checks.agentLanguage.scannedFiles, 3);
  });

  it('flags non-English text wherever it sits, string literals included', () => {
    const result = analyzeAgentFiles({
      requireEnglish: true,
      files: [
        file('AGENTS.md', '# Guide\n'),
        file('.claude/hooks/block-unsafe-git.sh', 'REASON="힘내"\n'),
        file('.claude/settings.json', '{"_comment": "메모"}\n'),
      ],
    });
    assert.equal(result.checks.agentLanguage.status, 'drift');
    assert.equal(result.checks.agentLanguage.flaggedFiles, 2);
    assert.equal(result.checks.agentLanguage.codePoints, 4);
    const paths = result.drift
      .filter((d) => d.check === 'agent-language')
      .map((d) => d.path)
      .sort();
    assert.deepEqual(paths, ['.claude/hooks/block-unsafe-git.sh', '.claude/settings.json']);
    const record = result.records.find((r) => r.path === '.claude/settings.json');
    assert.ok(record.drift.includes('non-english-agent-text'));
  });

  it('catches kana and Han, not only Hangul', () => {
    const result = analyzeAgentFiles({
      requireEnglish: true,
      files: [file('AGENTS.md', 'ok'), file('.claude/rules/git.md', 'テスト 测试')],
    });
    assert.equal(result.checks.agentLanguage.status, 'drift');
    assert.equal(result.checks.agentLanguage.codePoints, 5);
  });

  it('is not applicable when the scanner supplied no contents', () => {
    const result = analyzeAgentFiles({ requireEnglish: true, files: [{ path: 'AGENTS.md', bytes: 10 }] });
    assert.equal(result.checks.agentLanguage.status, 'not-applicable');
  });

  it('leaves localized product data out of the subject set', () => {
    const result = analyzeAgentFiles({
      requireEnglish: true,
      files: [
        file('AGENTS.md', 'ok'),
        file('cli/templates/vault-ko/AGENTS.md', '한국어 템플릿'),
        file('docs/ontology/domains/x.md', 'display_ko: 온톨로지'),
      ],
    });
    assert.equal(result.checks.agentLanguage.status, 'ok');
    assert.equal(result.checks.agentLanguage.scannedFiles, 1);
  });
});


  it('stays off by default — a Korean vault is not this repository', () => {
    const result = analyzeAgentFiles({
      files: [{ path: 'AGENTS.md', content: '이 폴더는 볼트입니다' }],
    });
    assert.equal(result.checks.agentLanguage.status, 'not-applicable');
    assert.equal(result.drift.length, 0);
  });

describe('agent-files — merged Codex instruction budget', () => {
  const file = (path, bytes) => ({ path, content: 'x'.repeat(bytes) });

  it('adds the largest nested AGENTS.md to the root file', () => {
    const result = analyzeAgentFiles({
      files: [file('AGENTS.md', 100), file('src/AGENTS.md', 300), file('cli/AGENTS.md', 200)],
    });
    const cap = result.checks.codexSizeCap;
    assert.equal(cap.status, 'ok');
    assert.equal(cap.nestedFiles, 2);
    assert.equal(cap.worstNestedPath, 'src/AGENTS.md');
    assert.equal(cap.worstCaseBytes, 400);
  });

  it('flags a merge over the cap and blames the nested file that causes it', () => {
    const result = analyzeAgentFiles({
      files: [
        file('AGENTS.md', CODEX_PROJECT_DOC_CAP_BYTES - 10),
        file('src/AGENTS.md', 11),
        file('cli/AGENTS.md', 5),
      ],
    });
    assert.equal(result.checks.codexSizeCap.status, 'drift');
    const finding = result.drift.find((d) => d.check === 'codex-size-cap');
    assert.equal(finding.path, 'src/AGENTS.md');
    assert.match(finding.message, /truncates silently/);
  });

  it('stays under the cap when the root alone fits and nothing is nested', () => {
    const result = analyzeAgentFiles({ files: [file('AGENTS.md', 100)] });
    assert.equal(result.checks.codexSizeCap.status, 'ok');
    assert.equal(result.checks.codexSizeCap.nestedFiles, 0);
    assert.equal(result.checks.codexSizeCap.worstCaseBytes, 100);
  });
});
