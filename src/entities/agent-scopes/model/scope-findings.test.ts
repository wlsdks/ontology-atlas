import { describe, expect, it } from 'vitest';

import { scopeFindings, scopeHookKey } from './scope-findings';
import { testFile, testHook, testScopes } from './test-scopes';

const isGuardrailEvent = (event: string) => event === 'PreToolUse';

function findings(scopes: ReturnType<typeof testScopes>) {
  const { lines, tags } = scopeFindings(scopes, isGuardrailEvent);
  return { lines, tags: Object.fromEntries(tags) };
}

describe('what Setup points out', () => {
  it('draws nothing when no file shows a fact', () => {
    expect(findings(testScopes({ files: [testFile('claude-project', { hooks: [testHook('Stop', 'a.sh')] })] })))
      .toEqual({ lines: [], tags: {} });
  });

  it('counts hooks set outside the repository and selects the first', () => {
    const scopes = testScopes({
      files: [
        testFile('claude-managed', { hooks: [testHook('Stop', 'org.sh')] }),
        testFile('claude-user', { hooks: [testHook('Stop', 'a.sh'), testHook('Stop', 'b.sh', { handler: 1 })] }),
      ],
    });
    expect(findings(scopes)).toEqual({
      lines: [{ kind: 'outside', count: 3, first: { fileId: 'claude-user', hookKey: 'claude-user:Stop:0:0' } }],
      tags: {},
    });
  });

  it('tags the same Claude Code hook in two files, and only that hook', () => {
    const same = testHook('PreToolUse', 'guard.sh', { matcher: 'Bash' });
    const scopes = testScopes({
      files: [
        testFile('claude-project', { hooks: [same, testHook('PreToolUse', 'guard.sh', { handler: 1 })] }),
        testFile('claude-local', { hooks: [same] }),
      ],
    });
    expect(findings(scopes)).toEqual({
      lines: [],
      tags: {
        'claude-project:PreToolUse:0:0': [
          { kind: 'two-files', tool: 'claude-code', otherPaths: ['/repo/.claude/settings.local.json'] },
        ],
        'claude-local:PreToolUse:0:0': [
          { kind: 'two-files', tool: 'claude-code', otherPaths: ['/repo/.claude/settings.json'] },
        ],
      },
    });
  });

  it('tags the same Codex command in two files', () => {
    const scopes = testScopes({
      files: [
        testFile('codex-project', { hooks: [testHook('Stop', 'check.sh')] }),
        testFile('codex-user', { hooks: [testHook('Stop', 'check.sh')] }),
      ],
    });
    const { lines, tags } = findings(scopes);
    expect(lines.map((line) => line.kind)).toEqual(['outside']);
    expect(tags['codex-project:Stop:0:0']).toEqual([
      { kind: 'two-files', tool: 'codex', otherPaths: ['/home/.codex/hooks.json'] },
    ]);
  });

  it('says one tool blocks where the other does not', () => {
    const scopes = testScopes({
      files: [
        testFile('claude-project', { hooks: [testHook('PreToolUse', 'guard.sh')] }),
        testFile('codex-project', { hooks: [testHook('Stop', 'check.sh')] }),
      ],
    });
    expect(findings(scopes)).toEqual({
      lines: [{ kind: 'tool-gap', blocking: 'claude-code', unblocked: 'codex' }],
      tags: {},
    });
  });

  it('takes disableAllHooks from the highest file that sets it', () => {
    const allOff = testScopes({
      files: [
        testFile('claude-local', { disableAllHooks: true }),
        testFile('claude-user', { disableAllHooks: false }),
      ],
    });
    expect(findings(allOff)).toEqual({
      lines: [{ kind: 'all-off', fileId: 'claude-local', path: '/repo/.claude/settings.local.json' }],
      tags: {},
    });
    const projectTurnsThemOn = testScopes({
      files: [
        testFile('claude-project', { disableAllHooks: false }),
        testFile('claude-user', { disableAllHooks: true }),
      ],
    });
    expect(findings(projectTurnsThemOn).lines).toEqual([]);
  });

  it('tags a hook Work status added by its helper program', () => {
    const helper = '"/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-agent-state" --event Stop';
    const scopes = testScopes({
      files: [
        testFile('claude-project', {
          hooks: [testHook('Stop', helper), testHook('Stop', 'echo ontology-atlas-agent-state', { handler: 1 })],
        }),
      ],
    });
    expect(findings(scopes)).toEqual({
      lines: [],
      tags: { [scopeHookKey('claude-project', { event: 'Stop', group: 0, handler: 0 })]: [{ kind: 'work-status' }] },
    });
  });

  it('counts the hooks an organisation lock skips', () => {
    const scopes = testScopes({
      files: [
        testFile('claude-managed', { allowManagedHooksOnly: true }),
        testFile('claude-project', { hooks: [testHook('Stop', 'a.sh'), testHook('Stop', 'b.sh', { handler: 1 })] }),
        testFile('claude-local', { hooks: [testHook('Stop', 'c.sh')] }),
      ],
    });
    expect(findings(scopes)).toEqual({ lines: [{ kind: 'managed-only', skippedCount: 3 }], tags: {} });
  });

  it('warns when Git could commit an existing Local file', () => {
    const local = testFile('claude-local');
    expect(findings(testScopes({ files: [local], localFileGit: { tracked: false, ignored: false } }))).toEqual({
      lines: [{ kind: 'local-tracked', path: '/repo/.claude/settings.local.json' }],
      tags: {},
    });
    expect(findings(testScopes({ files: [local], localFileGit: { tracked: true, ignored: true } })).lines).toHaveLength(1);
    const absent = testFile('claude-local', { status: 'missing' });
    expect(findings(testScopes({ files: [absent], localFileGit: { tracked: false, ignored: false } })).lines).toEqual([]);
  });

  it('names the Local file a linked worktree does not use', () => {
    const scopes = testScopes({
      repository: '/wt',
      files: [testFile('claude-local', { status: 'missing', path: '/main/.claude/settings.local.json' })],
      worktree: { linked: true, unusedLocalFile: '/wt/.claude/settings.local.json' },
    });
    expect(findings(scopes)).toEqual({
      lines: [
        {
          kind: 'worktree-local',
          folder: '/wt',
          readFile: '/main/.claude/settings.local.json',
          unusedFile: '/wt/.claude/settings.local.json',
        },
      ],
      tags: {},
    });
  });

  it('names Codex hooks defined inline in config.toml', () => {
    const scopes = testScopes({
      inlineHooks: [
        {
          id: 'codex-user-config',
          tool: 'codex',
          scope: 'user',
          path: '/home/.codex/config.toml',
          status: 'read',
          failure: null,
          events: ['PreToolUse'],
        },
        {
          id: 'codex-project-config',
          tool: 'codex',
          scope: 'project',
          path: '/repo/.codex/config.toml',
          status: 'read',
          failure: null,
          events: [],
        },
      ],
    });
    expect(findings(scopes)).toEqual({
      lines: [{ kind: 'codex-inline', fileId: 'codex-user-config', path: '/home/.codex/config.toml', events: ['PreToolUse'] }],
      tags: {},
    });
  });
});
