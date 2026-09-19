import { isGuideRecord, type HarnessReport } from '@/entities/agent-files';

/**
 * **The harness's own anatomy, read from this repository's files.**
 *
 * The tab is called Harness, and until this slice its Structure view drew the product's layer
 * ladder — routes, app shell, screens, widgets, features, entities, shared. That is the codebase's
 * **architecture**. In the vocabulary this destination borrows it is one of the three things a
 * harness *regulates* (maintainability · architecture fitness · behaviour), which makes it a
 * subject of the harness and not the harness's own shape. So the ladder moved to its own tab and
 * this model took the Structure view's place (owner, 2026-09-19).
 *
 * **What the parts are, and whose vocabulary this is.** Four public sources agree on roughly one
 * anatomy, and all four are readable without a login:
 *
 * - Fowler / Böckeler, *Harness engineering for coding agent users* — the two master classes,
 *   **guides** (feedforward, before the agent acts) and **sensors** (feedback, after), each split
 *   into inferential and computational.
 * - arXiv 2609.00006, *Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents*
 *   (CC BY 4.0) — seven subsystems: agent loop, LLM integration, tools and actions, memory and
 *   context, safety and permissions, orchestration, extensibility.
 * - OpenAI, *Harness engineering* and the Codex AGENTS.md guide — the **instruction chain**:
 *   root-down concatenation, at most one file per directory, nearer files overriding.
 * - Anthropic, *Effective harnesses for long-running agents* — what carries work across context
 *   windows: checkpoints, progress files, a verification run at the start of a session.
 *
 * **Of those seven subsystems a checkout can answer five.** The agent loop and the model wiring
 * belong to the tool a person launched, not to the folder it was launched in, and no file in the
 * repository knows them. That row is on the screen anyway, marked as something this repository does
 * not decide — the same rule the coverage matrix follows, where an empty cell is the finding rather
 * than a gap to hide.
 *
 * **The three bands are the coverage matrix's three columns**, deliberately: *tells · gates ·
 * watches*. The matrix cuts them by area, this view cuts them by part, and a reader who learns the
 * three words on one screen keeps them on the other. No score, no grade, no percentage — the
 * competitor field is full of maturity scores and this repository's own rule refuses them
 * (direction C, 2026-09-13).
 */

/** Which of the three questions a part answers, plus the band for what no checkout can answer. */
export type AnatomyBand = 'tells' | 'gates' | 'watches' | 'tool';

/**
 * What this repository put in a slot.
 *
 * `absent` is never dressed up as a failure: a repository with no MCP config has not made a
 * mistake, it has made a choice, and the screen's job is to make the choice visible.
 * `tool-owned` is not a count of zero — it is "the answer is not in this folder".
 */
type AnatomyStatus = 'present' | 'absent' | 'tool-owned';

export interface AnatomySlot {
  /** Stable id: the i18n key and the test handle. */
  id: AnatomySlotId;
  band: AnatomyBand;
  status: AnatomyStatus;
  /** Files, scripts or servers behind this slot. `0` when absent or tool-owned. */
  count: number;
  /**
   * The names a reader can go and open, longest-lived first. Capped — the citation is a sample a
   * person can check, not a second copy of the guides table.
   */
  items: readonly string[];
  /** Items beyond the cap, so the screen can say how many it is not showing. */
  overflow: number;
}

export type AnatomySlotId =
  | 'always'
  | 'scoped'
  | 'onDemand'
  | 'tools'
  | 'toolGates'
  | 'gitGates'
  | 'permissions'
  | 'watchers'
  | 'checks'
  | 'discoveredTests'
  | 'loop';

/** How many names a slot prints before it starts counting the rest. */
const ITEM_CAP = 4;

/**
 * Hook events that stop an action rather than observe one.
 *
 * Only `PreToolUse` can refuse: it runs before the tool call and a non-zero exit cancels it.
 * Everything else — `PostToolUse`, `Stop`, `SessionStart`, `Notification` — runs after the thing it
 * is named for, so it can record, warn or add context, and this screen files it under watching.
 * Codex spells the same two moments `beforeToolUse` / `afterToolUse`, so the match is loose on case
 * and on the `Use` suffix rather than an exact table of strings (measured against
 * `.claude/settings.json` and `.codex/hooks.json`, 2026-09-19).
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
  };
}

/** A path's first segment, used to fold a directory of skills or rules into one name. */
function topFolder(path: string, depth = 2): string {
  const parts = path.split('/');
  return parts.length <= depth ? path : `${parts.slice(0, depth).join('/')}/`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Server names out of an MCP config, or `null` when the file is not readable as one.
 *
 * `null` and `[]` differ and the screen prints them differently: a config we could not parse is an
 * unknown, and calling it "no servers" would be the screen inventing a fact about the one file that
 * decides what an agent can reach.
 */
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

/**
 * Whether a rule file's frontmatter names the paths it loads for.
 *
 * Only the block between the first two `---` fences is read: a rule that discusses `paths:` in its
 * prose, as several in this repository do while explaining the loading table, does not thereby
 * become conditional.
 */
export function declaresPathScope(text: string | undefined): boolean {
  if (!text) return false;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return false;
  return /^paths\s*:/m.test(match[1]!);
}

/**
 * Permission rules a Claude settings file declares, by decision.
 *
 * Read for one reason: **deny is the only part of a harness that cannot be talked around.** A rule
 * in prose asks an agent to behave; `permissions.deny` removes the ability. The repository's own
 * `local-first.md` says exactly that about its credential-file entry — "it needs no path to resolve
 * and outranks every hook" — so a structure view that listed hooks and skipped this would omit the
 * strongest gate on the screen it drew.
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
  /** `permissions.deny` / `ask` counts, or `null` when no settings file parsed. */
  permissions: { allow: number; deny: number; ask: number } | null;
  /** Configs that gate execution behind an approval this app cannot read (Codex). */
  approvalGates: readonly string[];
}

