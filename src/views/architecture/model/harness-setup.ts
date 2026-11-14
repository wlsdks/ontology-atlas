import {
  AGENT_TOOL_LABELS,
  hookEventStep,
  isPairDrift,
  type AgentTool,
  type HarnessReport,
  type HookConfigFacts,
  type HookEventStep,
  type ScopeDeclaration,
} from '@/entities/agent-files';

/**
 * The Harness Setup page's model: every scanned artefact sorted by the step of the agent's loop it
 * belongs to (read at start, stop before acting, check afterwards). Nothing here scans; it only
 * regroups `HarnessReport`.
 */

export type SetupSectionId = 'context' | 'guardrails' | 'verification';

export type SetupGroupId =
  | 'instructions'
  | 'rules'
  | 'skills'
  | 'subagents'
  | 'mcp'
  | 'configs'
  | 'ignore'
  | 'contextHooks'
  | 'permissions'
  | 'blockingHooks'
  | 'hooks'
  | 'otherHooks'
  | 'unwiredHooks'
  | 'scripts'
  | 'gitHooks'
  | 'workflows';

type AgentFileRecord = HarnessReport['analysis']['records'][number];

export interface SetupItem {
  /** Unique across the page; also the detail panel's selection key. */
  key: string;
  label: string;
  /** Repo-relative path, or `package.json#<script>` for a script. */
  path: string;
  /** Whether the scan holds this file's text, so the detail can show it. */
  hasContent: boolean;
  /** The agents that read it; empty when none of the listed agents does. */
  tools: readonly AgentTool[];
  /** A check every agent meets whichever one works (a script, a Git hook, CI): no filter hides it. */
  repositoryWide?: boolean;
  bytes: number | null;
  /** The classifier rule, for the detail's cited "what reads it". */
  ruleId: string | null;
  /** Hook event names as the config writes them. */
  events?: string;
  hookStatus?: 'wired' | 'missing' | 'unresolved';
  /** The config that names a hook. */
  namedBy?: string;
  /** Codex runs a new or changed hook only after a person trusts it. */
  approvalGate?: boolean;
  /** Rules only: loaded every session, or only for the paths it lists. */
  loading?: 'always' | 'path';
  /** A settings file's permission rules, counted per list. */
  permissionCounts?: PermissionCounts;
  /** The text that put the item here, quoted from its file. */
  declaration?: string;
  /** A hook script on disk that no hook config names. */
  unwired?: boolean;
  /** Root AGENTS.md when CLAUDE.md imports it: Claude Code reads it through that import. */
  importedByClaudeMd?: boolean;
  /**
   * The tool whose copy of this skill or subagent differs from this one. Information only: the
   * two trees are maintained independently (decision e47518a9), and a file with no twin has none.
   */
  differsFrom?: 'claude-code' | 'codex';
  /** Claude's copy, then Codex's, when both exist and differ. */
  pairPaths?: readonly [string, string];
  /** A skill directory's files, when it has more than one; each is selectable on its own. */
  files?: readonly SetupItem[];
}

export interface PermissionCounts {
  allow: number;
  ask: number;
  deny: number;
}

export interface SetupGroup {
  id: SetupGroupId;
  items: SetupItem[];
  bytes: number;
}

export interface SetupSection {
  id: SetupSectionId;
  groups: SetupGroup[];
  /**
   * Hooks on an event no step names, and hook scripts no config names: shown under Verification,
   * never counted as its checks.
   */
  aside: SetupGroup[];
  total: number;
}

export type SetupProblem =
  | { kind: 'hook-missing'; key: string; itemKey: string; path: string; tools: readonly AgentTool[] }
  | { kind: 'codex-cap'; key: string; itemKey: string; bytes: number; tools: readonly AgentTool[] };

export interface CodexSessionSize {
  used: number;
  cap: number;
  over: boolean;
  /** 0–100, for the bar; capped at 100. */
  percentValue: number;
}

