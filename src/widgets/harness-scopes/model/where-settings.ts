import type { HarnessReport } from '@/entities/agent-files';
import { hookFilePattern, SCOPE_NAMES, SCOPE_REACH, type ReachScope, type ScopeReach } from '@/entities/agent-scopes';
import type {
  HarnessScopes,
  ScopeFile,
  ScopeOpenFailure,
  ScopePlatform,
  ScopeTool,
} from '@/shared/lib/harness-scopes/tauri-harness-scopes';

/**
 * The "Where settings live" popup's model: for one tool and one kind of setting, the scopes from the
 * widest reach to the narrowest, what each holds now and the sentences that explain it. Vendor
 * facts are the spec's Scope model table; counts come from the files the app read. Pure.
 */

export type WhereKind = 'hooks' | 'permissions' | 'skills' | 'subagents' | 'instructions';

/** A message under the `harness` namespace with its arguments; an argument may be another message. */
export interface MessageRef {
  key: string;
  values?: Readonly<Record<string, string | number | MessageRef | readonly MessageRef[]>>;
}

export type WhereCount =
  | { kind: 'number'; value: number }
  | { kind: 'message'; message: MessageRef };

export interface WhereRow {
  key: string;
  scope: ReachScope;
  name: string;
  reach: ScopeReach;
  picked: boolean;
  /** The short path the stack shows: `~/…`, a repository-relative path or a description. */
  shortPath: string;
  /** Whether `shortPath` is a path rather than a description. */
  pathIsCode: boolean;
  /** The absolute path in the app, the pattern on the web. */
  fullPath: string;
  caption: MessageRef;
  /** `null` on the web, where nothing is read. */
  count: WhereCount | null;
  /** Hooks only: the number the sum line adds. */
  hookCount: number | null;
  affects: MessageRef;
  git: MessageRef;
  now: MessageRef | null;
  differs: MessageRef;
  differsLabel: 'differs' | 'sameName';
  fileNote: MessageRef | null;
  /** The User row of a settings file: another file can be picked from it. */
  canPickAnother: boolean;
}

export interface WhereKindTab {
  kind: WhereKind;
  count: number | null;
}

export interface ProjectListed {
  skills: number;
  subagents: number;
  instructions: number;
  localInstructions: boolean;
}

export const WHERE_KINDS: Readonly<Record<ScopeTool, readonly WhereKind[]>> = Object.freeze({
  'claude-code': ['hooks', 'permissions', 'skills', 'subagents', 'instructions'],
  codex: ['hooks', 'skills', 'subagents', 'instructions'],
});

const STACKS: Readonly<Record<ScopeTool, Readonly<Record<WhereKind, readonly ReachScope[]>>>> = Object.freeze({
  'claude-code': {
    hooks: ['managed', 'user', 'project', 'local'],
    permissions: ['managed', 'user', 'project', 'local'],
    skills: ['managed', 'user', 'project'],
    subagents: ['managed', 'user', 'project'],
    instructions: ['managed', 'user', 'project', 'local'],
  },
  codex: {
    hooks: ['system', 'user', 'project'],
    permissions: [],
    skills: ['admin', 'user', 'project'],
    subagents: ['user', 'project'],
    instructions: ['user', 'project'],
  },
});

const REPOSITORY = '<repository>';

/** Folders and files outside the settings files, as the vendors document them (macOS and Linux). */
const FOLDERS: Readonly<Record<ScopeTool, Partial<Record<WhereKind, Partial<Record<ReachScope, string>>>>>> = {
  'claude-code': {
    skills: { user: '~/.claude/skills/', project: `${REPOSITORY}/.claude/skills/` },
    subagents: { user: '~/.claude/agents/', project: `${REPOSITORY}/.claude/agents/` },
    instructions: {
      user: '~/.claude/CLAUDE.md · ~/.claude/rules/',
      project: `${REPOSITORY}/CLAUDE.md · ${REPOSITORY}/.claude/rules/`,
      local: `${REPOSITORY}/CLAUDE.local.md`,
    },
  },
  codex: {
    skills: { admin: '/etc/codex/skills', user: '~/.agents/skills', project: `${REPOSITORY}/.agents/skills` },
    subagents: { user: '~/.codex/agents/*.toml', project: `${REPOSITORY}/.codex/agents/*.toml` },
    instructions: { user: '~/.codex/AGENTS.md', project: `${REPOSITORY}/AGENTS.md` },
  },
};

