import { describe, expect, it } from 'vitest';

import type { HarnessScopes, ScopeFile } from '@/shared/lib/harness-scopes/tauri-harness-scopes';

import { whereKindTabs, whereRows } from './where-settings';

const hook = { event: 'Stop', group: 0, handler: 0, matcher: null, kind: 'command' as const, command: 'x.sh', timeoutSeconds: null, async: null };

function file(id: string, tool: ScopeFile['tool'], scope: ScopeFile['scope'], path: string, extra: Partial<ScopeFile> = {}): ScopeFile {
  return {
    id, tool, scope, path, picked: false, status: 'read', failure: null, bytes: 2, modifiedMs: 0,
    hooks: [], disableAllHooks: null, allowManagedHooksOnly: null, permissionCounts: null, ...extra,
  };
}

const scopes: HarnessScopes = {
  platform: 'macos',
  repository: '/repo',
  files: [
    file('claude-project', 'claude-code', 'project', '/repo/.claude/settings.json', { hooks: [hook], permissionCounts: { allow: 0, ask: 0, deny: 3 } }),
    file('claude-local', 'claude-code', 'local', '/repo/.claude/settings.local.json', { status: 'missing', bytes: null }),
    file('claude-user', 'claude-code', 'user', '/home/me/.claude/settings.json', { hooks: [hook, hook] }),
    file('claude-managed', 'claude-code', 'managed', '/Library/Application Support/ClaudeCode/managed-settings.json', { status: 'invalid' }),
    file('picked-1', 'claude-code', 'user', '/profiles/work/settings.json', { picked: true, hooks: [hook] }),
  ],
  inlineHooks: [],
  worktree: { linked: false, unusedLocalFile: null },
  localFileGit: { tracked: true, ignored: false },
};

describe('whereRows', () => {
  it('names patterns with no counts on the web, where nothing is read', () => {
    const rows = whereRows({ tool: 'claude-code', kind: 'hooks', platform: 'windows', scopes: null, listed: null, repositoryWord: 'repo' });
    expect(rows.map((row) => row.name)).toEqual(['Managed', 'User', 'Project', 'Local']);
    expect(rows.every((row) => row.count === null && row.now === null)).toBe(true);
    expect(rows.find((row) => row.scope === 'user')?.fullPath).toBe('%USERPROFILE%\\.claude\\settings.json');
    expect(rows.find((row) => row.scope === 'project')?.fullPath).toBe('<repo>\\.claude\\settings.json');
  });

  it('counts what each file holds, puts a picked file after User and states each failure', () => {
    const rows = whereRows({ tool: 'claude-code', kind: 'hooks', platform: 'macos', scopes, listed: null, repositoryWord: 'repo' });
    expect(rows.map((row) => row.key)).toEqual(['managed', 'user', 'picked-1', 'project', 'local']);
    expect(rows.map((row) => row.hookCount)).toEqual([null, 2, 1, 1, 0]);
    expect(rows[0]?.now?.key).toBe('scopes.now.invalid');
    expect(rows.find((row) => row.key === 'local')?.now?.key).toBe('scopes.now.missingProject');
    /* Git tracks the Local file here, so the popup does not claim it stays on this computer. */
    expect(rows.find((row) => row.key === 'local')?.git.key).toBe('scopes.git.localTracked');
    expect(rows.find((row) => row.key === 'user')?.canPickAnother).toBe(true);
  });

  it('gives permission rules their counts and never their text', () => {
    const project = whereRows({ tool: 'claude-code', kind: 'permissions', platform: 'macos', scopes, listed: null, repositoryWord: 'repo' })
      .find((row) => row.key === 'project');
    expect(project?.count).toEqual({ kind: 'message', message: { key: 'permissionDeny', values: { count: 3 } } });
    expect(project?.now?.key).toBe('scopes.now.permissions');
  });

  it('says which scope wins a shared name for Claude Code skills, and Codex has no permission rules', () => {
    const skills = whereRows({ tool: 'claude-code', kind: 'skills', platform: 'macos', scopes, listed: { skills: 4, subagents: 0, instructions: 0, localInstructions: false }, repositoryWord: 'repo' });
    expect(skills.map((row) => row.differs.key)).toEqual([
      'scopes.same.claudeSkillsManaged',
      'scopes.same.claudeSkillsUser',
      'scopes.same.claudeSkillsProject',
    ]);
    expect(skills.find((row) => row.scope === 'project')?.count).toEqual({ kind: 'number', value: 4 });
    expect(whereKindTabs('codex', scopes).map((tab) => tab.kind)).not.toContain('permissions');
    expect(whereKindTabs('claude-code', scopes).slice(0, 2)).toEqual([
      { kind: 'hooks', count: 4 },
      { kind: 'permissions', count: 3 },
    ]);
  });
});
