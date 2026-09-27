import { analyzeAgentFiles, type AgentFileEntry, type AgentFilesAnalysis } from './agent-files';

import { collectHookFacts, wiredHookCount, type HookConfigFacts } from './hook-wiring';
import {
  candidateScopeDeclarations,
  resolveScopeDeclarations,
} from './coverage-collect';
import type { ScopeDeclaration } from './coverage-scopes';
import { buildDocumentReach, type DocumentReach } from './document-reach';

/**
 * Feeds `analyzeAgentFiles` through a file port that can see dot directories, which the File
 * System Access API cannot. The scanned set must stay identical to `cli/src/lib`'s.
 */

export interface HarnessScanPort {
  /** Directory entries at a repo-relative path, or `null` when the path does not exist. */
  listDir(relativePath: string): Promise<readonly { name: string; kind: 'file' | 'directory' }[] | null>;
  /** File text plus its modification time, or `null` when the file does not exist. */
  readText(relativePath: string): Promise<{ text: string; lastModified: number | null } | null>;
  /** Optional; without it the fallback costs two round trips (`listDir`, then `readText`). */
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
  /* A classifier rule only fires on paths this list asks for. */
  '.cursorignore',
  '.cursorindexingignore',
  '.codeiumignore',
  '.aiexclude',
  '.aiignore',
  '.geminiignore',
]);

/** The only dot directories this scan walks. */
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

/** Markdown census bounds; a hit bound is reported as `DocumentReach.truncated`, never trimmed silently. */
const MARKDOWN_MAX_DEPTH = 8;
const MARKDOWN_MAX_DIRECTORIES = 3000;
/** Room above the ~600 authored records; past it the walk reports truncation. */
const MARKDOWN_MAX_READS = 800;

/** The hook configs this scan knows how to read, and whether the tool gates execution on approval. */
const HOOK_CONFIGS: ReadonlyArray<{ path: string; approvalGate: boolean }> = Object.freeze([
  { path: '.claude/settings.json', approvalGate: false },
  { path: '.codex/hooks.json', approvalGate: true },
]);

/**
 * Rule ids the repository's parity check compares byte for byte. Hook scripts are left out:
 * Codex hooks are adapted from Claude's, so they differ by design.
 */
const DECLARED_PAIR_RULES: Readonly<Record<string, string>> = Object.freeze({
  'claude-skills': '.agents/skills',
  'agents-skills': '.claude/skills',
  'claude-agents': '.agents/agents',
  'agents-agents': '.claude/agents',
});

const PAIR_DRIFT_CODES = new Set([
  'skill-copy-diverged',
  'skill-copy-file-missing',
  'agent-copy-diverged',
  'agent-copy-file-missing',
]);

export function declaredPairFor(ruleId: string): string | null {
  return DECLARED_PAIR_RULES[ruleId] ?? null;
}

export function isPairDrift(code: string): boolean {
  return PAIR_DRIFT_CODES.has(code);
}

/** One definition of a guide for both the sentence's count and the guides table. */
export function isGuideRecord(record: { kind: string }): boolean {
  /* An exclusion says what an agent may not see, so it is not something the repository tells agents. */
  return record.kind !== 'config' && record.kind !== 'exclusion';
}

/** Test files a runner discovers by glob, so an unnamed domain is not read as untested. */
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
  /** The sum the screen prints beside its three parts. */
  total: number;
}

export interface HarnessReport {
  analysis: AgentFilesAnalysis;
  hookGroups: readonly HookConfigFacts[];
  /** Modification times by path; see `HarnessReport.timesAreFileMtime`. */
  times: readonly HarnessFileTime[];
  /** Every scanned file's text, so the drift view needs no second read. */
  contents: ReadonlyMap<string, string>;
  checks: HarnessCheckCensus;
  /** Guide documents found, excluding hook configs and scripts. */
  guideDocumentCount: number;
  /** Scope declarations; empty when the caller passed no capability paths. */
  coverage: readonly ScopeDeclaration[];
  /** Authored Markdown split by whether a guide sends an agent to it. */
  documentReach: DocumentReach;
  /** Files a test runner discovers by name, read together with the Watched cell's check list. */
  testFiles: readonly string[];
  /** Files under `.githooks/`, listed even when the coverage pass does not run. */
  gitHookFiles: readonly string[];
  /** `.github/workflows/*` paths, listed even when the coverage pass does not run. */
  workflowFiles: readonly string[];
  /** Filesystem mtimes, not commit dates: a fresh checkout stamps every file. */
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
 * One level deep, matching the classifier's `nested-agents-md` rule; deeper files such as
 * `cli/templates/vault/AGENTS.md` are shipped product data.
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

/** `.githooks/<name>` → its text. */
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

/** Workflow texts, read only for a `paths:` trigger filter. */
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

/** Check-script names → their commands, sorted for a stable census. */
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

/** Per-pass progress; a count appears only when its denominator is known before the pass. */
export interface HarnessScanProgress {
  stage:
    | 'roots'
    | 'nested'
    | 'agent-directories'
    | 'hooks'
    | 'documents'
    | 'citations'
    | 'citation-hops'
    | 'coverage';
  done: number;
  /** Known before the pass starts, or `null`. */
  total: number | null;
}

/** What the coverage join needs from the vault. Absent means the coverage pass does not run. */
export interface HarnessScanOptions {
  /** Canonical implementation paths the vault records, one per capability. */
  capabilityPaths?: readonly string[];
  /** Repo-relative folders left out of the Markdown census and named on screen, such as an in-checkout ontology folder. */
  excludedFolders?: readonly string[];
  onProgress?: (progress: HarnessScanProgress) => void;
}

/** Authored Markdown outside the scanned dot directories, whose files come from `contents`. */
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
    if (TEST_FILE_NAME.test(entry.name)) testFiles.push(path);
  }
  return truncated;
}

/**
 * Plain directory lines from `.gitignore` only; guessing at wildcards or negation could drop
 * authored files silently.
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

export async function scanHarness(
  port: HarnessScanPort,
  options: HarnessScanOptions = {},
): Promise<HarnessReport> {
  const files: AgentFileEntry[] = [];
  const times: HarnessFileTime[] = [];
  const report = options.onProgress ?? (() => {});

  for (const [index, path] of ROOT_FILES.entries()) {
    const file = await port.readText(path);
    /* Reported after the unit: `done` counts finished units. */
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
  /* No denominator: `resolveScopeDeclarations` reports nothing from inside its `Promise.all`. */
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
  /* The directory count is unknown before the walk, so no denominator. */
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
  /* The walk skips dot directories; `.github` beyond `copilot-instructions.md` would otherwise go uncounted. */
  truncated =
    (await walkMarkdown(port, '.github', 1, excludedFolders, markdownPaths, testFiles, budget)) ||
    truncated;
  /* Reads authored Markdown for the transitive citation walk up to a bound, then reports truncation. */
  const uniqueMarkdown = [...new Set(markdownPaths)].sort();
  const reachContents = new Map(contentByPath);
  let budgetLeft = MARKDOWN_MAX_READS;
  for (const [index, path] of uniqueMarkdown.entries()) {
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
      /* Yield so the progress frame can paint. */
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
    gitHookFiles: [...gitHooks.keys()].sort(),
    workflowFiles: [...workflows.keys()].sort(),
    timesAreFileMtime: true,
  };
}
