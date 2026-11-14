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
      PostToolUse: [
        { hooks: [{ command: '.claude/hooks/format.sh' }, { command: 'npx prettier --write .' }, { command: '.claude/hooks/gone.sh' }] },
      ],
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
    ['verification', 'hooks', ['.claude/hooks/format.sh', '.claude/hooks/gone.sh', 'npx prettier --write .']],
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
    expect(setup.items.get('permissions:.claude/settings.json')?.permissionCounts).toEqual({ allow: 0, ask: 1, deny: 1 });
  });

  it('counts the AGENTS.md that CLAUDE.md imports in what Claude Code reads at session start', () => {
    const size = (path: string) => new TextEncoder().encode(REPO[path]).length;
    const setup = buildHarnessSetup(report, 'claude-code');
    expect(setup.claudeSessionBytes).toBe(size('CLAUDE.md') + size('.claude/rules/always.md') + size('AGENTS.md'));
    expect(labelsIn('context', 'instructions', 'claude-code').sort()).toEqual(['AGENTS.md', 'CLAUDE.md']);
    expect(setup.items.get('file:AGENTS.md')?.importedByClaudeMd).toBe(true);
    expect(setup.items.get('file:src/AGENTS.md')?.importedByClaudeMd).toBeUndefined();
  });

  it('lists only what a person must fix, one row per missing script however many events name it', () => {
    const setup = buildHarnessSetup(report);
    expect(setup.problems.map((problem) => problem.kind).sort()).toEqual(['codex-cap', 'hook-missing']);
    for (const problem of setup.problems) expect(setup.items.has(problem.itemKey)).toBe(true);
  });

  it('shows a command that runs no script as written, with no status to judge', () => {
    const command = buildHarnessSetup(report)
      .sections.flatMap((section) => section.groups.flatMap((group) => group.items))
      .find((item) => item.label === 'npx prettier --write .');
    expect(command?.hookStatus).toBe('unresolved');
    expect(buildHarnessSetup(report).problems.some((problem) => problem.itemKey === command?.key)).toBe(false);
  });

  it('names the twin a differing copy differs from, and gives a copy with no twin no such fact', () => {
    const setup = buildHarnessSetup(report);
    expect(setup.items.get('file:.claude/skills/review/SKILL.md')?.differsFrom).toBe('codex');
    expect(setup.items.get('file:.agents/skills/review/SKILL.md')?.differsFrom).toBe('claude-code');
    expect(setup.items.get('file:.claude/agents/scout.md')?.differsFrom).toBeUndefined();
  });

  it('narrows every list to one tool while keeping checks no tool claims', () => {
    const setup = buildHarnessSetup(report, 'codex');
    expect(setup.tools).toEqual(expect.arrayContaining(['claude-code', 'codex']));
    expect(labelsIn('context', 'instructions', 'codex').sort()).toEqual(['AGENTS.md', 'src/AGENTS.md']);
    expect(labelsIn('context', 'rules', 'codex')).toEqual([]);
    expect(labelsIn('guardrails', 'blockingHooks', 'codex')).toEqual(['.claude/hooks/guard.sh']);
    expect(labelsIn('verification', 'scripts', 'codex').sort()).toEqual(['lint', 'test:cart']);
    expect(setup.problems.map((problem) => problem.kind)).toEqual(['codex-cap']);
    expect(setup.claudeSessionBytes).toBeNull();
  });
});

describe('buildHarnessSetup — hooks are sorted by the step their event runs in', () => {
  async function setupOf(settings: unknown, extra: Record<string, string> = {}) {
    const files = { '.claude/settings.json': JSON.stringify(settings), '.claude/hooks/h.sh': '#!/bin/sh\n', ...extra };
    return buildHarnessSetup(await scanHarness(memoryPort(files)));
  }

  function groupsOf(setup: ReturnType<typeof buildHarnessSetup>) {
    return setup.sections.flatMap((section) =>
      [...section.groups, ...(section.other ? [section.other] : [])].map((group) => ({ section: section.id, group })),
    );
  }

  function placeOf(setup: ReturnType<typeof buildHarnessSetup>, label: string): string[] {
    return groupsOf(setup)
      .filter(({ group }) => group.items.some((item) => item.label === label))
      .map(({ section, group }) => `${section}/${group.id}`);
  }

  it.each([
    ['UserPromptSubmit', 'context/contextHooks'],
    ['SessionStart', 'context/contextHooks'],
    ['PreToolUse', 'guardrails/blockingHooks'],
    ['PermissionRequest', 'guardrails/blockingHooks'],
    ['PreCompact', 'guardrails/blockingHooks'],
    ['PostToolUse', 'verification/hooks'],
    ['Stop', 'verification/hooks'],
    ['SubagentStop', 'verification/hooks'],
    ['Notification', 'verification/otherHooks'],
  ])('files a %s hook under %s', async (event, place) => {
    const setup = await setupOf({ hooks: { [event]: [{ hooks: [{ command: '.claude/hooks/h.sh' }] }] } });
    expect(placeOf(setup, '.claude/hooks/h.sh')).toEqual([place]);
  });

  it('keeps an unknown event out of what Verification counts as checks', async () => {
    const setup = await setupOf({ hooks: { Notification: [{ hooks: [{ command: '.claude/hooks/h.sh' }] }] } });
    const verification = setup.sections.find((section) => section.id === 'verification');
    expect(verification?.other?.items).toHaveLength(1);
    expect(verification?.total).toBe(0);
  });

  it('files a hook behind a matcher by its event alone', async () => {
    const setup = await setupOf({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ command: '.claude/hooks/h.sh' }] }] },
    });
    expect(placeOf(setup, '.claude/hooks/h.sh')).toEqual(['guardrails/blockingHooks']);
  });

  it('gives a script named on two events a row per event and one problem when it is missing', async () => {
    const setup = await setupOf({
      hooks: {
        PreToolUse: [{ hooks: [{ command: '.claude/hooks/gone.sh' }] }],
        Stop: [{ hooks: [{ command: '.claude/hooks/gone.sh' }] }],
      },
    });
    expect(placeOf(setup, '.claude/hooks/gone.sh')).toEqual(['guardrails/blockingHooks', 'verification/hooks']);
    expect(setup.problems.map((problem) => problem.kind)).toEqual(['hook-missing']);
  });

  it('draws no hook group for a config that names no hooks', async () => {
    const setup = await setupOf({ hooks: {} });
    const hookGroups = groupsOf(setup).filter(({ group }) => /hooks$/i.test(group.id) && group.id !== 'gitHooks');
    expect(hookGroups).toEqual([]);
  });

  it('counts a settings file with only allow rules as allow rules, with no deny or ask', async () => {
    const setup = await setupOf({ permissions: { allow: ['Bash(pnpm test:*)', 'Read(./src/**)'] } });
    expect(setup.items.get('permissions:.claude/settings.json')?.permissionCounts).toEqual({ allow: 2, ask: 0, deny: 0 });
  });
});