export interface HarnessSetup {
  /** Tools any scanned file names, in `AGENT_TOOL_LABELS` order. */
  tools: AgentTool[];
  sections: SetupSection[];
  problems: SetupProblem[];
  /**
   * CLAUDE.md, every rule with no `paths:`, and root AGENTS.md when CLAUDE.md imports it; null
   * when there is no CLAUDE.md.
   */
  claudeSessionBytes: number | null;
  codexSession: CodexSessionSize | null;
  items: ReadonlyMap<string, SetupItem>;
}

/** `null` shows every tool. */
export type ToolFilter = AgentTool | null;

const SECTION_GROUPS: Readonly<Record<SetupSectionId, readonly SetupGroupId[]>> = Object.freeze({
  context: ['instructions', 'rules', 'skills', 'subagents', 'mcp', 'configs', 'ignore', 'contextHooks'],
  guardrails: ['permissions', 'blockingHooks'],
  verification: ['hooks', 'scripts', 'gitHooks', 'workflows'],
});

const RECORD_GROUP: Readonly<Record<string, SetupGroupId>> = Object.freeze({
  instructions: 'instructions',
  rules: 'rules',
  skill: 'skills',
  agent: 'subagents',
  'mcp-config': 'mcp',
  config: 'configs',
  exclusion: 'ignore',
});

const VERIFICATION_ASIDE: readonly SetupGroupId[] = ['otherHooks', 'unwiredHooks'];

const HOOK_SCRIPT_DIR = /^\.(?:claude|codex)\/hooks\//;

/** A skill is its directory: `SKILL.md` plus whatever it loads beside it. */
const SKILL_DIRECTORY = /^(?:\.claude|\.agents)\/skills\/[^/]+(?=\/)/;

/** Git runs only files with these names; anything else in `.githooks/` is a helper they call. */
const GIT_HOOK_NAMES: ReadonlySet<string> = new Set([
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'pre-merge-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-push',
  'pre-auto-gc',
  'post-rewrite',
  'reference-transaction',
  'push-to-checkout',
  'sendemail-validate',
  'fsmonitor-watchman',
  'post-index-change',
]);

const HOOK_GROUP: Readonly<Record<HookEventStep, SetupGroupId>> = Object.freeze({
  context: 'contextHooks',
  guardrails: 'blockingHooks',
  verification: 'hooks',
  other: 'otherHooks',
});

/** Settings files whose `permissions` lists Claude Code enforces before a tool runs. */
const PERMISSION_FILE = /^\.claude\/settings(?:\.local)?\.json$/;

export function fileItemKey(path: string): string {
  return `file:${path}`;
}

function hookItemKey(group: HookConfigFacts, ref: string, step: HookEventStep): string {
  return `hook:${step}:${group.configPath}:${ref}`;
}

function declarationsById(coverage: readonly ScopeDeclaration[], origin: ScopeDeclaration['origin']) {
  const out = new Map<string, ScopeDeclaration>();
  for (const entry of coverage) if (entry.origin === origin) out.set(entry.id, entry);
  return out;
}

function importsAgentsMd(report: HarnessReport): boolean {
  return report.analysis.checks.claudeAgentsBridge.status === 'ok';
}

function differingPairs(report: HarnessReport): Map<string, readonly [string, string]> {
  const out = new Map<string, readonly [string, string]>();
  for (const finding of report.analysis.drift) {
    const claudePath = finding.detail?.claudePath;
    const agentsPath = finding.detail?.agentsPath;
    if (!isPairDrift(finding.code) || typeof claudePath !== 'string' || typeof agentsPath !== 'string') continue;
    out.set(claudePath, [claudePath, agentsPath]);
    out.set(agentsPath, [claudePath, agentsPath]);
  }
  return out;
}

