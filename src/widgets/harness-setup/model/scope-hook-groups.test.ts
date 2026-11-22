import { describe, expect, it } from 'vitest';

import type { HarnessScopes, ScopeFile, ScopeHook } from '@/shared/lib/harness-scopes/tauri-harness-scopes';

import { displayPath, hookTitle, scopeHookGroups } from './scope-hook-groups';

function hook(event: string, command: string): ScopeHook {
  return { event, group: 0, handler: 0, matcher: null, kind: 'command', command, timeoutSeconds: null, async: null };
}

function file(id: string, tool: ScopeFile['tool'], scope: ScopeFile['scope'], path: string, hooks: ScopeHook[]): ScopeFile {
  return {
    id, tool, scope, path, picked: false, status: 'read', failure: null, bytes: 2, modifiedMs: 0,
    hooks, hooksTruncated: 0, unknownEvents: 0, disableAllHooks: null, allowManagedHooksOnly: null, permissionCounts: null,
  };
}

const scopes: HarnessScopes = {
  platform: 'macos',
  repository: '/repo',
  files: [
    file('claude-user', 'claude-code', 'user', '/home/me/.claude/settings.json', [hook('PreToolUse', 'bash ~/.claude/hooks/a.sh pre'), hook('Stop', 'b')]),
    file('claude-project', 'claude-code', 'project', '/repo/.claude/settings.json', [hook('PreToolUse', 'node scripts/guard.mjs')]),
    file('codex-user', 'codex', 'user', '/home/me/.codex/hooks.json', [hook('PreToolUse', 'c')]),
  ],
  inlineHooks: [],
  worktree: { linked: false, unusedLocalFile: null },
  localFileGit: null,
};

describe('scopeHookGroups', () => {
  it('sorts every file’s hooks into the step its event belongs to, the repository’s file first', () => {
    const groups = scopeHookGroups(scopes, null);
    const blocking = groups.get('blockingHooks');
    expect(blocking?.count).toBe(3);
    expect(blocking?.headings.map((heading) => heading.file.id)).toEqual(['claude-project', 'claude-user', 'codex-user']);
  });

  it('keeps only the filtered tool’s files', () => {
    expect(scopeHookGroups(scopes, 'codex').get('blockingHooks')?.headings.map((heading) => heading.file.id)).toEqual(['codex-user']);
  });
});

describe('row text', () => {
  it('names a command hook by the script it runs and a path from the repository or home folder', () => {
    expect(hookTitle(hook('Stop', 'bash ~/.claude/hooks/a.sh pre'))).toBe('~/.claude/hooks/a.sh');
    expect(hookTitle(hook('Stop', 'npx lint-staged'))).toBe('npx lint-staged');
    expect(displayPath('/repo/.claude/settings.json', scopes)).toBe('.claude/settings.json');
    expect(displayPath('/home/me/.codex/hooks.json', scopes)).toBe('~/.codex/hooks.json');
  });
});
