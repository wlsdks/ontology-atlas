// `ontology-atlas agent-files [--root path]` — read-only detection of which
// AI tool reads which instruction file, plus six drift checks (CLAUDE.md ↔
// AGENTS.md bridge · duplicated skill trees byte diff · duplicated agent-brief
// byte diff · @reference existence · English-only agent text · AGENTS.md Codex
// 32 KiB cap). Never converts, syncs, or repairs — this is
// a workbench readout, not a rulesync-style converter (strategy-audit no-go).

import { COLORS } from '../lib/colors.mjs';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';

import { formatUnknownFlagError, parseRequiredFlagValue } from '../lib/cli-args.mjs';
import {
  AGENT_TOOL_LABELS,
  analyzeAgentFiles,
  classifyAgentFilePath,
  extractAtRefs,
} from '../lib/agent-files.mjs';

const ALLOWED_FLAGS = ['--root', '--json', '--english-only'];

/** Root-level single-file candidates. */
const ROOT_FILE_CANDIDATES = Object.freeze([
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.mcp.json',
  '.github/copilot-instructions.md',
  '.claude/settings.json',
]);

/** Directories walked recursively: the only dot-dirs this command touches. */
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

/** Files larger than this keep bytes-only (still byte-diffable via stat size). */
const MAX_CONTENT_BYTES = 512 * 1024;

export async function runAgentFiles(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  let result;
  try {
    result = buildAgentFilesReport(parsed);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (parsed.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.summary.driftCount > 0 ? 1 : 0;
  }

  render(result);
  return result.summary.driftCount > 0 ? 1 : 0;
}

function buildAgentFilesReport(parsed) {
  const root = resolveRoot(parsed.root);
  const files = scanAgentFiles(root);
  const existingPaths = resolveReferencedPaths(root, files);
  const analysis = analyzeAgentFiles({
    files,
    existingPaths,
    requireEnglish: parsed.englishOnly === true,
  });
  return {
    operation: 'agent_files',
    sideEffect: false,
    root,
    summary: analysis.summary,
    files: analysis.records,
    checks: analysis.checks,
    drift: analysis.drift,
  };
}

/** Scan only the known agent-file patterns: never the whole disk (local-first). */
function scanAgentFiles(root) {
  const entries = [];
  for (const candidate of ROOT_FILE_CANDIDATES) {
    const abs = join(root, candidate);
    if (existsSync(abs) && statSync(abs).isFile()) {
      entries.push(readEntry(abs, candidate));
    }
  }
  // Codex merges AGENTS.md root-down along the working directory, so a nested
  // file is instruction surface even though no SCAN_DIRS entry names it. One
  // level deep matches the classification rule and keeps the walk cheap.
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const relative = `${entry.name}/AGENTS.md`;
    const abs = join(root, relative);
    if (existsSync(abs) && statSync(abs).isFile() && classifyAgentFilePath(relative)) {
      entries.push(readEntry(abs, relative));
    }
  }
  for (const dir of SCAN_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    for (const relative of walkFiles(abs, dir)) {
      if (classifyAgentFilePath(relative)) {
        entries.push(readEntry(join(root, relative), relative));
      }
    }
  }
  return entries;
}

function walkFiles(absDir, relDir) {
  const out = [];
  for (const name of readdirSync(absDir)) {
    const absChild = join(absDir, name);
    const relChild = `${relDir}/${name}`;
    const stat = statSync(absChild);
    if (stat.isDirectory()) out.push(...walkFiles(absChild, relChild));
    else if (stat.isFile()) out.push(relChild);
  }
  return out;
}

function readEntry(absPath, relativePath) {
  const bytes = statSync(absPath).size;
  const content = bytes <= MAX_CONTENT_BYTES ? readFileSync(absPath, 'utf-8') : null;
  return { path: relativePath, content, bytes };
}

/**
 * Resolve @reference candidates against the real filesystem so the pure
 * analyzer can judge existence. Only paths actually referenced are probed —
 * no broad disk scan.
 */