function fileItem(
  record: AgentFileRecord,
  report: HarnessReport,
  rules: ReadonlyMap<string, ScopeDeclaration>,
  pairs: ReadonlyMap<string, readonly [string, string]>,
): SetupItem {
  const rule = rules.get(record.path);
  const pair = pairs.get(record.path);
  const imported = record.ruleId === 'agents-md' && importsAgentsMd(report);
  return {
    key: fileItemKey(record.path),
    label: record.path,
    path: record.path,
    hasContent: report.contents.has(record.path),
    tools: imported && !record.tools.includes('claude-code') ? [...record.tools, 'claude-code'] : record.tools,
    importedByClaudeMd: imported || undefined,
    bytes: record.bytes,
    ruleId: record.ruleId,
    loading: rule ? (rule.declaration ? 'path' : 'always') : undefined,
    declaration: rule?.declaration || undefined,
    differsFrom: pair ? (record.path === pair[0] ? 'codex' : 'claude-code') : undefined,
    pairPaths: pair,
  };
}

/** One row per script and step: a script named on a guardrail and a check event appears in both. */
function hookItems(report: HarnessReport): Array<{ step: HookEventStep; item: SetupItem }> {
  const toolsByPath = new Map(report.analysis.records.map((record) => [record.path, record.tools]));
  const bytesByPath = new Map(report.analysis.records.map((record) => [record.path, record.bytes]));
  const out: Array<{ step: HookEventStep; item: SetupItem }> = [];
  for (const group of report.hookGroups) {
    const tools = toolsByPath.get(group.configPath) ?? [];
    for (const hook of group.hooks) {
      const ref = hook.ref.path ?? hook.ref.command;
      const byStep = new Map<HookEventStep, string[]>();
      for (const event of hook.events.split(' · ')) {
        const step = hookEventStep(event);
        byStep.set(step, [...(byStep.get(step) ?? []), event]);
      }
      for (const [step, events] of byStep) {
        out.push({
          step,
          item: {
            key: hookItemKey(group, ref, step),
            label: ref,
            path: hook.ref.path ?? group.configPath,
            hasContent: hook.ref.path !== null && report.contents.has(hook.ref.path),
            tools,
            bytes: hook.ref.path ? (bytesByPath.get(hook.ref.path) ?? null) : null,
            ruleId: null,
            events: events.join(' · '),
            hookStatus: hook.status,
            namedBy: group.configPath,
            approvalGate: group.approvalGate || undefined,
            declaration: hook.ref.path ? undefined : hook.ref.command,
          },
        });
      }
    }
  }
  return out;
}

function permissionCounts(text: string): PermissionCounts | null {
  let permissions: unknown;
  try {
    permissions = (JSON.parse(text) as { permissions?: unknown } | null)?.permissions;
  } catch {
    return null;
  }
  if (!permissions || typeof permissions !== 'object') return null;
  const count = (key: keyof PermissionCounts) => {
    const list = (permissions as Record<string, unknown>)[key];
    return Array.isArray(list) ? list.length : 0;
  };
  const counts = { allow: count('allow'), ask: count('ask'), deny: count('deny') };
  return counts.allow + counts.ask + counts.deny > 0 ? counts : null;
}

function permissionItems(report: HarnessReport): SetupItem[] {
  const out: SetupItem[] = [];
  for (const record of report.analysis.records) {
    const text = PERMISSION_FILE.test(record.path) ? report.contents.get(record.path) : undefined;
    const counts = text === undefined ? null : permissionCounts(text);
    if (!counts) continue;
    out.push({
      key: `permissions:${record.path}`,
      label: record.path,
      path: record.path,
      hasContent: true,
      tools: record.tools,
      bytes: null,
      ruleId: null,
      permissionCounts: counts,
    });
  }
  return out;
}

