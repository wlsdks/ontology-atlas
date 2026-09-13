import { analyzeAgentFiles, type AgentFileEntry, type AgentFilesAnalysis } from './agent-files';

import { collectHookFacts, wiredHookCount, type HookConfigFacts } from './hook-wiring';
import {
  candidateScopeDeclarations,
  resolveScopeDeclarations,
} from './coverage-collect';
import type { ScopeDeclaration } from './coverage-scopes';
import { buildDocumentReach, type DocumentReach } from './document-reach';

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
  /**
   * Whether anything — file or directory — sits at this path.
   *
   * Optional, because the coverage join is the only caller and a port without it can still produce
   * the rest of the report. The fallback below asks `listDir` then `readText`, which is two round
   * trips where a bridge that knows the answer needs one.
   */
  pathExists?(relativePath: string): Promise<boolean>;
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

/**
 * Bounds on the Markdown census walk, which is the only part of this scan that crosses the whole
 * repository rather than a known list of directories.
 *
 * A bound that is hit is reported (`DocumentReach.truncated`) rather than silently trimming the
 * answer: a count that stopped early is a floor, and a screen that printed it as a total would be
 * making the flattering mistake in the one place this feature exists to prevent.
 */
const MARKDOWN_MAX_DEPTH = 8;
const MARKDOWN_MAX_DIRECTORIES = 3000;
/** Documents read for the citation walk beyond the ones the harness scan already holds. */
const MARKDOWN_MAX_READS = 600;

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

/**
 * A file a test runner finds by its own discovery glob rather than by being named in a command.
 *
 * This exists because of the one reading an empty Watched cell must not invite. On this repository
 * `src/widgets/ontology-map` — the Topology domain's whole recorded entrypoint — holds 76 colocated
 * test files and is named by no `package.json` script, because `vitest run` discovers it. A cell
 * that said only "no check names this domain" beside an amber mark was read as "this is not
 * tested", which is false and is the decision's own falsifier (Evidence seat, 2026-09-13).
 */
const TEST_FILE_NAME = /\.(test|spec)\.[cm]?[jt]sx?$/;

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
   * Every file that declares where it applies, with the text that declares it.
   *
   * Empty when the caller passed no capability paths: the coverage join is the only consumer, and
   * resolving scopes against the disk for a vault that records no implementation path would be
   * round trips spent on an answer nobody can read.
   */
  coverage: readonly ScopeDeclaration[];
  /** Authored Markdown split by whether a guide sends an agent to it. */
  documentReach: DocumentReach;
  /**
   * Every file a test runner discovers by name rather than by being named in a command.
   *
   * The second operand an empty Watched cell needs: "no check names this domain" and "no test file
   * sits under it" are different statements, and only the pair of them is safe to read.
   */
  testFiles: readonly string[];
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

/** `.githooks/<name>` → its text. The count the sentence prints is this map's size. */
async function readGitHooks(port: HarnessScanPort): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const entries = await port.listDir('.githooks');
  if (!entries) return out;
  for (const entry of entries) {
    if (entry.kind !== 'file') continue;
    const file = await port.readText(`.githooks/${entry.name}`);
    out.set(entry.name, file?.text ?? '');
  }
  return out;
}

/**
 * `.github/workflows/*.yml` → its text.
 *
 * Read for one reason only: whether the workflow declares a `paths:` trigger filter. What its jobs
 * run is not a path filter and is not read as one.
 */
async function readWorkflows(port: HarnessScanPort): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const entries = await port.listDir('.github/workflows');
  if (!entries) return out;
  for (const entry of entries) {
    if (entry.kind !== 'file' || !/\.ya?ml$/.test(entry.name)) continue;
    const file = await port.readText(`.github/workflows/${entry.name}`);
    if (file) out.set(`.github/workflows/${entry.name}`, file.text);
  }
  return out;
}