function resolveReferencedPaths(root, files) {
  const existing = new Set();
  for (const entry of files) {
    if (!/\.(md|mdc)$/.test(entry.path) || typeof entry.content !== 'string') continue;
    const dir = entry.path.includes('/')
      ? entry.path.slice(0, entry.path.lastIndexOf('/'))
      : '';
    for (const { ref } of extractAtRefs(entry.content)) {
      if (ref.includes('*')) continue;
      for (const candidate of [ref, dir ? `${dir}/${ref}` : ref]) {
        const normalized = candidate.split('/').filter((p) => p !== '.' && p !== '').join('/');
        if (normalized.includes('..')) continue;
        if (existsSync(join(root, normalized))) existing.add(normalized);
      }
    }
  }
  // the bridge check probes AGENTS.md existence even when it wasn't scanned
  if (existsSync(join(root, 'AGENTS.md'))) existing.add('AGENTS.md');
  return [...existing].sort();
}

/**
 * Reports how close AGENTS.md is to the Codex cap **before** it is exceeded.
 *
 * This check used to be binary — over the cap fails, otherwise silence. But the
 * penalty at the moment of crossing is severe: the excess is **truncated with no
 * warning**, so later sections stop existing for Codex. Binary means a person
 * learns about that cliff only **after stepping off it**.
 *
 * And with only a few hundred bytes of headroom left, adding one ordinary
 * paragraph turns CI red. When a gate looks like it blocks normal work, the next
 * step is a workaround rather than a cleanup. So the verdict (is it over?) is left
 * alone and only the **distance** is reported first.
 *
 * Not changing the verdict is the point — the return shape and status are
 * unchanged, so the equivalence contract with the web mirror
 * (`views/docs-vault/lib/agent-files.ts`) does not wobble.
 */
const CODEX_HEADROOM_WARN_RATIO = 0.1;

function renderCodexHeadroom(check) {
  if (!check || check.agentsMdBytes === null || check.status === 'not-applicable') return;
  const headroom = check.capBytes - check.agentsMdBytes;
  if (headroom <= 0) return; // already reported as drift — do not say it twice
  if (headroom > check.capBytes * CODEX_HEADROOM_WARN_RATIO) return;
  process.stdout.write(
    `${COLORS.yellow}near cap${COLORS.reset} ${COLORS.dim}AGENTS.md ${check.agentsMdBytes} / ${check.capBytes} bytes` +
      ` · ${headroom} bytes of headroom before Codex silently truncates${COLORS.reset}\n`,
  );
}

