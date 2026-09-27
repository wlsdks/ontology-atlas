import { isGuideRecord, type HarnessReport } from '@/entities/agent-files';

/**
 * The harness's own anatomy, read from this repository's files. Vocabulary from public sources:
 * Fowler/Böckeler (guides and sensors), arXiv 2609.00006 (seven subsystems, CC BY 4.0), OpenAI's
 * AGENTS.md instruction chain, and Anthropic's long-running-agent harnesses. The agent loop and
 * model wiring belong to the tool, so that row is shown as not the repository's to decide. The
 * three bands are the coverage matrix's columns (tells, gates, watches); no score or grade.
 */

/** Which of the three questions a part answers, plus the band for what no checkout can answer. */
export type AnatomyBand = 'tells' | 'gates' | 'watches' | 'tool';

/** `absent` is a choice made visible, not a failure; `tool-owned` means the answer is not in this folder. */
type AnatomyStatus = 'present' | 'absent' | 'tool-owned';

export interface AnatomySlot {
  /** Stable id: the i18n key and the test handle. */
  id: AnatomySlotId;
  band: AnatomyBand;
  status: AnatomyStatus;
  /** Files, scripts or servers behind this slot. `0` when absent or tool-owned. */
  count: number;
  /** Names a reader can open, longest-lived first; capped, a checkable sample. */
  items: readonly string[];
  /** Items beyond the cap, so the screen can say how many it is not showing. */
  overflow: number;
  /** Where a part like this conventionally lives, only while absent; an address, not advice. */
  fillPath: string | null;
}

export type AnatomySlotId =
  | 'always'
  | 'scoped'
  | 'skills'
  | 'subagents'
  | 'tools'
  | 'toolGates'
  | 'blind'
  | 'gitGates'
  | 'permissions'
  | 'watchers'
  | 'checks'
  | 'discoveredTests'
  | 'pipeline'
  | 'loop';

/**
 * The conventional path for each part, from each tool's own documentation, so an absent row is
 * addable. Never a recommendation, and Atlas writes nothing into a source repository.
 * `discoveredTests` has none: there is no one answer to where tests live.
 */
const FILL_PATH: Readonly<Partial<Record<AnatomySlotId, string>>> = Object.freeze({
  always: 'AGENTS.md',
  scoped: '<folder>/AGENTS.md',
  skills: '.claude/skills/<name>/SKILL.md',
  subagents: '.claude/agents/<name>.md',
  tools: '.mcp.json',
  toolGates: '.claude/settings.json → hooks.PreToolUse',
  permissions: '.claude/settings.json → permissions.deny',
  gitGates: '.githooks/pre-commit',
  watchers: '.claude/settings.json → hooks.PostToolUse',
  checks: 'package.json → scripts.test',
  pipeline: '.github/workflows/checks.yml',
});

/** How many names a slot prints before it starts counting the rest. */
const ITEM_CAP = 4;

/**
 * Hook events that stop an action rather than observe one: only a pre-tool event can refuse.
 * Codex spells it `beforeToolUse`, so the match is loose on case and the `Use` suffix (checked
 * against `.claude/settings.json` and `.codex/hooks.json`).
 */
function isBlockingEvent(events: string): boolean {
  return /\bpre[-_]?tool|before[-_]?tool/i.test(events);
}

function slot(
  id: AnatomySlotId,
  band: AnatomyBand,
  items: readonly string[],
  count = items.length,
): AnatomySlot {
  return {
    id,
    band,
    status: count > 0 ? 'present' : 'absent',
    count,
    items: items.slice(0, ITEM_CAP),
    overflow: Math.max(0, items.length - ITEM_CAP),
    fillPath: FILL_PATH[id] ?? null,
  };
}

/**
 * The name a path's skill or brief is called by: `.claude/skills/po-pass/SKILL.md` -> `po-pass`.
 * Two tools holding the same name are one callable thing, so the name de-duplicates.
 */
function namedUnit(path: string): string {
  const parts = path.split('/');
  /* `.claude/skills/<name>/SKILL.md` and `.claude/agents/<name>.md` are both three deep at most. */
  const name = parts.length > 3 ? parts[2]! : parts[parts.length - 1]!;
  return name.replace(/\.[^.]+$/, '');
}

