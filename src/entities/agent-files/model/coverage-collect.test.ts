import { describe, expect, it } from 'vitest';

import { candidateScopeDeclarations, type CoverageScanInput } from './coverage-collect';
import type { HookConfigFacts } from './hook-wiring';

function input(overrides: Partial<CoverageScanInput> = {}): CoverageScanInput {
  return {
    contents: new Map(),
    hookGroups: [],
    gitHooks: new Map(),
    checkScripts: new Map(),
    workflows: new Map(),
    ...overrides,
  };
}

function wired(configPath: string, events: string, path: string): HookConfigFacts {
  return {
    configPath,
    approvalGate: false,
    hooks: [{ events, ref: { path, command: path }, status: 'wired' }],
  };
}

const hookColumns = (declarations: ReturnType<typeof candidateScopeDeclarations>) =>
  declarations
    .filter((entry) => entry.origin === 'hook')
    .map((entry) => `${entry.id}:${entry.column}`);

describe('candidateScopeDeclarations — hooks are filed by what their event does', () => {
  it('files pre-tool as gated, post-tool as watched, session start and prompt as told', () => {
    const declarations = candidateScopeDeclarations(
      input({
        contents: new Map([
          ['.claude/hooks/a.sh', ''],
          ['.claude/hooks/b.sh', ''],
          ['.claude/hooks/c.sh', ''],
          ['.claude/hooks/d.sh', ''],
        ]),
        hookGroups: [
          wired('.claude/settings.json', 'PreToolUse', '.claude/hooks/a.sh'),
          wired('.claude/settings.json', 'PostToolUse', '.claude/hooks/b.sh'),
          wired('.claude/settings.json', 'SessionStart', '.claude/hooks/c.sh'),
          wired('.claude/settings.json', 'UserPromptSubmit', '.claude/hooks/d.sh'),
        ],
      }),
    );
    expect(hookColumns(declarations)).toEqual([
      '.claude/hooks/a.sh:gated',
      '.claude/hooks/b.sh:watched',
      '.claude/hooks/c.sh:told',
      '.claude/hooks/d.sh:told',
    ]);
  });

  it('reads Codex beforeToolUse as gated', () => {
    const declarations = candidateScopeDeclarations(
      input({
        contents: new Map([['.codex/hooks/g.sh', '']]),
        hookGroups: [wired('.codex/hooks.json', 'beforeToolUse', '.codex/hooks/g.sh')],
      }),
    );
    expect(hookColumns(declarations)).toEqual(['.codex/hooks/g.sh:gated']);
  });

  it('lists a script wired for pre and post in both columns', () => {
    const declarations = candidateScopeDeclarations(
      input({
        contents: new Map([['.claude/hooks/both.sh', '']]),
        hookGroups: [
          wired('.claude/settings.json', 'PreToolUse · PostToolUse', '.claude/hooks/both.sh'),
        ],
      }),
    );
    expect(hookColumns(declarations).sort()).toEqual([
      '.claude/hooks/both.sh:gated',
      '.claude/hooks/both.sh:watched',
    ]);
  });
});

describe('candidateScopeDeclarations — root guides, permissions and exclusions', () => {
  it('tells from root guides with no path, and keeps a nested guide scoped', () => {
    const declarations = candidateScopeDeclarations(
      input({
        contents: new Map([
          ['AGENTS.md', ''],
          ['CLAUDE.md', ''],
          ['src/AGENTS.md', ''],
        ]),
      }),
    );
    const root = declarations.filter((entry) => entry.origin === 'root');
    expect(
      root.map((entry) => `${entry.id}:${entry.column}:${entry.declaresPath}`).sort(),
    ).toEqual(['AGENTS.md:told:false', 'CLAUDE.md:told:false']);
    const nested = declarations.find((entry) => entry.id === 'src/AGENTS.md');
    expect(nested).toMatchObject({ origin: 'nested-agents', scopes: ['src'], declaresPath: true });
  });

  it('files deny and ask rules as one gated entry, and ignores allow-only', () => {
    const settings = JSON.stringify({
      permissions: { allow: ['a', 'b'], deny: ['x', 'y'], ask: ['z'] },
    });
    const withRules = candidateScopeDeclarations(
      input({ contents: new Map([['.claude/settings.json', settings]]) }),
    ).filter((entry) => entry.origin === 'permissions');
    expect(withRules).toHaveLength(1);
    expect(withRules[0]).toMatchObject({
      column: 'gated',
      denyAndAskRuleCount: 3,
      declaresPath: false,
      tools: ['claude-code'],
    });

    const allowOnly = candidateScopeDeclarations(
      input({
        contents: new Map([
          ['.claude/settings.json', JSON.stringify({ permissions: { allow: ['a'] } })],
        ]),
      }),
    );
    expect(allowOnly.some((entry) => entry.origin === 'permissions')).toBe(false);
  });

  it('files an exclusion file as one gated entry with no path', () => {
    const exclusions = candidateScopeDeclarations(
      input({ contents: new Map([['.cursorignore', '']]) }),
    ).filter((entry) => entry.origin === 'exclusion');
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toMatchObject({ column: 'gated', declaresPath: false, scopes: [] });
  });
});

describe('candidateScopeDeclarations — a glob with no literal prefix reaches the root', () => {
  it('declares no path for a rule whose only glob starts with a wildcard', () => {
    const rule = '---\npaths:\n  - "**/*.tsx"\n---\n';
    const [entry] = candidateScopeDeclarations(
      input({ contents: new Map([['.claude/rules/tsx.md', rule]]) }),
    );
    expect(entry).toMatchObject({ declaresPath: false, scopes: [] });
  });

  it('declares no path for a workflow with any root-reaching filter', () => {
    const flat = ['on:', '  push:', '    paths:', "      - '**.ts'", '      - package.json', 'jobs:'].join('\n');
    const braces = ['on:', '  push:', '    paths:', "      - '{src,app}/**'", 'jobs:'].join('\n');
    const entries = candidateScopeDeclarations(
      input({
        workflows: new Map([
          ['.github/workflows/a.yml', flat],
          ['.github/workflows/b.yml', braces],
        ]),
      }),
    );
    expect(entries.map((entry) => entry.declaresPath)).toEqual([false, false]);
  });
});

describe('candidateScopeDeclarations — only files that tell or gate count', () => {
  it('leaves out .cursorrules and .cursorindexingignore', () => {
    const entries = candidateScopeDeclarations(
      input({ contents: new Map([['.cursorrules', ''], ['.cursorindexingignore', '']]) }),
    );
    expect(entries).toEqual([]);
  });
});
