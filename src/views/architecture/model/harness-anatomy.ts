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
  /**
   * Where a part like this conventionally lives, shown only while the slot is absent.
   *
   * An address, not advice: see `FILL_PATH`. `null` where no single answer exists.
   */
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
 * **Where a part of a harness lives when a repository decides to have one.**
 *
 * The owner's standing goal for this tab is that an empty place should be visible *and addable*
 * (2026-09-13). Until this slice an absent row said "none yet" and stopped, which names the gap and
 * leaves the reader to go and find out what fills it.
 *
 * What this is and is not: it is **the conventional path**, taken from each tool's own published
 * documentation — the same kind of fact the guides table already prints with its source beside it —
 * and it is never a recommendation that the repository ought to have one. Plenty of repositories
 * rightly have no sub-agents and no MCP servers. The row offers the address; deciding to write
 * there is the person's, and Atlas writes nothing into a source repository either way.
 *
 * `discoveredTests` deliberately has none. "Where do tests live" has no one answer, and inventing
 * one would be the screen telling a repository how to be organised.
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
    fillPath: FILL_PATH[id] ?? null,
  };
}

/**
 * The name of the thing a path belongs to: `.claude/skills/po-pass/SKILL.md` → `po-pass`.
 *
 * A skill or a brief is called by its own name, and the directory above it says only which tool
 * tree it sits in. Two tools holding the same name are one thing a person can call, so the name is
 * what de-duplicates.
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
  /**
   * Bytes in the always-read set — the root instruction files plus every rule with no path scope.
   *
   * **The one number harness engineering is actually about.** Every source this view borrows from
   * says the same thing in its own words: context is the scarce resource, and what a repository
   * spends before the agent has read a single line of code is spent on every turn, in every
   * session, by every tool. OpenAI's guidance is that AGENTS.md should be a table of contents
   * rather than an encyclopedia; Codex truncates the merge past its cap without saying so; a
   * Claude session pays it as resident context.
   *
   * The count beside it cannot carry this: three documents of 2 KB and three of 40 KB are the same
   * "3", and the difference is the whole subject. The guides table shows per-file sizes against a
   * cap, which answers "is this one file too big"; this answers "what does a turn cost here", and
   * they are different questions.
   */
  alwaysBytes: number;
  /** `permissions.deny` / `ask` counts, or `null` when no settings file parsed. */
  permissions: { allow: number; deny: number; ask: number } | null;
  /** Configs that gate execution behind an approval this app cannot read (Codex). */
  approvalGates: readonly string[];
  /**
   * Scripts a hook config names that are **not on disk**, and the commands we could not resolve to
   * a path at all.
   *
   * The most dangerous state a harness can be in, and the one the counts above cannot show: a
   * `settings.json` entry whose path does not resolve produces no block and no error — just a
   * non-blocking status code — so the guard disappears in silence and every number on this screen
   * still looks healthy. The rows count what is wired, which is the honest count; this is the
   * sentence that keeps that count from reading as "nothing is missing".
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

/**
 * The anatomy, from one scan. Pure, so the ordering and the emptiness rules are testable without a
 * bridge, a browser or a repository.
 */