/** A path's first segment, used to fold a directory of skills or rules into one name. */
function topFolder(path: string, depth = 2): string {
  const parts = path.split('/');
  return parts.length <= depth ? path : `${parts.slice(0, depth).join('/')}/`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Server names from an MCP config, or `null` when unparsable: an unknown, not "no servers". */
export function mcpServerNames(text: string | undefined): string[] | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const servers = (parsed as { mcpServers?: unknown }).mcpServers;
    if (!servers || typeof servers !== 'object') return null;
    return Object.keys(servers as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Reads only the frontmatter block, so a rule that discusses `paths:` in prose stays unconditional. */
export function declaresPathScope(text: string | undefined): boolean {
  if (!text) return false;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return false;
  return /^paths\s*:/m.test(match[1]!);
}

/**
 * Permission rules a Claude settings file declares, by decision. `permissions.deny` removes an
 * ability rather than advising, so it is the strongest gate on the screen.
 */
export function permissionCounts(
  text: string | undefined,
): { allow: number; deny: number; ask: number } | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const permissions = (parsed as { permissions?: unknown })?.permissions;
    if (!permissions || typeof permissions !== 'object') return null;
    const read = (key: 'allow' | 'deny' | 'ask'): number => {
      const value = (permissions as Record<string, unknown>)[key];
      return Array.isArray(value) ? value.length : 0;
    };
    return { allow: read('allow'), deny: read('deny'), ask: read('ask') };
  } catch {
    return null;
  }
}

export interface HarnessAnatomy {
  slots: readonly AnatomySlot[];
  /**
   * Bytes in the always-read set (root instruction files plus every unscoped rule): what every turn
   * pays before reading code, which a file count cannot carry.
   */
  alwaysBytes: number;
  /**
   * The costliest nested instruction file and what it adds: Codex concatenates `AGENTS.md` root-down
   * to the working directory, so a turn inside that folder pays both. `null` when nothing nests.
   */
  deepestNested: { path: string; bytes: number } | null;
  /** `permissions.deny` / `ask` counts, or `null` when no settings file parsed. */
  permissions: { allow: number; deny: number; ask: number } | null;
  /** Configs that gate execution behind an approval this app cannot read (Codex). */
  approvalGates: readonly string[];
  /**
   * Hook scripts named but not on disk, and commands with no resolvable path. An unresolved entry
   * produces no block and no error, so the guard vanishes silently while the counts look healthy.
   */
  silentGuards: { missing: readonly string[]; unresolved: readonly string[] };
}

/** Every slot in reading order — the order a turn meets them, not the order they were measured. */
export const ANATOMY_ORDER: readonly AnatomySlotId[] = [
  'always',
  'scoped',
  'skills',
  'subagents',
  'tools',
  'toolGates',
  'permissions',
  'blind',
  'gitGates',
  'watchers',
  'checks',
  'discoveredTests',
  'pipeline',
  'loop',
];