/** Check-script names → the command each one runs. Sorted, so the census reads the same every run. */
function checkScripts(packageJsonText: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!packageJsonText) return out;
  try {
    const scripts = (JSON.parse(packageJsonText) as { scripts?: Record<string, unknown> })?.scripts;
    if (!scripts || typeof scripts !== 'object') return out;
    for (const name of Object.keys(scripts).filter((n) => CHECK_SCRIPT_NAME.test(n)).sort()) {
      const command = scripts[name];
      out.set(name, typeof command === 'string' ? command : '');
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * **What the reader is waiting on, reported as it happens.**
 *
 * This read is genuinely long — it opens every root guide, walks eight dot directories, crosses the
 * whole checkout for authored Markdown, follows citations to a fixpoint and probes declared scopes
 * against the disk. A bare "Reading" on a black screen tells none of that, and a percentage
 * invented over an unknown denominator would be the lie this whole surface exists not to tell. So
 * each pass reports its own name, and a count only where the denominator is actually known before
 * the pass starts.
 */
export interface HarnessScanProgress {
  /** Which pass is running. The screen turns this into one word. */
  stage:
    | 'roots'
    | 'nested'
    | 'agent-directories'
    | 'hooks'
    | 'documents'
    | 'citations'
    | 'citation-hops'
    | 'coverage';
  /** Units finished in this pass. */
  done: number;
  /** Units this pass will do, when that is known before it starts. `null` means it is not. */
  total: number | null;
}

/** What the coverage join needs from the vault. Absent means the coverage pass does not run. */
export interface HarnessScanOptions {
  /** Canonical implementation paths the vault records, one per capability. */
  capabilityPaths?: readonly string[];
  /**
   * Repo-relative folders left out of the Markdown census, named on screen.
   *
   * The ontology folder belongs here whenever it sits inside the checkout, as Atlas's own does: its
   * files are the graph an agent reads over MCP, not documentation somebody forgot to link. Nothing
   * else is excluded by default — a fixture folder that should be unreferenced is a judgement for
   * the reader, and hiding it would make the census agree with itself.
   */
  excludedFolders?: readonly string[];
  /** Called as each pass advances. Never called with a fabricated denominator. */
  onProgress?: (progress: HarnessScanProgress) => void;
}

/**
 * Every authored Markdown file outside the scanned dot directories.
 *
 * The dot directories are not walked again — the main scan already read them, and their files are
 * taken from `contents`, which is also where the citation search gets its text. What this adds is
 * the rest of the checkout: `docs/`, `samples/`, a `README.md`, everything a person wrote and may
 * or may not have pointed an agent at.
 */
async function walkMarkdown(
  port: HarnessScanPort,
  root: string,
  depth: number,
  excluded: readonly string[],
  out: string[],
  testFiles: string[],
  budget: { directories: number },
): Promise<boolean> {
  if (depth > MARKDOWN_MAX_DEPTH) return true;
  if (budget.directories <= 0) return true;
  budget.directories -= 1;
  const entries = await port.listDir(root);
  if (!entries) return false;
  let truncated = false;
  for (const entry of entries) {
    const path = root ? `${root}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      if (excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) continue;
      truncated =
        (await walkMarkdown(port, path, depth + 1, excluded, out, testFiles, budget)) || truncated;
      continue;
    }
    if (/\.mdc?$/.test(entry.name)) out.push(path);
    /* Collected on the same walk, for the one thing an empty Watched cell must not be read as. */
    if (TEST_FILE_NAME.test(entry.name)) testFiles.push(path);
  }
  return truncated;
}

/**
 * Directory patterns a repository's own `.gitignore` marks as not-authored.
 *
 * Only the unambiguous shape is read: a plain directory line, no wildcard and no negation. That is
 * enough for the case that matters — a generated mirror such as `/public/docs-vault/` holding
 * copies of documents that already exist upstream — and a partial gitignore parser that guessed at
 * wildcards and re-inclusions would drop authored files without saying so, which is the one
 * direction this census may not fail in.
 */
function ignoredDirectories(gitignoreText: string | null): string[] {
  const out: string[] = [];
  for (const raw of String(gitignoreText ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    if (!line.endsWith('/') || /[*?[\]]/.test(line)) continue;
    const path = line.replace(/^\//, '').replace(/\/$/, '');
    if (path) out.push(path);
  }
  return out;
}

/** Reads the whole harness report for one repository root. */
export async function scanHarness(
  port: HarnessScanPort,
  options: HarnessScanOptions = {},
): Promise<HarnessReport> {
  const files: AgentFileEntry[] = [];
  const times: HarnessFileTime[] = [];
  const report = options.onProgress ?? (() => {});

  for (const [index, path] of ROOT_FILES.entries()) {
    const file = await port.readText(path);
    /* Reported after the unit, not before it: `done` is what is finished. Counting the unit that is
       still running put the last pass at its own total while it was still working. */
    report({ stage: 'roots', done: index + 1, total: ROOT_FILES.length });
    if (!file) continue;
    files.push({ path, content: file.text });
    times.push({ path, lastModified: file.lastModified });
  }
  report({ stage: 'nested', done: 0, total: null });
  await nestedAgentsFiles(port, files, times);
  for (const [index, dir] of SCAN_DIRS.entries()) {
    await walk(port, dir, 0, files, times);
    report({ stage: 'agent-directories', done: index + 1, total: SCAN_DIRS.length });
  }

  const existingPaths = files.map((file) => file.path);
  const analysis = analyzeAgentFiles({ files, existingPaths });

  const contentByPath = new Map(files.map((file) => [file.path, file.content ?? '']));
  const scriptExists = async (path: string) => {
    if (contentByPath.has(path)) return true;
    return (await port.readText(path)) !== null;
  };
  const hookGroups: HookConfigFacts[] = [];
  for (const [index, config] of HOOK_CONFIGS.entries()) {
    report({ stage: 'hooks', done: index, total: HOOK_CONFIGS.length });
    const text = contentByPath.get(config.path) ?? (await port.readText(config.path))?.text ?? null;
    if (text === null) continue;
    hookGroups.push(
      await collectHookFacts(config.path, text, scriptExists, { approvalGate: config.approvalGate }),
    );
  }

  const packageJson = await port.readText('package.json');
  const scripts = checkScripts(packageJson?.text ?? null);
  const wiredHooks = wiredHookCount(hookGroups);
  const gitHooks = await readGitHooks(port);
  const workflows = await readWorkflows(port);

  const guideDocumentCount = analysis.records.filter(isGuideRecord).length;

  const capabilityPaths = options.capabilityPaths ?? [];
  /*
   * One report, and deliberately no denominator. `resolveScopeDeclarations` probes its scopes in
   * one `Promise.all` and reports nothing from inside, so a total here would draw a determinate bar
   * frozen at one unit for the whole pass — a bar that asserts a scale and then does not move,
   * which is a worse claim than saying the length is not known (design-motion, 2026-09-13).
   */
  report({ stage: 'coverage', done: 0, total: null });
  const coverage = capabilityPaths.length
    ? await resolveScopeDeclarations(
        candidateScopeDeclarations({
          contents: contentByPath,
          hookGroups,
          gitHooks,
          checkScripts: scripts,
          workflows,
        }),
        capabilityPaths,
        async (relativePath) => {
          if (port.pathExists) return port.pathExists(relativePath);
          if ((await port.listDir(relativePath)) !== null) return true;
          return (await port.readText(relativePath)) !== null;
        },
      )
    : [];

  const gitignore = await port.readText('.gitignore');
  const excludedFolders = [
    ...(options.excludedFolders ?? []),
    ...ignoredDirectories(gitignore?.text ?? null),
  ];
  const markdownPaths = [...contentByPath.keys()].filter((path) => /\.mdc?$/.test(path));
  /* The checkout's directory count is not known before the walk, so this pass reports its name and
     its running count and no denominator. An indeterminate bar is the honest drawing of that. */
  report({ stage: 'documents', done: 0, total: null });
  const budget = { directories: MARKDOWN_MAX_DIRECTORIES };
  const testFiles: string[] = [];
  let truncated = await walkMarkdown(
    port,
    '',
    0,
    excludedFolders,
    markdownPaths,
    testFiles,
    budget,
  );
  /* The walk skips dot directories because the main scan already read the ones that hold agent
     files. `.github` is the exception it does not cover: only `copilot-instructions.md` is on the
     root list, so an issue template or a contributing note there would be missing from a census
     that claims to count every authored document. */
  truncated =
    (await walkMarkdown(port, '.github', 1, excludedFolders, markdownPaths, testFiles, budget)) ||
    truncated;
  /*
   * The citation walk is transitive, so it needs the text of the documents the guides reach, not
   * only the guides'. Reading every authored Markdown file would be hundreds of round trips for a
   * census; this reads the ones outside the already-scanned set up to a bound and reports the walk
   * as truncated if it hits it, because a count that stopped early is a floor.
   */
  const uniqueMarkdown = [...new Set(markdownPaths)].sort();
  const reachContents = new Map(contentByPath);
  let budgetLeft = MARKDOWN_MAX_READS;
  for (const [index, path] of uniqueMarkdown.entries()) {
    /* Here the denominator IS known — the walk just produced it — so this pass counts. */
    report({ stage: 'citations', done: index + 1, total: uniqueMarkdown.length });
    if (reachContents.has(path)) continue;
    if (budgetLeft <= 0) {
      truncated = true;
      break;
    }
    budgetLeft -= 1;
    const file = await port.readText(path);
    reachContents.set(path, file?.text ?? '');
  }
  const documentReach = await buildDocumentReach({
    markdownPaths: uniqueMarkdown,
    contents: reachContents,
    excluded: excludedFolders,
    truncated,
    onHop: async (hop) => {
      report({ stage: 'citation-hops', done: hop, total: null });
      /* Hand the main thread back so the frame this report asks for can actually paint. */
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  });

  const scriptNames = [...scripts.keys()];
  return {
    analysis,
    hookGroups,
    times,
    contents: contentByPath,
    checks: {
      wiredHooks,
      gitHooks: gitHooks.size,
      scripts: scriptNames,
      total: wiredHooks + gitHooks.size + scriptNames.length,
    },
    guideDocumentCount,
    coverage,
    documentReach,
    testFiles: [...new Set(testFiles)].sort(),
    timesAreFileMtime: true,
  };
}