/** The environment variable that moves each tool's home settings folder. */
export const CONFIG_VARIABLE: Readonly<Record<ScopeTool, string>> = Object.freeze({
  'claude-code': 'CLAUDE_CONFIG_DIR',
  codex: 'CODEX_HOME',
});

const SETTINGS_FILE_NAME: Readonly<Record<ScopeTool, string>> = Object.freeze({
  'claude-code': 'settings.json',
  codex: 'hooks.json',
});

const SCOPE_FILE_ID: Readonly<Record<ScopeTool, Partial<Record<ReachScope, string>>>> = Object.freeze({
  'claude-code': { managed: 'claude-managed', user: 'claude-user', project: 'claude-project', local: 'claude-local' },
  codex: { system: 'codex-system', user: 'codex-user', project: 'codex-project' },
});

const FAILURE_REASON: Readonly<Record<ScopeOpenFailure, string>> = Object.freeze({
  missing: 'scopes.reason.missing',
  link: 'scopes.reason.link',
  'not-a-file': 'scopes.reason.notAFile',
  'not-a-folder': 'scopes.reason.notAFolder',
  'permission-denied': 'scopes.reason.permissionDenied',
  'too-large': 'scopes.reason.tooLarge',
  io: 'scopes.reason.io',
});

const ref = (key: string, values?: MessageRef['values']): MessageRef => ({ key: `scopes.${key}`, values });