/** Every slot in reading order — the order a turn meets them, not the order they were measured. */
export const ANATOMY_ORDER: readonly AnatomySlotId[] = [
  'always',
  'scoped',
  'onDemand',
  'tools',
  'toolGates',
  'permissions',
  'gitGates',
  'watchers',
  'checks',
  'discoveredTests',
  'loop',
];

/**
 * The anatomy, from one scan. Pure, so the ordering and the emptiness rules are testable without a
 * bridge, a browser or a repository.
 */
export function buildHarnessAnatomy(report: HarnessReport): HarnessAnatomy {
  const always: string[] = [];
  const scoped: string[] = [];
  const onDemand: string[] = [];
  const toolConfigs: string[] = [];

  for (const record of report.analysis.records) {
    if (record.kind === 'mcp-config') {
      toolConfigs.push(record.path);
      continue;
    }
    if (!isGuideRecord(record)) continue;
    if (record.kind === 'skill' || record.kind === 'agent') {
      onDemand.push(topFolder(record.path));
      continue;
    }
    if (record.ruleId === 'nested-agents-md') {
      scoped.push(record.path);
      continue;
    }
    if (record.kind === 'rules') {
      /*
       * A rule with a frontmatter `paths:` is conditional; one without is loaded for every file in
       * the repository. That distinction is the whole difference between the first two rows.
       *
       * Read from the file's own text rather than from `report.coverage`, although the coverage
       * pass decides the same thing: that pass runs only when the vault records implementation
       * paths, so a repository with no ontology would have every conditional rule silently promoted
       * to always-loaded — the one reading this row must never produce.
       */
      if (declaresPathScope(report.contents.get(record.path))) scoped.push(record.path);
      else always.push(record.path);
      continue;
    }
    /* Root instruction files: CLAUDE.md, AGENTS.md, GEMINI.md, copilot-instructions. */
    always.push(record.path);
  }

  const servers = toolConfigs.flatMap((path) => mcpServerNames(report.contents.get(path)) ?? []);
  const unparsedConfigs = toolConfigs.filter(
    (path) => mcpServerNames(report.contents.get(path)) === null,
  );

  const blocking: string[] = [];
  const watching: string[] = [];
  const approvalGates: string[] = [];
  for (const group of report.hookGroups) {
    if (group.approvalGate) approvalGates.push(group.configPath);
    for (const hook of group.hooks) {
      /* A hook whose script is missing is not a guard. It is counted nowhere and shown by the
         guides view, which already says what silence costs. */
      if (hook.status !== 'wired') continue;
      const name = hook.ref.path ?? hook.ref.command;
      (isBlockingEvent(hook.events) ? blocking : watching).push(name);
    }
  }

  const permissions =
    permissionCounts(report.contents.get('.claude/settings.json')) ??
    permissionCounts(report.contents.get('.claude/settings.local.json'));

  /*
   * Names come from the coverage pass when it ran; the count never does. `checks.gitHooks` is
   * counted on every scan, so a repository whose vault records no implementation path still gets
   * the right number with no names beside it, rather than an empty row that reads as "nothing
   * guards a commit here".
   */
  const gitHookNames = report.coverage
    .filter((declaration) => declaration.origin === 'git-hook')
    .map((declaration) => declaration.label);

  const slots: AnatomySlot[] = [
    slot('always', 'tells', uniqueSorted(always)),
    slot('scoped', 'tells', uniqueSorted(scoped)),
    slot('onDemand', 'tells', uniqueSorted(onDemand)),
    slot(
      'tools',
      'tells',
      /* Servers when a config parsed, the config's own path when none did: the row must not look
         like "no tools" because a JSON file had a comma in it. */
      servers.length > 0 ? uniqueSorted(servers) : uniqueSorted(unparsedConfigs),
      servers.length > 0 ? new Set(servers).size : unparsedConfigs.length,
    ),
    slot('toolGates', 'gates', uniqueSorted(blocking)),
    {
      ...slot('permissions', 'gates', [], permissions ? permissions.deny + permissions.ask : 0),
      /* The item list stays empty on purpose: a permission rule is a glob, and printing four of
         them beside a count reads as the whole policy. The count and the file are the claim. */
      status: permissions ? (permissions.deny + permissions.ask > 0 ? 'present' : 'absent') : 'absent',
    },
    slot('gitGates', 'gates', uniqueSorted(gitHookNames), report.checks.gitHooks),
    slot('watchers', 'watches', uniqueSorted(watching)),
    slot('checks', 'watches', uniqueSorted(report.checks.scripts)),
    slot(
      'discoveredTests',
      'watches',
      uniqueSorted(report.testFiles.map((path) => topFolder(path, 3))),
      report.testFiles.length,
    ),
    {
      id: 'loop',
      band: 'tool',
      status: 'tool-owned',
      count: 0,
      items: [],
      overflow: 0,
    },
  ];

  const byId = new Map(slots.map((entry) => [entry.id, entry]));
  return {
    slots: ANATOMY_ORDER.map((id) => byId.get(id)!),
    permissions,
    approvalGates: uniqueSorted(approvalGates),
  };
}