function render(result) {
  const summary = result.summary;
  const status = summary.driftCount === 0 ? 'in sync' : 'drift';
  const color = summary.driftCount === 0 ? COLORS.green : COLORS.yellow;
  process.stdout.write(
    `${color}${COLORS.bold}${status}${COLORS.reset} ${COLORS.dim}agent files${COLORS.reset}` +
      ` · ${summary.files} file(s) · ${summary.driftCount} drift finding(s)\n`,
  );
  process.stdout.write(`${COLORS.dim}root${COLORS.reset} ${result.root}\n`);
  renderCodexHeadroom(result.checks?.codexSizeCap);
  process.stdout.write('\n');

  for (const file of result.files) {
    const icon = file.drift.length > 0 ? COLORS.yellow : COLORS.green;
    const mark = file.drift.length > 0 ? 'drift ' : 'ok    ';
    const tools = file.tools.map((tool) => AGENT_TOOL_LABELS[tool] ?? tool).join(' · ');
    process.stdout.write(
      `${icon}${mark}${COLORS.reset} ${file.kind.padEnd(12)} ${file.path}\n` +
        `        ${COLORS.dim}read by ${tools} · ${file.bytes} bytes${
          file.drift.length > 0 ? ` · ${file.drift.join(', ')}` : ''
        }${COLORS.reset}\n`,
    );
  }

  process.stdout.write(`\n${COLORS.bold}Drift checks:${COLORS.reset}\n`);
  const checkLines = [
    ['claude-agents-bridge', result.checks.claudeAgentsBridge.status, 'CLAUDE.md → @AGENTS.md import bridge'],
    [
      'skill-copy',
      result.checks.skillCopy.status,
      `.claude/skills ↔ .agents/skills byte diff (${result.checks.skillCopy.comparedFiles} compared · ${result.checks.skillCopy.divergedFiles} diverged · ${result.checks.skillCopy.oneSidedFiles} one-sided)`,
    ],
    [
      'agent-copy',
      result.checks.agentCopy.status,
      `.claude/agents ↔ .agents/agents byte diff (${result.checks.agentCopy.comparedFiles} compared · ${result.checks.agentCopy.divergedFiles} diverged · ${result.checks.agentCopy.oneSidedFiles} one-sided)`,
    ],
    [
      'at-refs',
      result.checks.atRefs.status,
      `@reference existence (${result.checks.atRefs.refsChecked} checked · ${result.checks.atRefs.missingRefs} missing · ${result.checks.atRefs.unverifiedRefs} unverified)`,
    ],
    [
      'agent-language',
      result.checks.agentLanguage.status,
      `English-only agent text (${result.checks.agentLanguage.scannedFiles} scanned · ${result.checks.agentLanguage.flaggedFiles} flagged · ${result.checks.agentLanguage.codePoints} non-English code points)`,
    ],
    [
      'mcp-grants',
      result.checks.mcpGrants.status,
      result.checks.mcpGrants.status === 'not-applicable'
        ? 'no .mcp.json or no agent briefs to check'
        : `agent-brief MCP grants declared in .mcp.json (${result.checks.mcpGrants.briefsChecked} briefs · ${result.checks.mcpGrants.grantsChecked} grants · ${result.checks.mcpGrants.undeclaredServers.length} undeclared server${result.checks.mcpGrants.undeclaredServers.length === 1 ? '' : 's'})`,
    ],
    [
      'codex-size-cap',
      result.checks.codexSizeCap.status,
      result.checks.codexSizeCap.agentsMdBytes === null
        ? 'no AGENTS.md'
        : `AGENTS.md ${result.checks.codexSizeCap.agentsMdBytes} + worst nested ${result.checks.codexSizeCap.worstCaseBytes - result.checks.codexSizeCap.agentsMdBytes} = ${result.checks.codexSizeCap.worstCaseBytes} / ${result.checks.codexSizeCap.capBytes} bytes merged (Codex project_doc_max_bytes, ${result.checks.codexSizeCap.nestedFiles} nested)`,
],
  ];
  for (const [name, status_, description] of checkLines) {
    const c =
      status_ === 'drift' ? COLORS.yellow : status_ === 'ok' ? COLORS.green : COLORS.dim;
    process.stdout.write(
      `  ${c}${status_.padEnd(14)}${COLORS.reset} ${name.padEnd(20)} ${COLORS.dim}${description}${COLORS.reset}\n`,
    );
  }

  if (result.drift.length > 0) {
    process.stdout.write(`\n${COLORS.bold}Drift findings:${COLORS.reset}\n`);
    for (const finding of result.drift) {
      process.stdout.write(
        `  ${COLORS.yellow}${finding.code}${COLORS.reset} ${finding.path}\n` +
          `    ${COLORS.dim}${finding.message}${COLORS.reset}\n`,
      );
    }
    process.stdout.write(
      `\n${COLORS.dim}Read-only detection: fix files by hand (or with your agent); this command never rewrites them.${COLORS.reset}\n`,
    );
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { root: cwd(), json: false, englishOnly: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--root') flags.root = parseRequiredFlagValue('--root', args[++i]);
    else if (a.startsWith('--root=')) flags.root = parseRequiredFlagValue('--root', a.slice('--root='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--english-only') flags.englishOnly = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else return { error: `unexpected argument: ${a} (agent-files scans --root, it takes no positional args)` };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  return flags;
}

function resolveRoot(root) {
  const resolved = resolve(cwd(), root || '.');
  if (!existsSync(resolved)) throw new Error(`--root path does not exist: ${resolved}`);
  if (!statSync(resolved).isDirectory()) throw new Error(`--root path is not a directory: ${resolved}`);
  return resolved;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas agent-files [--root path] [--json] [--english-only]\n\n` +
      `Read-only detection of AI agent instruction files at the repo root:\n` +
      `which tool reads which file (CLAUDE.md, AGENTS.md, <dir>/AGENTS.md,\n` +
      `GEMINI.md, .claude/rules|skills|agents|hooks, .claude/settings.json,\n` +
      `.agents/skills|agents, .cursor, .cursorrules,\n` +
      `.github/copilot-instructions.md, .codex, .mcp.json) plus drift\n` +
      `checks: CLAUDE.md ↔ AGENTS.md import bridge, duplicated skill-tree\n` +
      `byte diff, duplicated agent-brief byte diff, @reference existence,\n` +
      `agent-brief MCP grants declared in .mcp.json,\n` +
      `and the Codex 32 KiB cap measured across the merged root + nested set.\n\n` +
      `--english-only adds a check that no agent file carries Hangul, kana or\n` +
      `Han. It is opt-in: a vault or repository may legitimately be written in\n` +
      `another language, so this is never assumed.\n\n` +
      `Exit code 0 = no drift, 1 = drift found, 2 = error. Nothing is written.\n`,
  );
}
