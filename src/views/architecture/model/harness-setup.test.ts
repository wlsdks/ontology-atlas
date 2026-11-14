import { beforeAll, describe, expect, it } from 'vitest';

import { scanHarness, type HarnessReport, type HarnessScanPort } from '@/entities/agent-files';

import { buildHarnessSetup, type SetupGroupId, type SetupSectionId } from './harness-setup';

function memoryPort(files: Record<string, string>): HarnessScanPort {
  const paths = Object.keys(files);
  return {
    async listDir(relativePath) {
      const prefix = relativePath ? `${relativePath}/` : '';
      const names = new Map<string, 'file' | 'directory'>();
      for (const path of paths) {
        if (!path.startsWith(prefix) || path === prefix) continue;
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf('/');
        names.set(slash === -1 ? rest : rest.slice(0, slash), slash === -1 ? 'file' : 'directory');
      }
      return names.size > 0 ? [...names].map(([name, kind]) => ({ name, kind })) : null;
    },
    async readText(relativePath) {
      const text = files[relativePath];
      return text === undefined ? null : { text, lastModified: null };
    },
  };
}

const REPO: Record<string, string> = {
  'package.json': JSON.stringify({ scripts: { dev: 'next dev', lint: 'eslint', 'test:cart': 'vitest run src/cart' } }),
  'CLAUDE.md': '@AGENTS.md\n',
  'AGENTS.md': `# Repo\n${'x'.repeat(33 * 1024)}\n`,
  'src/AGENTS.md': '# src\n',
  '.claude/rules/always.md': '# Always\n',
  '.claude/rules/scoped.md': ['---', 'paths:', '  - "src/**"', '---', '# Scoped', ''].join('\n'),
  '.claude/skills/review/SKILL.md': '# review\n',
  '.agents/skills/review/SKILL.md': '# review\n\nCodex copy.\n',
  '.claude/agents/scout.md': '# scout\n',
  '.mcp.json': '{"mcpServers":{}}',
  '.cursorignore': 'secrets/**\n',
  '.claude/hooks/guard.sh': '#!/bin/sh\n',
  '.claude/hooks/format.sh': '#!/bin/sh\n',
  '.claude/hooks/census.sh': '#!/bin/sh\n',
  '.claude/settings.json': JSON.stringify({
    permissions: { deny: ['Read(./.env*)'], ask: ['Bash(git push:*)'] },
    hooks: {
      PreToolUse: [{ hooks: [{ command: '.claude/hooks/guard.sh' }, { command: '.claude/hooks/gone.sh' }] }],
      PostToolUse: [{ hooks: [{ command: '.claude/hooks/format.sh' }, { command: 'npx prettier --write .' }] }],
      SessionStart: [{ hooks: [{ command: '.claude/hooks/census.sh' }] }],
    },
  }),
  '.codex/hooks.json': JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'bash .claude/hooks/guard.sh' }] }] } }),
  '.githooks/pre-commit': '#!/bin/sh\npnpm lint\n',
  '.github/workflows/ci.yml': 'on: push\njobs:\n  test: {}\n',
};

let report: HarnessReport;
beforeAll(async () => {
  report = await scanHarness(memoryPort(REPO));
});

function labelsIn(section: SetupSectionId, group: SetupGroupId, filter: Parameters<typeof buildHarnessSetup>[1] = null) {
  const found = buildHarnessSetup(report, filter)
    .sections.find((entry) => entry.id === section)
    ?.groups.find((entry) => entry.id === group);
  return found?.items.map((item) => item.label) ?? [];
}

describe('buildHarnessSetup', () => {
  it.each<[SetupSectionId, SetupGroupId, string[]]>([
    ['context', 'instructions', ['AGENTS.md', 'CLAUDE.md', 'src/AGENTS.md']],
    ['context', 'rules', ['.claude/rules/always.md', '.claude/rules/scoped.md']],
    ['context', 'skills', ['.agents/skills/review/SKILL.md', '.claude/skills/review/SKILL.md']],
    ['context', 'subagents', ['.claude/agents/scout.md']],
    ['context', 'mcp', ['.mcp.json']],
    ['context', 'ignore', ['.cursorignore']],
    ['context', 'contextHooks', ['.claude/hooks/census.sh']],
    ['guardrails', 'permissions', ['.claude/settings.json']],
    ['guardrails', 'blockingHooks', ['.claude/hooks/gone.sh', '.claude/hooks/guard.sh', '.claude/hooks/guard.sh']],
    ['verification', 'hooks', ['.claude/hooks/format.sh', 'npx prettier --write .']],
    ['verification', 'scripts', ['lint', 'test:cart']],
    ['verification', 'gitHooks', ['pre-commit']],
    ['verification', 'workflows', ['ci.yml']],
  ])('files %s / %s from the scan', (section, group, labels) => {
    expect(labelsIn(section, group).sort()).toEqual(labels);
  });

  it('marks which rules load every session and counts deny and ask rules', () => {
    const setup = buildHarnessSetup(report);
    expect(setup.items.get('file:.claude/rules/always.md')?.loading).toBe('always');
    expect(setup.items.get('file:.claude/rules/scoped.md')?.loading).toBe('path');
    expect(setup.items.get('permissions:.claude/settings.json')?.denyAndAskRuleCount).toBe(2);
    expect(setup.claudeSessionBytes).toBe(
      new TextEncoder().encode(REPO['CLAUDE.md']).length + new TextEncoder().encode(REPO['.claude/rules/always.md']).length,
    );
  });

  it('lists only what a person must fix, each pointing at an item on the page', () => {
    const setup = buildHarnessSetup(report);
    expect(setup.problems.map((problem) => problem.kind).sort()).toEqual([
      'codex-cap',
      'copy-drift',
      'hook-missing',
      'hook-unresolved',
    ]);
    for (const problem of setup.problems) expect(setup.items.has(problem.itemKey)).toBe(true);
  });

  it('narrows every list to one tool while keeping checks no tool claims', () => {
    const setup = buildHarnessSetup(report, 'codex');
    expect(setup.tools).toEqual(expect.arrayContaining(['claude-code', 'codex']));
    expect(labelsIn('context', 'instructions', 'codex').sort()).toEqual(['AGENTS.md', 'src/AGENTS.md']);
    expect(labelsIn('context', 'rules', 'codex')).toEqual([]);
    expect(labelsIn('guardrails', 'blockingHooks', 'codex')).toEqual(['.claude/hooks/guard.sh']);
    expect(labelsIn('verification', 'scripts', 'codex').sort()).toEqual(['lint', 'test:cart']);
    expect(setup.problems.map((problem) => problem.kind).sort()).toEqual(['codex-cap', 'copy-drift']);
    expect(setup.claudeSessionBytes).toBeNull();
  });
});
