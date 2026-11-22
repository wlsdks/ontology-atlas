import type {
  HarnessScopes,
  ScopeFile,
  ScopeHook,
} from '@/shared/lib/harness-scopes/tauri-harness-scopes';

const FILE_PLACES: Record<string, Pick<ScopeFile, 'tool' | 'scope' | 'path'>> = {
  'claude-project': { tool: 'claude-code', scope: 'project', path: '/repo/.claude/settings.json' },
  'claude-local': { tool: 'claude-code', scope: 'local', path: '/repo/.claude/settings.local.json' },
  'claude-user': { tool: 'claude-code', scope: 'user', path: '/home/.claude/settings.json' },
  'claude-managed': {
    tool: 'claude-code',
    scope: 'managed',
    path: '/Library/Application Support/ClaudeCode/managed-settings.json',
  },
  'codex-project': { tool: 'codex', scope: 'project', path: '/repo/.codex/hooks.json' },
  'codex-user': { tool: 'codex', scope: 'user', path: '/home/.codex/hooks.json' },
  'codex-system': { tool: 'codex', scope: 'system', path: '/etc/codex/hooks.json' },
  'picked-1': { tool: 'claude-code', scope: 'user', path: '/profiles/work/settings.json' },
};

export function testHook(event: string, command: string, overrides: Partial<ScopeHook> = {}): ScopeHook {
  return {
    event,
    group: 0,
    handler: 0,
    matcher: null,
    kind: 'command',
    command,
    timeoutSeconds: null,
    async: null,
    ...overrides,
  };
}

export function testFile(id: string, overrides: Partial<ScopeFile> = {}): ScopeFile {
  return {
    id,
    ...FILE_PLACES[id]!,
    picked: id.startsWith('picked-'),
    status: 'read',
    failure: null,
    bytes: 2,
    modifiedMs: 0,
    hooks: [],
    disableAllHooks: null,
    allowManagedHooksOnly: null,
    permissionCounts: null,
    ...overrides,
  };
}

export function testScopes(overrides: Partial<HarnessScopes> = {}): HarnessScopes {
  return {
    platform: 'macos',
    repository: '/repo',
    files: [],
    inlineHooks: [],
    worktree: { linked: false, unusedLocalFile: null },
    localFileGit: { tracked: false, ignored: true },
    ...overrides,
  };
}
