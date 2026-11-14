import {
  AGENT_TOOL_LABELS,
  isPairDrift,
  type AgentTool,
  type HarnessReport,
  type HookConfigFacts,
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
  | 'ignore'
  | 'contextHooks'
  | 'permissions'
  | 'blockingHooks'
  | 'hooks'
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
  /** Empty for repository-wide checks every agent meets (scripts, Git hooks, CI). */
  tools: readonly AgentTool[];
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
  denyAndAskRuleCount?: number;
  /** The text that put the item here, quoted from its file. */
  declaration?: string;
  /** A Claude or Codex copy that differs from its declared twin, or has none. */
  copyDiffers?: boolean;
  /** Claude's copy, then Codex's, when both exist and differ. */
  pairPaths?: readonly [string, string];
}

export interface SetupGroup {
  id: SetupGroupId;
  items: SetupItem[];
  bytes: number;
}

export interface SetupSection {
  id: SetupSectionId;
  groups: SetupGroup[];
  total: number;
}

export type SetupProblem =
  | { kind: 'hook-missing'; key: string; itemKey: string; path: string; tools: readonly AgentTool[] }
  | { kind: 'hook-unresolved'; key: string; itemKey: string; command: string; tools: readonly AgentTool[] }
  | { kind: 'codex-cap'; key: string; itemKey: string; bytes: number; tools: readonly AgentTool[] }
  | { kind: 'copy-drift'; key: string; itemKey: string; count: number; tools: readonly AgentTool[] };

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
  /** CLAUDE.md plus every rule with no `paths:`, or null when there is no CLAUDE.md. */
  claudeSessionBytes: number | null;
  codexSession: CodexSessionSize | null;
  items: ReadonlyMap<string, SetupItem>;
}

/** `null` shows every tool. */
export type ToolFilter = AgentTool | null;

const SECTION_GROUPS: Readonly<Record<SetupSectionId, readonly SetupGroupId[]>> = Object.freeze({
  context: ['instructions', 'rules', 'skills', 'subagents', 'mcp', 'ignore', 'contextHooks'],
  guardrails: ['permissions', 'blockingHooks'],
  verification: ['hooks', 'scripts', 'gitHooks', 'workflows'],
});

const RECORD_GROUP: Readonly<Record<string, SetupGroupId>> = Object.freeze({
  instructions: 'instructions',
  rules: 'rules',
  skill: 'skills',
  agent: 'subagents',
  'mcp-config': 'mcp',
  exclusion: 'ignore',
});

const BEFORE_ACTION_EVENT = /^(pre|before)[-_]?/i;
/* The same events `coverage-collect` files under Told: they add context, they do not block a tool. */
const CONTEXT_EVENT = /^(session[-_]?start|user[-_]?prompt[-_]?submit)$/i;

export function hookEventSection(event: string): SetupSectionId {
  if (BEFORE_ACTION_EVENT.test(event)) return 'guardrails';
  if (CONTEXT_EVENT.test(event)) return 'context';
  return 'verification';
}

const HOOK_GROUP: Readonly<Record<SetupSectionId, SetupGroupId>> = Object.freeze({
  context: 'contextHooks',
  guardrails: 'blockingHooks',
  verification: 'hooks',
});

export function fileItemKey(path: string): string {
  return `file:${path}`;
}

function hookItemKey(group: HookConfigFacts, ref: string, section: SetupSectionId): string {
  return `hook:${section}:${group.configPath}:${ref}`;
}

function declarationsById(coverage: readonly ScopeDeclaration[], origin: ScopeDeclaration['origin']) {
  const out = new Map<string, ScopeDeclaration>();
  for (const entry of coverage) if (entry.origin === origin) out.set(entry.id, entry);
  return out;
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
  return {
    key: fileItemKey(record.path),
    label: record.path,
    path: record.path,
    hasContent: report.contents.has(record.path),
    tools: record.tools,
    bytes: record.bytes,
    ruleId: record.ruleId,
    loading: rule ? (rule.declaration ? 'path' : 'always') : undefined,
    declaration: rule?.declaration || undefined,
    copyDiffers: record.drift.some(isPairDrift) || undefined,
    pairPaths: pairs.get(record.path),
  };
}

