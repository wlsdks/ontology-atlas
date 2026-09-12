import { analyzeAgentFiles, type AgentFileEntry, type AgentFilesAnalysis } from './agent-files';

import { collectHookFacts, wiredHookCount, type HookConfigFacts } from './hook-wiring';

/**
 * **Reading one repository's harness through a file port.**
 *
 * The classifier (`analyzeAgentFiles`) is pure and already canonical; this module's only job is to
 * put the right bytes in front of it. It matters because the surface that already shows agent files
 * — the docs sidebar — reads them through the File System Access API, which cannot see a dot
 * directory at all. `.claude/rules`, `.claude/skills`, `.agents/`, `.codex/` are therefore invisible
 * there, which is most of the harness. The installed app's bridge can list them, so this module
 * reads the same set the CLI's `agent-files` command reads and hands the classifier a complete
 * picture instead of the visible corner of one.
 *
 * The scanned set is deliberately identical to `cli/src/lib`'s: the same root candidates, the same
 * directories, the same one-level nesting rule for `AGENTS.md`. Two scanners that disagree about
 * what counts would produce two different answers to one question, which is the defect this whole
 * slice exists to expose.
 */

export interface HarnessScanPort {
  /** Directory entries at a repo-relative path, or `null` when the path does not exist. */
  listDir(relativePath: string): Promise<readonly { name: string; kind: 'file' | 'directory' }[] | null>;
  /** File text plus its modification time, or `null` when the file does not exist. */
  readText(relativePath: string): Promise<{ text: string; lastModified: number | null } | null>;
}

/** Single files that can hold agent instructions. Mirrors the CLI's root candidates. */
const ROOT_FILES = Object.freeze([
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.mcp.json',
  '.github/copilot-instructions.md',
  '.claude/settings.json',
]);

/** Directories walked recursively — the only dot directories this scan touches. */
const SCAN_DIRS = Object.freeze([
  '.claude/rules',
  '.claude/hooks',
  '.claude/skills',
  '.claude/agents',
  '.agents/skills',
  '.agents/agents',
  '.cursor/rules',
  '.codex',
]);

/** Never descend into these while looking for a nested `AGENTS.md`. */
const SKIPPED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'target', 'coverage', '.turbo',
]);

/** Depth bound inside a scanned directory — skills nest `guides/` and `scripts/` one or two deep. */
const SCAN_MAX_DEPTH = 4;

/** The hook configs this scan knows how to read, and whether the tool gates execution on approval. */
const HOOK_CONFIGS: ReadonlyArray<{ path: string; approvalGate: boolean }> = Object.freeze([
  { path: '.claude/settings.json', approvalGate: false },
  { path: '.codex/hooks.json', approvalGate: true },
]);

/**
 * **The rule ids the repository's own parity check compares byte for byte**, and nothing else.
 *
 * `.claude/hooks/*.sh` and `.codex/hooks/*.sh` are deliberately **not** here. They look like a
 * mirrored pair and are not one: Codex delivers an edit as an `apply_patch` envelope, so those
 * scripts are adapted rather than copied, and every one of them differs by design. Listing them
 * would print drift on a repository that is behaving exactly as its own contract requires.
 */
const DECLARED_PAIR_RULES: Readonly<Record<string, string>> = Object.freeze({
  'claude-skills': '.agents/skills',
  'agents-skills': '.claude/skills',
  'claude-agents': '.agents/agents',
  'agents-agents': '.claude/agents',
});

/** Drift codes that belong to the pair column. Any other finding is about something else. */
const PAIR_DRIFT_CODES = new Set([
  'skill-copy-diverged',
  'skill-copy-file-missing',
  'agent-copy-diverged',
  'agent-copy-file-missing',
]);

/** The twin a rule is declared byte-identical to, or `null` when it has no declared pair. */
export function declaredPairFor(ruleId: string): string | null {
  return DECLARED_PAIR_RULES[ruleId] ?? null;
}

/** Whether a drift code is a byte difference inside a declared pair. */
export function isPairDrift(code: string): boolean {
  return PAIR_DRIFT_CODES.has(code);
}

/**
 * **What counts as a guide**, used by both the sentence's first number and the guides table so
 * the two cannot disagree. A reader who sees "8 documents" above a table of ten rows learns only
 * that one of the two is wrong. `config` records — `settings.json`, the hook scripts, `.codex/` — are the
 * enforcement layer and belong to the second number and the hooks section.
 */
export function isGuideRecord(record: { kind: string }): boolean {
  return record.kind !== 'config';
}

/** `package.json` script names that run a linter, a type check, or a test suite. */
const CHECK_SCRIPT_NAME = /^(lint|test|typecheck)(:|$)/;

interface HarnessFileTime {
  path: string;
  lastModified: number | null;
}

interface HarnessCheckCensus {
  /** Hook scripts named by a config and found on disk. */
  wiredHooks: number;
  /** Files under `.githooks/` — Git-level checks the repository installs. */
  gitHooks: number;
  /** `package.json` scripts matching `CHECK_SCRIPT_NAME`, listed so the number can be audited. */
  scripts: readonly string[];
  /** The sum the screen prints. Its three parts are shown beside it; the number is never bare. */
  total: number;
}

