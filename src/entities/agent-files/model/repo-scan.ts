import { codedFailure } from '@/shared/lib/failures/failure-code';

import { analyzeAgentFiles, type AgentFileEntry, type AgentFilesAnalysis } from './agent-files';

import { collectHookFacts, type HookConfigFacts } from './hook-wiring';
import { scopeDeclarations, type ScopeDeclaration } from './scope-declarations';
import { harnessReadClass, isReadableHarnessPath } from './harness-read-scope';

/** Feeds `analyzeAgentFiles` through a file port that can see dot directories, which the File System Access API cannot. */

type DirEntries = readonly { name: string; kind: 'file' | 'directory' }[];

/** `null` means the path does not exist; a read that fails throws, so it never counts as absence. */
export interface HarnessScanPort {
  listDir(relativePath: string): Promise<DirEntries | null>;
  readText(
    relativePath: string,
  ): Promise<{ text: string; lastModified: number | null; bytes?: number } | null>;
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

/** The hook configs this scan knows how to read, and whether the tool gates execution on approval. */
const HOOK_CONFIGS: ReadonlyArray<{ path: string; approvalGate: boolean }> = Object.freeze([
  { path: '.claude/settings.json', approvalGate: false },
  { path: '.codex/hooks.json', approvalGate: true },
]);

const PAIR_DRIFT_CODES = new Set([
  'skill-copy-diverged',
  'skill-copy-file-missing',
  'agent-copy-diverged',
  'agent-copy-file-missing',
]);

export function isPairDrift(code: string): boolean {
  return PAIR_DRIFT_CODES.has(code);
}

/** `package.json` script names that run a linter, a type check, or a test suite. */
const CHECK_SCRIPT_NAME = /^(lint|test|typecheck)(:|$)/;

export interface HarnessReport {
  analysis: AgentFilesAnalysis;
  hookGroups: readonly HookConfigFacts[];
  /** Every scanned file's text, so the detail and drift views need no second read. */
  contents: ReadonlyMap<string, string>;
  /** `package.json` scripts matching `CHECK_SCRIPT_NAME`, sorted. */
  checkScripts: readonly string[];
  declarations: readonly ScopeDeclaration[];
  /** Files under `.githooks/`. */
  gitHookFiles: readonly string[];
  /** `.github/workflows/*` paths. */
  workflowFiles: readonly string[];
  topLevelFolders: readonly string[];
}

async function walk(
  port: HarnessScanPort,
  root: string,
  depth: number,
  out: AgentFileEntry[],
): Promise<void> {
  if (depth > SCAN_MAX_DEPTH) return;
  const entries = await port.listDir(root);
  if (!entries) return;
  for (const entry of entries) {
    const path = `${root}/${entry.name}`;
    if (entry.kind === 'directory') {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      await walk(port, path, depth + 1, out);
      continue;
    }
    if (!isReadableHarnessPath(path)) continue;
    const file = await port.readText(path);
    if (!file) continue;
    out.push({ path, content: file.text, bytes: file.bytes });
  }
}

/**
 * One level deep, matching the classifier's `nested-agents-md` rule; deeper files such as
 * `cli/templates/vault/AGENTS.md` are shipped product data.
 */
async function nestedAgentsFiles(
  port: HarnessScanPort,
  entries: DirEntries,
  out: AgentFileEntry[],
  folders: string[],
): Promise<void> {
  for (const entry of entries) {
    if (entry.kind !== 'directory') continue;
    if (SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    folders.push(entry.name);
    const path = `${entry.name}/AGENTS.md`;
    if (!isReadableHarnessPath(path)) continue;
    const file = await port.readText(path);
    if (!file) continue;
    out.push({ path, content: file.text, bytes: file.bytes });
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
  stage: 'roots' | 'nested' | 'agent-directories' | 'hooks';
  done: number;
  /** Known before the pass starts, or `null`. */
  total: number | null;
}

interface HarnessScanOptions {
  /** Repo-relative folders left out of `topLevelFolders`, such as an in-checkout ontology folder. */
  excludedFolders?: readonly string[];
  onProgress?: (progress: HarnessScanProgress) => void;
}

function ignoredRootNames(gitignoreText: string | null): Set<string> {
  const out = new Set<string>();
  for (const raw of String(gitignoreText ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!') || /[*?[\]]/.test(line)) continue;
    const name = line.replace(/^\//, '').replace(/\/$/, '');
    if (name && !name.includes('/')) out.add(name);
  }
  return out;
}

export async function scanHarness(
  port: HarnessScanPort,
  options: HarnessScanOptions = {},
): Promise<HarnessReport> {
  const files: AgentFileEntry[] = [];
  const report = options.onProgress ?? (() => {});
  const rootEntries = await port.listDir('');
  /* A missing source root is a failed read, not an empty harness. */
  if (!rootEntries) throw codedFailure('harness-source-missing');

  for (const [index, path] of ROOT_FILES.entries()) {
    const file = await port.readText(path);
    /* Reported after the unit: `done` counts finished units. */
    report({ stage: 'roots', done: index + 1, total: ROOT_FILES.length });
    if (!file) continue;
    files.push({ path, content: file.text, bytes: file.bytes });
  }
  report({ stage: 'nested', done: 0, total: null });
  const rootFolders: string[] = [];
  await nestedAgentsFiles(port, rootEntries, files, rootFolders);
  for (const [index, dir] of SCAN_DIRS.entries()) {
    await walk(port, dir, 0, files);
    report({ stage: 'agent-directories', done: index + 1, total: SCAN_DIRS.length });
  }

  const existingPaths = files.map((file) => file.path);
  const analysis = analyzeAgentFiles({ files, existingPaths });

  const contentByPath = new Map(files.map((file) => [file.path, file.content ?? '']));
  const scriptExists = async (path: string) => {
    if (contentByPath.has(path)) return true;
    if (harnessReadClass(path) === 'invalid') return false;
    if (port.pathExists) return port.pathExists(path);
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

  const scripts = checkScripts((await port.readText('package.json'))?.text ?? null);
  const gitHooks = await readGitHooks(port);
  const workflows = await readWorkflows(port);
  const gitignore = await port.readText('.gitignore');
  const excludedFolders = options.excludedFolders ?? [];
  const ignoredRoots = ignoredRootNames(gitignore?.text ?? null);
  return {
    analysis,
    hookGroups,
    contents: contentByPath,
    checkScripts: [...scripts.keys()],
    declarations: scopeDeclarations({
      contents: contentByPath,
      gitHooks,
      checkScripts: scripts,
      workflows,
    }),
    gitHookFiles: [...gitHooks.keys()].sort(),
    workflowFiles: [...workflows.keys()].sort(),
    topLevelFolders: rootFolders
      .filter((name) => !excludedFolders.includes(name) && !ignoredRoots.has(name))
      .sort(),
  };
}