function repositoryChecks(report: HarnessReport): Record<'scripts' | 'gitHooks' | 'workflows', SetupItem[]> {
  const scripts = declarationsById(report.coverage, 'script');
  const gitHooks = declarationsById(report.coverage, 'git-hook');
  const workflows = declarationsById(report.coverage, 'workflow');
  const plain = (key: string, label: string, path: string, declaration: string | undefined): SetupItem => ({
    key,
    label,
    path,
    hasContent: report.contents.has(path),
    tools: [],
    repositoryWide: true,
    bytes: null,
    ruleId: null,
    declaration: declaration || undefined,
  });
  return {
    scripts: report.checks.scripts.map((name) =>
      plain(`script:${name}`, name, `package.json#${name}`, scripts.get(`package.json#${name}`)?.declaration),
    ),
    gitHooks: report.gitHookFiles.filter((name) => GIT_HOOK_NAMES.has(name)).map((name) =>
      plain(`githook:${name}`, name, `.githooks/${name}`, gitHooks.get(`.githooks/${name}`)?.declaration),
    ),
    workflows: report.workflowFiles.map((path) =>
      plain(`workflow:${path}`, path.split('/').pop() ?? path, path, workflows.get(path)?.declaration),
    ),
  };
}

function problemsOf(report: HarnessReport, items: ReadonlyMap<string, SetupItem>): SetupProblem[] {
  const out: SetupProblem[] = [];
  /* A script named on several events is one missing file: one row per config and script. */
  const missing = new Set<string>();
  for (const item of items.values()) {
    if (item.hookStatus !== 'missing') continue;
    const key = `missing:${item.namedBy}:${item.label}`;
    if (missing.has(key)) continue;
    missing.add(key);
    out.push({ kind: 'hook-missing', key, itemKey: item.key, path: item.label, tools: item.tools });
  }
  const cap = report.analysis.checks.codexSizeCap;
  if (cap.status === 'drift' && cap.worstCaseBytes !== null) {
    out.push({
      kind: 'codex-cap',
      key: 'codex-cap',
      itemKey: fileItemKey(cap.worstNestedPath ?? 'AGENTS.md'),
      bytes: cap.worstCaseBytes,
      tools: ['codex'],
    });
  }
  return out;
}

function codexSession(report: HarnessReport): CodexSessionSize | null {
  const cap = report.analysis.checks.codexSizeCap;
  if (cap.worstCaseBytes === null) return null;
  return {
    used: cap.worstCaseBytes,
    cap: cap.capBytes,
    over: cap.status === 'drift',
    percentValue: Math.min(100, Math.round((cap.worstCaseBytes / cap.capBytes) * 100)),
  };
}

function claudeSessionBytes(report: HarnessReport, rules: ReadonlyMap<string, ScopeDeclaration>): number | null {
  const records = report.analysis.records;
  const claudeMd = records.find((record) => record.ruleId === 'claude-md');
  if (!claudeMd) return null;
  const read = records.filter(
    (record) =>
      (record.ruleId === 'claude-rules' && !rules.get(record.path)?.declaration) ||
      (record.ruleId === 'agents-md' && importsAgentsMd(report)),
  );
  return read.reduce((sum, record) => sum + record.bytes, claudeMd.bytes);
}

/** Whether `key` is this item or one of its files. */
export function itemHolds(item: SetupItem, key: string | null): boolean {
  return key !== null && (item.key === key || (item.files ?? []).some((file) => file.key === key));
}

function visibleTo(item: Pick<SetupItem, 'tools' | 'repositoryWide'>, filter: ToolFilter): boolean {
  return filter === null || item.repositoryWide === true || item.tools.includes(filter);
}

/** One row per skill directory; its files stay reachable from the row. */
function skillDirectories(files: readonly SetupItem[]): SetupItem[] {
  const byDirectory = new Map<string, SetupItem[]>();
  for (const file of files) {
    const directory = SKILL_DIRECTORY.exec(file.path)?.[0] ?? file.path;
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), file]);
  }
  return [...byDirectory].map(([directory, inside]) => {
    if (inside.length === 1 && inside[0]?.path === directory) return inside[0];
    const entry = inside.find((file) => file.path.endsWith('/SKILL.md')) ?? inside[0]!;
    const differing = entry.pairPaths ? entry : inside.find((file) => file.pairPaths);
    return {
      key: `skill:${directory}`,
      label: directory,
      path: entry.path,
      hasContent: entry.hasContent,
      tools: entry.tools,
      bytes: inside.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
      ruleId: entry.ruleId,
      differsFrom: differing?.differsFrom,
      pairPaths: differing?.pairPaths,
      files: inside.length > 1 ? inside : undefined,
    };
  });
}