export interface HarnessReport {
  analysis: AgentFilesAnalysis;
  hookGroups: readonly HookConfigFacts[];
  /** Modification times by path, for the change column. See `HarnessReport.timesAreFileMtime`. */
  times: readonly HarnessFileTime[];
  /**
   * Every scanned file's text, keyed by path. The drift door shows two complete files side by side,
   * and the scan already holds both — re-reading them through the bridge on click would be a second
   * round trip for bytes we have.
   */
  contents: ReadonlyMap<string, string>;
  checks: HarnessCheckCensus;
  /** Guide documents found — the sentence's first number. Hook configs and scripts excluded. */
  guideDocumentCount: number;
  /**
   * `true` always, and stated on screen: these timestamps are filesystem modification times, not
   * commit dates. A fresh clone or a new worktree stamps every file with the checkout time, so the
   * column answers "when did this file change **on this disk**" and nothing more.
   */
  timesAreFileMtime: true;
}

async function walk(
  port: HarnessScanPort,
  root: string,
  depth: number,
  out: AgentFileEntry[],
  times: HarnessFileTime[],
): Promise<void> {
  if (depth > SCAN_MAX_DEPTH) return;
  const entries = await port.listDir(root);
  if (!entries) return;
  for (const entry of entries) {
    const path = `${root}/${entry.name}`;
    if (entry.kind === 'directory') {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      await walk(port, path, depth + 1, out, times);
      continue;
    }
    const file = await port.readText(path);
    if (!file) continue;
    out.push({ path, content: file.text });
    times.push({ path, lastModified: file.lastModified });
  }
}

/**
 * One-level nested `AGENTS.md` — `app/AGENTS.md`, `src/AGENTS.md` and their siblings.
 *
 * One level, because that is what the classifier's `nested-agents-md` rule matches, and it matches
 * one level on purpose: `cli/templates/vault/AGENTS.md` sits three segments deep and is product
 * data shipped inside a starter vault, not an instruction to an agent working on this repository.
 */
async function nestedAgentsFiles(
  port: HarnessScanPort,
  out: AgentFileEntry[],
  times: HarnessFileTime[],
): Promise<void> {
  const entries = await port.listDir('');
  if (!entries) return;
  for (const entry of entries) {
    if (entry.kind !== 'directory') continue;
    if (SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const path = `${entry.name}/AGENTS.md`;
    const file = await port.readText(path);
    if (!file) continue;
    out.push({ path, content: file.text });
    times.push({ path, lastModified: file.lastModified });
  }
}

async function countGitHooks(port: HarnessScanPort): Promise<number> {
  const entries = await port.listDir('.githooks');
  if (!entries) return 0;
  return entries.filter((entry) => entry.kind === 'file').length;
}

function checkScriptNames(packageJsonText: string | null): string[] {
  if (!packageJsonText) return [];
  try {
    const scripts = (JSON.parse(packageJsonText) as { scripts?: Record<string, unknown> })?.scripts;
    if (!scripts || typeof scripts !== 'object') return [];
    return Object.keys(scripts).filter((name) => CHECK_SCRIPT_NAME.test(name)).sort();
  } catch {
    return [];
  }
}

/** Reads the whole harness report for one repository root. */
export async function scanHarness(port: HarnessScanPort): Promise<HarnessReport> {
  const files: AgentFileEntry[] = [];
  const times: HarnessFileTime[] = [];

  for (const path of ROOT_FILES) {
    const file = await port.readText(path);
    if (!file) continue;
    files.push({ path, content: file.text });
    times.push({ path, lastModified: file.lastModified });
  }
  await nestedAgentsFiles(port, files, times);
  for (const dir of SCAN_DIRS) await walk(port, dir, 0, files, times);

  const existingPaths = files.map((file) => file.path);
  const analysis = analyzeAgentFiles({ files, existingPaths });

  const contentByPath = new Map(files.map((file) => [file.path, file.content ?? '']));
  const scriptExists = async (path: string) => {
    if (contentByPath.has(path)) return true;
    return (await port.readText(path)) !== null;
  };
  const hookGroups: HookConfigFacts[] = [];
  for (const config of HOOK_CONFIGS) {
    const text = contentByPath.get(config.path) ?? (await port.readText(config.path))?.text ?? null;
    if (text === null) continue;
    hookGroups.push(
      await collectHookFacts(config.path, text, scriptExists, { approvalGate: config.approvalGate }),
    );
  }

  const packageJson = await port.readText('package.json');
  const scripts = checkScriptNames(packageJson?.text ?? null);
  const wiredHooks = wiredHookCount(hookGroups);
  const gitHooks = await countGitHooks(port);

  const guideDocumentCount = analysis.records.filter(isGuideRecord).length;

  return {
    analysis,
    hookGroups,
    times,
    contents: contentByPath,
    checks: { wiredHooks, gitHooks, scripts, total: wiredHooks + gitHooks + scripts.length },
    guideDocumentCount,
    timesAreFileMtime: true,
  };
}
