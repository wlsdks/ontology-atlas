// `ontology-atlas agent-files [--root path]` — read-only detection of which
// AI tool reads which instruction file, plus five drift checks (CLAUDE.md ↔
// AGENTS.md bridge · duplicated skill trees byte diff · duplicated agent-brief
// byte diff · @reference existence · AGENTS.md Codex 32 KiB cap). Never converts, syncs, or repairs — this is
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

const ALLOWED_FLAGS = ['--root', '--json'];

/** Root-level single-file candidates. */
const ROOT_FILE_CANDIDATES = Object.freeze([
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.mcp.json',
  '.github/copilot-instructions.md',
]);

/** Directories walked recursively: the only dot-dirs this command touches. */
const SCAN_DIRS = Object.freeze([
  '.claude/rules',
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
  const analysis = analyzeAgentFiles({ files, existingPaths });
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
 * AGENTS.md 가 Codex 상한에 얼마나 가까운지 **넘기 전에** 말한다.
 *
 * 이 검사는 원래 이분법이었다 — 넘으면 실패, 아니면 조용. 그런데 상한을
 * 넘는 순간의 벌칙이 크다(초과분이 **경고 없이 잘려서** 뒤쪽 절이 Codex 에게
 * 존재하지 않게 된다). 이분법이면 사람은 그 절벽을 **밟고 나서야** 안다.
 *
 * 게다가 여유가 수백 바이트만 남은 상태에서는 정상적인 한 문단 추가가 CI 를
 * 빨갛게 만든다. 게이트가 정상 작업을 막는 것처럼 보이면 다음 단계는 우회이지
 * 정리가 아니다. 그래서 판정(넘었나)은 그대로 두고 **거리**만 먼저 알린다.
 *
 * 판정을 바꾸지 않는 것이 요점이다 — 반환 shape 과 status 는 그대로라
 * 웹 미러(`views/docs-vault/lib/agent-files.ts`)와의 동등성 계약이 안 흔들린다.
 */
const CODEX_HEADROOM_WARN_RATIO = 0.1;

function renderCodexHeadroom(check) {
  if (!check || check.agentsMdBytes === null || check.status === 'not-applicable') return;
  const headroom = check.capBytes - check.agentsMdBytes;
  if (headroom <= 0) return; // 이미 drift 로 보고된다: 두 번 말하지 않는다
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
      'codex-size-cap',
      result.checks.codexSizeCap.status,
      result.checks.codexSizeCap.agentsMdBytes === null
        ? 'AGENTS.md 32 KiB Codex cap (no AGENTS.md)'
        : `AGENTS.md ${result.checks.codexSizeCap.agentsMdBytes} / ${result.checks.codexSizeCap.capBytes} bytes (Codex project_doc_max_bytes)`,
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
  const flags = { root: cwd(), json: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--root') flags.root = parseRequiredFlagValue('--root', args[++i]);
    else if (a.startsWith('--root=')) flags.root = parseRequiredFlagValue('--root', a.slice('--root='.length));
    else if (a === '--json') flags.json = true;
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
      `  ontology-atlas agent-files [--root path] [--json]\n\n` +
      `Read-only detection of AI agent instruction files at the repo root:\n` +
      `which tool reads which file (CLAUDE.md, AGENTS.md, GEMINI.md,\n` +
      `.claude/rules|skills|agents, .agents/skills|agents, .cursor,\n` +
      `.cursorrules,\n` +
      `.github/copilot-instructions.md, .codex, .mcp.json) plus five drift\n` +
      `checks: CLAUDE.md ↔ AGENTS.md import bridge, duplicated skill-tree\n` +
      `byte diff, duplicated agent-brief byte diff,\n` +
      `byte diff, @reference existence, and the AGENTS.md 32 KiB Codex cap.\n\n` +
      `Exit code 0 = no drift, 1 = drift found, 2 = error. Nothing is written.\n`,
  );
}