/**
 * O(records + hooks + coverage). With a tool filter, an item another tool reads is left out, and
 * so is a file none of the listed agents reads; a repository-wide check stays.
 */
export function buildHarnessSetup(report: HarnessReport, filter: ToolFilter = null): HarnessSetup {
  const rules = declarationsById(report.coverage, 'rule');
  const pairs = differingPairs(report);
  const byGroup = new Map<SetupGroupId, SetupItem[]>();
  const push = (group: SetupGroupId, item: SetupItem) => {
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  };

  const permissions = permissionItems(report);
  const shownAsPermissions = new Set(permissions.map((item) => item.path));
  const namedScripts = new Set(report.hookGroups.flatMap((group) => group.hooks.map((hook) => hook.ref.path)));
  for (const record of report.analysis.records) {
    if (HOOK_SCRIPT_DIR.test(record.path)) {
      /* A named script is listed under its event; one no config names is listed once, as such. */
      if (!namedScripts.has(record.path)) push('unwiredHooks', { ...fileItem(record, report, rules, pairs), unwired: true });
      continue;
    }
    if (shownAsPermissions.has(record.path)) continue;
    const group = RECORD_GROUP[record.kind];
    if (group) push(group, fileItem(record, report, rules, pairs));
  }
  for (const item of permissions) push('permissions', item);
  for (const { step, item } of hookItems(report)) push(HOOK_GROUP[step], item);
  const checks = repositoryChecks(report);
  for (const item of checks.scripts) push('scripts', item);
  for (const item of checks.gitHooks) push('gitHooks', item);
  for (const item of checks.workflows) push('workflows', item);

  byGroup.set('skills', skillDirectories(byGroup.get('skills') ?? []));

  /* Only what the filter shows, so a selection it hides has nothing to open. */
  const items = new Map<string, SetupItem>();
  const visibleGroup = (id: SetupGroupId): SetupGroup | null => {
    const visible = (byGroup.get(id) ?? []).filter((item) => visibleTo(item, filter));
    if (visible.length === 0) return null;
    for (const item of visible) for (const shown of [item, ...(item.files ?? [])]) items.set(shown.key, shown);
    return { id, items: visible, bytes: visible.reduce((sum, item) => sum + (item.bytes ?? 0), 0) };
  };
  const sections: SetupSection[] = (Object.keys(SECTION_GROUPS) as SetupSectionId[]).map((id) => {
    const groups = SECTION_GROUPS[id].map(visibleGroup).filter((group) => group !== null);
    return {
      id,
      groups,
      aside: id === 'verification' ? VERIFICATION_ASIDE.map(visibleGroup).filter((group) => group !== null) : [],
      total: groups.reduce((sum, group) => sum + group.items.length, 0),
    };
  });

  const found = new Set(report.analysis.records.flatMap((record) => record.tools));
  const tools = (Object.keys(AGENT_TOOL_LABELS) as AgentTool[]).filter((tool) => found.has(tool));

  return {
    tools,
    sections,
    problems: problemsOf(report, items).filter(
      (problem) => items.has(problem.itemKey) && visibleTo({ tools: problem.tools }, filter),
    ),
    claudeSessionBytes: visibleTo({ tools: ['claude-code'] }, filter) ? claudeSessionBytes(report, rules) : null,
    codexSession: visibleTo({ tools: ['codex'] }, filter) ? codexSession(report) : null,
    items,
  };
}
