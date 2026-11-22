import type {
  ScopeName,
  ScopePlatform,
  ScopeTool,
} from '@/shared/lib/harness-scopes/tauri-harness-scopes';

interface ScopeFileEntry {
  id: string;
  tool: ScopeTool;
  scope: ScopeName;
  /** How the popup names the file where no absolute path is known, such as on the web. */
  patterns: Readonly<Record<ScopePlatform, string>>;
}

function homeFile(...parts: string[]): Record<ScopePlatform, string> {
  return {
    macos: ['~', ...parts].join('/'),
    linux: ['~', ...parts].join('/'),
    windows: ['%USERPROFILE%', ...parts].join('\\'),
  };
}

function repositoryFile(...parts: string[]): Record<ScopePlatform, string> {
  return {
    macos: ['<repository>', ...parts].join('/'),
    linux: ['<repository>', ...parts].join('/'),
    windows: ['<repository>', ...parts].join('\\'),
  };
}

/** The files `src-tauri/src/harness_scopes/paths.rs` opens, in its order. */
export const SCOPE_FILES: readonly ScopeFileEntry[] = Object.freeze([
  {
    id: 'claude-project',
    tool: 'claude-code',
    scope: 'project',
    patterns: repositoryFile('.claude', 'settings.json'),
  },
  {
    id: 'claude-local',
    tool: 'claude-code',
    scope: 'local',
    patterns: repositoryFile('.claude', 'settings.local.json'),
  },
  { id: 'claude-user', tool: 'claude-code', scope: 'user', patterns: homeFile('.claude', 'settings.json') },
  {
    id: 'claude-managed',
    tool: 'claude-code',
    scope: 'managed',
    patterns: {
      macos: '/Library/Application Support/ClaudeCode/managed-settings.json',
      linux: '/etc/claude-code/managed-settings.json',
      windows: 'C:\\Program Files\\ClaudeCode\\managed-settings.json',
    },
  },
  { id: 'codex-project', tool: 'codex', scope: 'project', patterns: repositoryFile('.codex', 'hooks.json') },
  { id: 'codex-user', tool: 'codex', scope: 'user', patterns: homeFile('.codex', 'hooks.json') },
  {
    id: 'codex-system',
    tool: 'codex',
    scope: 'system',
    patterns: {
      macos: '/etc/codex/hooks.json',
      linux: '/etc/codex/hooks.json',
      windows: '%ProgramData%\\OpenAI\\Codex\\hooks.json',
    },
  },
  {
    id: 'codex-project-config',
    tool: 'codex',
    scope: 'project',
    patterns: repositoryFile('.codex', 'config.toml'),
  },
  { id: 'codex-user-config', tool: 'codex', scope: 'user', patterns: homeFile('.codex', 'config.toml') },
]);

/** Each tool's scopes from the widest reach to the narrowest. The order is not a priority. */
export const SCOPES_BY_REACH: Readonly<Record<ScopeTool, readonly ScopeName[]>> = Object.freeze({
  'claude-code': ['managed', 'user', 'project', 'local'],
  codex: ['system', 'user', 'project'],
});

/** The hook file of one tool's scope as the popup names it, or `null` when the tool has no such scope. */
export function hookFilePattern(tool: ScopeTool, scope: ScopeName, platform: ScopePlatform): string | null {
  const entry = SCOPE_FILES.find(
    (file) => file.tool === tool && file.scope === scope && !file.id.endsWith('-config'),
  );
  return entry ? entry.patterns[platform] : null;
}