function hookItems(report: HarnessReport): Array<{ section: SetupSectionId; item: SetupItem }> {
  const toolsByPath = new Map(report.analysis.records.map((record) => [record.path, record.tools]));
  const bytesByPath = new Map(report.analysis.records.map((record) => [record.path, record.bytes]));
  const out: Array<{ section: SetupSectionId; item: SetupItem }> = [];
  for (const group of report.hookGroups) {
    const tools = toolsByPath.get(group.configPath) ?? [];
    for (const hook of group.hooks) {
      const ref = hook.ref.path ?? hook.ref.command;
      const bySection = new Map<SetupSectionId, string[]>();
      for (const event of hook.events.split(' · ')) {
        const section = hookEventSection(event);
        bySection.set(section, [...(bySection.get(section) ?? []), event]);
      }
      for (const [section, events] of bySection) {
        out.push({
          section,
          item: {
            key: hookItemKey(group, ref, section),
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

function permissionItems(report: HarnessReport): SetupItem[] {
  const toolsByPath = new Map(report.analysis.records.map((record) => [record.path, record.tools]));
  return report.coverage
    .filter((entry) => entry.origin === 'permissions')
    .map((entry) => ({
      key: `permissions:${entry.label}`,
      label: entry.label,
      path: entry.label,
      hasContent: report.contents.has(entry.label),
      tools: toolsByPath.get(entry.label) ?? entry.tools,
      bytes: null,
      ruleId: null,
      denyAndAskRuleCount: entry.denyAndAskRuleCount ?? 0,
    }));
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
    bytes: null,
    ruleId: null,
    declaration: declaration || undefined,
  });
  return {
    scripts: report.checks.scripts.map((name) =>
      plain(`script:${name}`, name, `package.json#${name}`, scripts.get(`package.json#${name}`)?.declaration),
    ),
    gitHooks: report.gitHookFiles.map((name) =>
      plain(`githook:${name}`, name, `.githooks/${name}`, gitHooks.get(`.githooks/${name}`)?.declaration),
    ),
    workflows: report.workflowFiles.map((path) =>
      plain(`workflow:${path}`, path.split('/').pop() ?? path, path, workflows.get(path)?.declaration),
    ),
  };
}

function problemsOf(report: HarnessReport, items: ReadonlyMap<string, SetupItem>): SetupProblem[] {
  const out: SetupProblem[] = [];
  for (const item of items.values()) {
    if (!item.key.startsWith('hook:')) continue;
    if (item.hookStatus === 'missing') {
      out.push({ kind: 'hook-missing', key: `missing:${item.key}`, itemKey: item.key, path: item.label, tools: item.tools });
    } else if (item.hookStatus === 'unresolved') {
      out.push({ kind: 'hook-unresolved', key: `unresolved:${item.key}`, itemKey: item.key, command: item.label, tools: item.tools });
    }
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
  const pairDrift = report.analysis.drift.filter((finding) => isPairDrift(finding.code));
  if (pairDrift.length > 0) {
    const firstDiffering = [...items.values()].find((item) => item.copyDiffers);
    out.push({
      kind: 'copy-drift',
      key: 'copy-drift',
      itemKey: firstDiffering?.key ?? '',
      count: pairDrift.length,
      tools: ['claude-code', 'codex'],
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
  const alwaysRules = records.filter(
    (record) => record.ruleId === 'claude-rules' && !rules.get(record.path)?.declaration,
  );
  return alwaysRules.reduce((sum, record) => sum + record.bytes, claudeMd.bytes);
}

function visibleTo(tools: readonly AgentTool[], filter: ToolFilter): boolean {
  return filter === null || tools.length === 0 || tools.includes(filter);
}

/**
 * O(records + hooks + coverage). With a tool filter, an item another tool reads is left out; an
 * item no tool claims (a script, a Git hook, CI) stays, since it runs whichever agent works.
 */
export function buildHarnessSetup(report: HarnessReport, filter: ToolFilter = null): HarnessSetup {
  const rules = declarationsById(report.coverage, 'rule');
  const pairs = differingPairs(report);
  const byGroup = new Map<SetupGroupId, SetupItem[]>();
  const push = (group: SetupGroupId, item: SetupItem) => {
    byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
  };

  for (const record of report.analysis.records) {
    const group = RECORD_GROUP[record.kind];
    if (group) push(group, fileItem(record, report, rules, pairs));
  }
  for (const item of permissionItems(report)) push('permissions', item);
  for (const { section, item } of hookItems(report)) push(HOOK_GROUP[section], item);
  const checks = repositoryChecks(report);
  for (const item of checks.scripts) push('scripts', item);
  for (const item of checks.gitHooks) push('gitHooks', item);
  for (const item of checks.workflows) push('workflows', item);

  const items = new Map<string, SetupItem>();
  for (const list of byGroup.values()) for (const item of list) items.set(item.key, item);

  const sections: SetupSection[] = (Object.keys(SECTION_GROUPS) as SetupSectionId[]).map((id) => {
    const groups = SECTION_GROUPS[id]
      .map((groupId) => {
        const visible = (byGroup.get(groupId) ?? []).filter((item) => visibleTo(item.tools, filter));
        return { id: groupId, items: visible, bytes: visible.reduce((sum, item) => sum + (item.bytes ?? 0), 0) };
      })
      .filter((group) => group.items.length > 0);
    return { id, groups, total: groups.reduce((sum, group) => sum + group.items.length, 0) };
  });

  const found = new Set(report.analysis.records.flatMap((record) => record.tools));
  const tools = (Object.keys(AGENT_TOOL_LABELS) as AgentTool[]).filter((tool) => found.has(tool));

  return {
    tools,
    sections,
    problems: problemsOf(report, items).filter((problem) => visibleTo(problem.tools, filter)),
    claudeSessionBytes: visibleTo(['claude-code'], filter) ? claudeSessionBytes(report, rules) : null,
    codexSession: visibleTo(['codex'], filter) ? codexSession(report) : null,
    items,
  };
}
