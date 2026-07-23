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
      ['AGENTS.md', 'agents-md', 'instructions', ['codex', 'cursor', 'gemini-cli']],
      ['GEMINI.md', 'gemini-md', 'instructions', ['gemini-cli']],
      ['.claude/rules/design.md', 'claude-rules', 'rules', ['claude-code']],
      ['.claude/skills/ontology-sync/SKILL.md', 'claude-skills', 'skill', ['claude-code']],
      ['.claude/agents/design-guardian.md', 'claude-agents', 'agent', ['claude-code']],
      ['.agents/skills/ontology-sync/SKILL.md', 'agents-skills', 'skill', ['codex']],
      ['.cursor/rules/base.mdc', 'cursor-rules', 'rules', ['cursor']],
      ['.cursorrules', 'cursorrules', 'rules', ['cursor']],
      ['.github/copilot-instructions.md', 'copilot-instructions', 'instructions', ['copilot']],
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
      '.claude/settings.json',
      '.cursor/rules/base.md', // cursor rules must be .mdc
      'nested/CLAUDE.md', // repo-root slice: root files only
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