/** The anatomy from one scan, pure so ordering and emptiness rules test without a bridge. */
export function buildHarnessAnatomy(report: HarnessReport): HarnessAnatomy {
  const always: string[] = [];
  const blind: string[] = [];
  let alwaysBytes = 0;
  let deepestNested: { path: string; bytes: number } | null = null;
  const scoped: string[] = [];
  const skills: string[] = [];
  const subagents: string[] = [];
  const toolConfigs: string[] = [];

  for (const record of report.analysis.records) {
    if (record.kind === 'exclusion') {
      /* A gate, not a guide; whether the tool honours the file differs by product, so the row says so. */
      blind.push(record.path);
      continue;
    }
    if (record.kind === 'mcp-config') {
      toolConfigs.push(record.path);
      continue;
    }
    if (!isGuideRecord(record)) continue;
    if (record.kind === 'skill' || record.kind === 'agent') {
      /* Folded to the named unit, not the directory: the reader asks what can be called. Skills and sub-agents are separate subsystems. */
      (record.kind === 'skill' ? skills : subagents).push(namedUnit(record.path));
      continue;
    }
    if (record.ruleId === 'nested-agents-md') {
      scoped.push(record.path);
      /* Deepest first, then heaviest: the most a turn can be asked to carry. */
      const depth = record.path.split('/').length;
      const bestDepth = deepestNested ? deepestNested.path.split('/').length : -1;
      if (
        !deepestNested ||
        depth > bestDepth ||
        (depth === bestDepth && record.bytes > deepestNested.bytes)
      ) {
        deepestNested = { path: record.path, bytes: record.bytes };
      }
      continue;
    }
    if (record.kind === 'rules') {
      /*
       * A rule with frontmatter `paths:` is conditional. Read from the file, not `report.coverage`:
       * that pass runs only with implementation paths and would promote every rule to always-loaded.
       */
      if (declaresPathScope(report.contents.get(record.path))) {
        scoped.push(record.path);
      } else {
        always.push(record.path);
        alwaysBytes += record.bytes;
      }
      continue;
    }
    always.push(record.path);
    alwaysBytes += record.bytes;
  }

  const servers = toolConfigs.flatMap((path) => mcpServerNames(report.contents.get(path)) ?? []);
  const unparsedConfigs = toolConfigs.filter(
    (path) => mcpServerNames(report.contents.get(path)) === null,
  );

  const blocking: string[] = [];
  const watching: string[] = [];
  const approvalGates: string[] = [];
  const missingScripts: string[] = [];
  const unresolvedCommands: string[] = [];
  for (const group of report.hookGroups) {
    if (group.approvalGate) approvalGates.push(group.configPath);
    for (const hook of group.hooks) {
      if (hook.status !== 'wired') {
        /* Not a guard, but not dropped: a guard that fails silently is what this screen must say. */
        const name = hook.ref.path ?? hook.ref.command;
        (hook.status === 'missing' ? missingScripts : unresolvedCommands).push(
          name.split('/').pop() ?? name,
        );
        continue;
      }
      /* The script's name, so a hook mirrored into `.claude/hooks/` and `.codex/hooks/` counts once. */
      const path = hook.ref.path;
      const name = path ? (path.split('/').pop() ?? path) : hook.ref.command;
      (isBlockingEvent(hook.events) ? blocking : watching).push(name);
    }
  }

  /* Both files, added: Claude reads `settings.local.json` on top of the shared policy. */
  const permissionFiles = ['.claude/settings.json', '.claude/settings.local.json']
    .map((path) => permissionCounts(report.contents.get(path)))
    .filter((counts): counts is { allow: number; deny: number; ask: number } => counts !== null);
  const permissions =
    permissionFiles.length === 0
      ? null
      : permissionFiles.reduce((sum, counts) => ({
          allow: sum.allow + counts.allow,
          deny: sum.deny + counts.deny,
          ask: sum.ask + counts.ask,
        }));

  /* From the scan, not the coverage pass, which does not run without implementation paths. */
  const gitHookNames = report.gitHookFiles;

  const slots: AnatomySlot[] = [
    slot('always', 'tells', uniqueSorted(always)),
    slot('scoped', 'tells', uniqueSorted(scoped)),
    slot('skills', 'tells', uniqueSorted(skills)),
    slot('subagents', 'tells', uniqueSorted(subagents)),
    slot(
      'tools',
      'tells',
      /* The config's own path when nothing parsed, so a malformed file does not read as "no tools". */
      servers.length > 0 ? uniqueSorted(servers) : uniqueSorted(unparsedConfigs),
      servers.length > 0 ? new Set(servers).size : unparsedConfigs.length,
    ),
    slot('toolGates', 'gates', uniqueSorted(blocking)),
    {
      ...slot('permissions', 'gates', [], permissions ? permissions.deny + permissions.ask : 0),
      /* No items: printing four globs beside a count reads as the whole policy. */
      status: permissions ? (permissions.deny + permissions.ask > 0 ? 'present' : 'absent') : 'absent',
    },
    slot('blind', 'gates', uniqueSorted(blind)),
    slot('gitGates', 'gates', uniqueSorted(gitHookNames), report.checks.gitHooks),
    slot('watchers', 'watches', uniqueSorted(watching)),
    slot('checks', 'watches', uniqueSorted(report.checks.scripts)),
    slot(
      'discoveredTests',
      'watches',
      /* The top folder: where the runner finds tests; deeper paths list hundreds of names. */
      uniqueSorted(report.testFiles.map((path) => topFolder(path, 1))),
      report.testFiles.length,
    ),
    /* The pipeline phase; whether a job ran is GitHub's fact, so the workflow file is the name. */
    slot(
      'pipeline',
      'watches',
      uniqueSorted(report.workflowFiles.map((path) => path.replace('.github/workflows/', ''))),
    ),
    {
      id: 'loop',
      band: 'tool',
      status: 'tool-owned',
      count: 0,
      items: [],
      overflow: 0,
      /* No address: this part is not the repository's. */
      fillPath: null,
    },
  ];

  const byId = new Map(slots.map((entry) => [entry.id, entry]));
  return {
    slots: ANATOMY_ORDER.map((id) => byId.get(id)!),
    alwaysBytes,
    deepestNested,
    permissions,
    approvalGates: uniqueSorted(approvalGates),
    silentGuards: {
      missing: uniqueSorted(missingScripts),
      unresolved: uniqueSorted(unresolvedCommands),
    },
  };
}