export function buildHarnessAnatomy(report: HarnessReport): HarnessAnatomy {
  const always: string[] = [];
  const blind: string[] = [];
  let alwaysBytes = 0;
  const scoped: string[] = [];
  const skills: string[] = [];
  const subagents: string[] = [];
  const toolConfigs: string[] = [];

  for (const record of report.analysis.records) {
    if (record.kind === 'exclusion') {
      /* A gate, not a guide: it removes an ability rather than advising. What a repository cannot
         say here is whether the tool honours the file — a March 2026 comparison found the products
         differ widely — so the row's own words carry that limit, the same way the hook rows do. */
      blind.push(record.path);
      continue;
    }
    if (record.kind === 'mcp-config') {
      toolConfigs.push(record.path);
      continue;
    }
    if (!isGuideRecord(record)) continue;
    if (record.kind === 'skill' || record.kind === 'agent') {
      /*
       * Folded to the **named unit**, not to the directory above it. Folding at depth two put this
       * repository's 18 skills and 15 briefs on screen as "4 folders", which is a true sentence
       * about a fact nobody asked for; the reader wants to know how many things can be called and
       * what they are called (measured on this repository, 2026-09-20). The two kinds are separate
       * rows because they are separate subsystems — extensibility and orchestration — and because
       * a reader deciding whether the harness has any skills is not asking about sub-agents.
       */
      (record.kind === 'skill' ? skills : subagents).push(namedUnit(record.path));
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
      if (declaresPathScope(report.contents.get(record.path))) {
        scoped.push(record.path);
      } else {
        always.push(record.path);
        alwaysBytes += record.bytes;
      }
      continue;
    }
    /* Root instruction files: CLAUDE.md, AGENTS.md, GEMINI.md, copilot-instructions. */
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
        /* Not counted as a guard — it is not one — but not dropped either. A guard that fails in
           silence is exactly what a reader of this screen needs told. */
        const name = hook.ref.path ?? hook.ref.command;
        (hook.status === 'missing' ? missingScripts : unresolvedCommands).push(
          name.split('/').pop() ?? name,
        );
        continue;
      }
      /*
       * The script's own name, so a guard mirrored into `.claude/hooks/` and `.codex/hooks/` is
       * counted once. Nine of this repository's hook scripts exist in both trees as real mirrored
       * files; counting the copies made the row say nine blocking hooks where five guards exist,
       * and the coverage view already settled this the same way — one name, and the tools carry
       * the multiplicity (measured on this repository, 2026-09-20).
       */
      const path = hook.ref.path;
      const name = path ? (path.split('/').pop() ?? path) : hook.ref.command;
      (isBlockingEvent(hook.events) ? blocking : watching).push(name);
    }
  }

  const permissions =
    permissionCounts(report.contents.get('.claude/settings.json')) ??
    permissionCounts(report.contents.get('.claude/settings.local.json'));

  /* Straight from the scan. Reading them out of the coverage pass left the row with a bare count
     on any repository whose vault records no implementation path, because that pass does not run
     there (measured on this repository, 2026-09-20). */
  const gitHookNames = report.gitHookFiles;

  const slots: AnatomySlot[] = [
    slot('always', 'tells', uniqueSorted(always)),
    slot('scoped', 'tells', uniqueSorted(scoped)),
    slot('skills', 'tells', uniqueSorted(skills)),
    slot('subagents', 'tells', uniqueSorted(subagents)),
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
    slot('blind', 'gates', uniqueSorted(blind)),
    slot('gitGates', 'gates', uniqueSorted(gitHookNames), report.checks.gitHooks),
    slot('watchers', 'watches', uniqueSorted(watching)),
    slot('checks', 'watches', uniqueSorted(report.checks.scripts)),
    slot(
      'discoveredTests',
      'watches',
      /*
       * The top folder, because depth three produced 689 distinct names for 1471 files on this
       * repository and the citation line became a list nobody can read. `src/ · mcp/ · cli/` is
       * what a person needs to know: where the runner finds them.
       */
      uniqueSorted(report.testFiles.map((path) => topFolder(path, 1))),
      report.testFiles.length,
    ),
    /*
     * The one phase the first build of this view had no row for. Fowler's lifecycle runs pre-commit
     * → post-commit → pipeline → continuous monitoring, and a repository whose only gate is a
     * pipeline was drawn here with nothing watching it at all. Names are the workflow file, which
     * is what a reader opens; whether a job in it ever ran is a fact GitHub holds, not this folder.
     */
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
      /* No address: this part is not missing from the repository, it is not the repository's. */
      fillPath: null,
    },
  ];

  const byId = new Map(slots.map((entry) => [entry.id, entry]));
  return {
    slots: ANATOMY_ORDER.map((id) => byId.get(id)!),
    alwaysBytes,
    permissions,
    approvalGates: uniqueSorted(approvalGates),
    silentGuards: {
      missing: uniqueSorted(missingScripts),
      unresolved: uniqueSorted(unresolvedCommands),
    },
  };
}