function forPlatform(path: string, platform: ScopePlatform): string {
  if (platform !== 'windows' || path.startsWith('/')) return path;
  return path.replace(/^~\//, '%USERPROFILE%/').replace(/ · ~\//g, ' · %USERPROFILE%/').replace(/\//g, '\\');
}

/** The home folder, known only from a User settings file the app read. */
function homeOf(scopes: HarnessScopes | null): string | null {
  const user = scopes?.files.find((file) => file.id === 'claude-user') ?? scopes?.files.find((file) => file.id === 'codex-user');
  if (!user) return null;
  const match = /^(.*?)[\\/]\.(?:claude|codex)[\\/][^\\/]+$/.exec(user.path);
  return match?.[1] ?? null;
}

function absolute(pattern: string, scopes: HarnessScopes | null, repositoryWord: string): string {
  const home = homeOf(scopes);
  let out = pattern.split(REPOSITORY).join(scopes ? scopes.repository : `<${repositoryWord}>`);
  if (home) out = out.replace(/(^|· )(?:~|%USERPROFILE%)(?=[\\/])/g, `$1${home}`);
  return out;
}

function shortOf(pattern: string): string {
  if (pattern.startsWith(`${REPOSITORY}/`) || pattern.startsWith(`${REPOSITORY}\\`)) {
    return pattern.split(`${REPOSITORY}/`).join('').split(`${REPOSITORY}\\`).join('');
  }
  if (pattern.startsWith('~') || pattern.startsWith('%USERPROFILE%')) return pattern;
  return pattern.split(/[\\/]/).pop() ?? pattern;
}

function caption(tool: ScopeTool, kind: WhereKind, scope: ReachScope): MessageRef {
  if (scope === 'admin' || scope === 'system') return ref('caption.system');
  if (scope === 'project' && tool === 'codex' && kind === 'hooks') return ref('caption.projectCodex');
  return ref(`caption.${scope}`);
}

function affects(tool: ScopeTool, kind: WhereKind, scope: ReachScope): MessageRef {
  if (scope === 'admin' || scope === 'system') return ref('affects.system');
  if (scope === 'project' && tool === 'codex' && kind === 'hooks') return ref('affects.projectCodex');
  return ref(`affects.${scope}`);
}

function git(kind: WhereKind, scope: ReachScope, scopes: HarnessScopes | null): MessageRef {
  if (scope === 'managed' || scope === 'system' || scope === 'admin') return ref('git.outside');
  if (scope === 'user') return ref('git.user');
  if (scope === 'project') return ref('git.project');
  if (kind === 'instructions') return ref('git.localInstructions');
  const local = scopes?.localFileGit;
  return local && (local.tracked || !local.ignored) ? ref('git.localTracked') : ref('git.local');
}

function differs(tool: ScopeTool, kind: WhereKind, scope: ReachScope): Pick<WhereRow, 'differs' | 'differsLabel'> {
  const same = (key: string) => ({ differs: ref(`same.${key}`), differsLabel: 'sameName' as const });
  if (tool === 'claude-code' && kind === 'skills') {
    return same(`claudeSkills${SCOPE_NAMES[scope]}`);
  }
  if (tool === 'claude-code' && kind === 'subagents') {
    return same(`claudeSubagents${SCOPE_NAMES[scope]}`);
  }
  if (tool === 'codex' && kind === 'skills') return same('codexSkills');
  const plain = (key: string) => ({ differs: ref(`differs.${key}`), differsLabel: 'differs' as const });
  if (scope === 'managed' && kind === 'instructions') return plain('managedInstructions');
  if (scope === 'managed' || scope === 'system' || scope === 'admin') return plain('fixed');
  if (tool === 'codex' && (scope === 'user' || scope === 'project')) return plain(`${scope}Codex`);
  return plain(scope);
}

function permissionParts(file: ScopeFile): MessageRef[] {
  const counts = file.permissionCounts;
  if (!counts) return [];
  return (
    [
      ['deny', 'permissionDeny'],
      ['ask', 'permissionAsk'],
      ['allow', 'permissionAllow'],
    ] as const
  )
    .filter(([list]) => counts[list] > 0)
    .map(([list, key]) => ({ key, values: { count: counts[list] } }));
}

function permissionTotal(file: ScopeFile): number {
  const counts = file.permissionCounts;
  return counts ? counts.allow + counts.ask + counts.deny : 0;
}

/** What a settings file holds now, and the short form the stack shows. */
function settingsFileFacts(
  file: ScopeFile | undefined,
  kind: 'hooks' | 'permissions',
  scope: ReachScope,
): Pick<WhereRow, 'count' | 'now' | 'hookCount'> {
  if (!file || file.status === 'missing') {
    const inRepository = scope === 'project' || scope === 'local';
    return {
      count: { kind: 'message', message: ref('count.none') },
      now: ref(inRepository ? 'now.missingProject' : 'now.missing'),
      hookCount: 0,
    };
  }
  if (file.status === 'invalid') {
    return {
      count: { kind: 'message', message: ref('count.invalid') },
      now: ref('now.invalid', { file: file.path }),
      hookCount: null,
    };
  }
  if (file.status === 'unreadable') {
    return {
      count: { kind: 'message', message: ref('count.unreadable') },
      now: ref('now.unreadable', { file: file.path, reason: { key: FAILURE_REASON[file.failure ?? 'io'] } }),
      hookCount: null,
    };
  }
  if (kind === 'hooks') {
    return {
      count: { kind: 'number', value: file.hooks.length },
      now: ref('now.hooks', { count: file.hooks.length }),
      hookCount: file.hooks.length,
    };
  }
  const parts = permissionParts(file);
  return {
    count: parts.length > 0 ? { kind: 'message', message: parts[0]! } : { kind: 'number', value: 0 },
    now: parts.length > 0 ? ref('now.permissions', { counts: parts }) : ref('now.noPermissions'),
    hookCount: null,
  };
}

function listedFacts(
  kind: Exclude<WhereKind, 'hooks' | 'permissions'>,
  scope: ReachScope,
  listed: ProjectListed | null,
  groupName: MessageRef,
): Pick<WhereRow, 'count' | 'now' | 'hookCount'> {
  const unread = { kind: 'message' as const, message: ref('count.unread') };
  if (scope === 'managed' || scope === 'admin') {
    return { count: unread, now: ref(kind === 'instructions' ? 'now.notReadFile' : 'now.notReadFolder'), hookCount: null };
  }
  if (scope === 'user') return { count: unread, now: ref('now.homeUnread'), hookCount: null };
  if (!listed) return { count: null, now: null, hookCount: null };
  if (scope === 'local') {
    return listed.localInstructions
      ? { count: { kind: 'number', value: 1 }, now: ref('now.listed', { count: 1, group: groupName }), hookCount: null }
      : { count: { kind: 'message', message: ref('count.none') }, now: ref('now.missingProject'), hookCount: null };
  }
  const count = listed[kind];
  return { count: { kind: 'number', value: count }, now: ref('now.listed', { count, group: groupName }), hookCount: null };
}

const GROUP_OF: Readonly<Record<Exclude<WhereKind, 'hooks' | 'permissions'>, string>> = Object.freeze({
  skills: 'groups.skills',
  subagents: 'groups.subagents',
  instructions: 'groups.instructions',
});

/**
 * One row per scope of `tool` for `kind`, widest reach first, with picked files after User.
 * `scopes` is `null` on the web: rows then carry patterns and no counts. O(scopes × files).
 */
export function whereRows({
  tool,
  kind,
  platform,
  scopes,
  listed,
  repositoryWord,
}: {
  tool: ScopeTool;
  kind: WhereKind;
  platform: ScopePlatform;
  scopes: HarnessScopes | null;
  listed: ProjectListed | null;
  /** The localized word the web shows inside `<…>` for the repository folder. */
  repositoryWord: string;
}): WhereRow[] {
  const rows: WhereRow[] = [];
  const settings = kind === 'hooks' || kind === 'permissions';
  for (const scope of STACKS[tool][kind]) {
    const base = {
      scope,
      name: SCOPE_NAMES[scope],
      reach: SCOPE_REACH[scope],
      caption: caption(tool, kind, scope),
      affects: affects(tool, kind, scope),
      git: git(kind, scope, scopes),
      ...differs(tool, kind, scope),
    };
    if (settings) {
      const pattern = hookFilePattern(tool, scope as 'managed' | 'system' | 'user' | 'project' | 'local', platform) ?? '';
      const file = scopes?.files.find((entry) => entry.id === SCOPE_FILE_ID[tool][scope] && !entry.picked);
      const facts = scopes ? settingsFileFacts(file, kind, scope) : { count: null, now: null, hookCount: null };
      rows.push({
        ...base,
        key: scope,
        picked: false,
        shortPath: shortOf(pattern),
        pathIsCode: true,
        fullPath: file?.path ?? absolute(pattern, scopes, repositoryWord),
        ...facts,
        fileNote:
          tool === 'codex' && scope === 'project' ? ref('note.codexProject')
          : tool === 'claude-code' && scope === 'local' ? ref('note.localWorktree')
          : null,
        canPickAnother: scope === 'user' && scopes !== null,
      });
      if (scope === 'user' && scopes) {
        for (const picked of scopes.files.filter((entry) => entry.picked && entry.tool === tool)) {
          rows.push({
            ...base,
            key: picked.id,
            picked: true,
            shortPath: picked.path,
            pathIsCode: true,
            fullPath: picked.path,
            caption: { key: 'scopes.picked' },
            ...settingsFileFacts(picked, kind, scope),
            affects: ref('affects.picked', { variable: CONFIG_VARIABLE[tool] }),
            differs: ref('differs.picked', { file: shortOf(pattern) }),
            differsLabel: 'differs',
            fileNote: null,
            canPickAnother: false,
          });
        }
      }
      continue;
    }
    const folder = FOLDERS[tool][kind]?.[scope];
    const listedKind = kind as Exclude<WhereKind, 'hooks' | 'permissions'>;
    const facts = scopes
      ? listedFacts(listedKind, scope, listed, { key: GROUP_OF[listedKind] })
      : { count: null, now: null, hookCount: null };
    const described = folder === undefined;
    const pattern = folder ? forPlatform(folder, platform) : '';
    rows.push({
      ...base,
      key: scope,
      picked: false,
      shortPath: described ? '' : shortOf(pattern),
      pathIsCode: !described,
      fullPath: described ? '' : absolute(pattern, scopes, repositoryWord),
      ...facts,
      fileNote: null,
      canPickAnother: false,
    });
  }
  return rows;
}

/** The organisation's folder a Managed row names in words, since no path is documented. */
export function describedPath(kind: WhereKind): MessageRef | null {
  if (kind === 'skills' || kind === 'subagents' || kind === 'instructions') return ref(`org.${kind}`);
  return null;
}

/** The kinds of `tool` with the counts the tabs show: hooks and permission rules in the app only. */
export function whereKindTabs(tool: ScopeTool, scopes: HarnessScopes | null): WhereKindTab[] {
  const files = (scopes?.files ?? []).filter((file) => file.tool === tool && file.status === 'read');
  return WHERE_KINDS[tool].map((kind) => ({
    kind,
    count:
      !scopes ? null
      : kind === 'hooks' ? files.reduce((sum, file) => sum + file.hooks.length, 0)
      : kind === 'permissions' ? files.reduce((sum, file) => sum + permissionTotal(file), 0)
      : null,
  }));
}

const SKILL_FOLDER = /^(?:\.claude|\.agents)\/skills\/([^/]+)\//;

/** The repository's own skills, subagents and instruction files for `tool`, as Setup lists them. */
export function projectListed(report: HarnessReport, tool: ScopeTool): ProjectListed {
  const records = report.analysis.records.filter((record) => record.tools.includes(tool));
  const skillFolders = new Set(
    records.filter((record) => record.kind === 'skill').map((record) => SKILL_FOLDER.exec(record.path)?.[1] ?? record.path),
  );
  return {
    skills: skillFolders.size,
    subagents: records.filter((record) => record.kind === 'agent').length,
    instructions: records.filter(
      (record) => (record.kind === 'instructions' || record.kind === 'rules') && record.path !== 'CLAUDE.local.md',
    ).length,
    localInstructions: records.some((record) => record.path === 'CLAUDE.local.md'),
  };
}

/** The combining rule's message keys for one tool and kind. */
export function combineKeys(tool: ScopeTool, kind: WhereKind): { lead: string; body: string } {
  const name = `${tool === 'codex' ? 'codex' : 'claude'}${kind[0]!.toUpperCase()}${kind.slice(1)}`;
  return { lead: `scopes.combine.${name}.lead`, body: `scopes.combine.${name}.body` };
}

/** What one kind is, in the tool's words. */
export function whatKey(tool: ScopeTool, kind: WhereKind): string {
  if (kind === 'subagents' || kind === 'instructions') {
    return `scopes.what.${tool === 'codex' ? 'codex' : 'claude'}${kind[0]!.toUpperCase()}${kind.slice(1)}`;
  }
  return `scopes.what.${kind}`;
}

/** The host the web is running on, for the patterns it shows; the app reports its own. */
export function guessPlatform(userAgent: string): ScopePlatform {
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macos';
  return 'linux';
}

/** The settings file name a picked file must carry for `tool`. */
export function settingsFileName(tool: ScopeTool): string {
  return SETTINGS_FILE_NAME[tool];
}
