#!/usr/bin/env node
// 문서 표면 생성기 — `docs/.generated/mcp-surface.json`.
//
// 왜 있나: 이 저장소의 문서 검사는 오랫동안 "README 에 이 문장이 있는가" 를
// 세는 산문 핀이었다. 그 핀은 **도구 동작이 바뀌고 문서가 안 바뀐 사고를 못
// 잡고**(문장은 그대로니까) 문서를 더 나은 말로 고치면 빨개졌다. 그래서
// 판별 기준을 하나로 바꿨다:
//
//   기계가 만들 수 있는 것만 검사한다. 사람이 판단해서 쓴 문장은 검사하지 않는다.
//
// 이 스크립트는 **실제 MCP 서버에 `tools/list` 를 물어서** 공개 표면을 적고,
// `--check` 로 재생성해 diff 한다(Kubernetes `verify-generated-docs.sh` ·
// GitLab `graphql-verify` 와 같은 형태). 그리고 등록된 이름이 문서에 실제로
// 나오는지까지 본다 — 새 도구를 등록하고 문서를 안 쓰면 여기서 걸린다.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CLI_COMMANDS } from '../cli/src/lib/cli-commands.mjs';
import {
  buildSurface,
  cliCommandsMissingFromDoc,
  diffSurface,
  namesMissingFromDoc,
  serializeSurface,
} from './lib/docs-surface.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', '.generated', 'mcp-surface.json');
const MCP_ENTRY = path.join(ROOT, 'mcp', 'src', 'index.js');
const MCP_README = path.join(ROOT, 'mcp', 'README.md');
const CLI_README = path.join(ROOT, 'cli', 'README.md');
const DEFAULT_TIMEOUT_MS = 20_000;

export function usage() {
  return [
    'Usage: node scripts/build-docs-surface.mjs [--check] [--timeout-ms N]',
    '',
    '  (default)        Regenerate docs/.generated/mcp-surface.json from the live registries.',
    '  --check          Regenerate in memory and fail on drift; also verify mcp/README.md and',
    '                   cli/README.md name every registered tool / command.',
    '  --timeout-ms N   MCP server tools/list timeout (default 20000).',
  ].join('\n');
}

export function parseArgs(argv) {
  const args = { check: false, help: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--timeout-ms') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) return { ...args, error: `invalid --timeout-ms: ${argv[i]}` };
      args.timeoutMs = value;
    } else if (arg.startsWith('--timeout-ms=')) {
      const value = Number(arg.slice('--timeout-ms='.length));
      if (!Number.isFinite(value) || value <= 0) return { ...args, error: `invalid --timeout-ms: ${arg}` };
      args.timeoutMs = value;
    } else return { ...args, error: `unknown argument: ${arg}` };
  }
  return args;
}

/**
 * 서버를 실제로 띄워 `tools/list` 를 받는다. 정적 파싱이 아니라 런타임에
 * 묻는 이유: 레지스트리는 5,000줄 파일 안에서 조립되고, 정적 파싱은 조립
 * 규칙이 바뀌는 순간 조용히 틀린 답을 준다.
 */
export function listMcpTools({ entry = MCP_ENTRY, cwd = ROOT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, OATLAS_VAULT: './docs/ontology' };
    delete env.OATLAS_READ_ONLY; // 읽기 전용 모드는 write 도구를 숨긴다 — 표면 전체를 적어야 한다.
    const child = spawn(process.execPath, [entry], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(
      () => finish(new Error(`MCP tools/list timed out after ${timeoutMs}ms. stderr: ${stderr.trim()}`)),
      timeoutMs,
    );

    child.on('error', (err) => finish(err));
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      let index;
      while ((index = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, index).trim();
        stdout = stdout.slice(index + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 1) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
        } else if (message.id === 2) {
          const tools = message.result?.tools;
          if (!Array.isArray(tools) || tools.length === 0) {
            finish(new Error(`tools/list returned no tools. stderr: ${stderr.trim()}`));
          } else finish(null, tools);
        }
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'ontology-atlas-docs-surface', version: '1' },
        },
      })}\n`,
    );
  });
}

export async function deriveSurfaceText(options = {}) {
  const tools = await listMcpTools(options);
  return serializeSurface(buildSurface({ tools, cliCommands: [...CLI_COMMANDS] }));
}

/**
 * 문서가 표면을 덮는지 — 등록된 도구/커맨드 이름이 각 README 에 나오는가.
 * 산문의 *내용* 은 보지 않는다. 이름은 코드에서 나왔으므로 코드-대조다.
 */
export function docCoverageProblems({ surface, mcpReadme, cliReadme }) {
  const problems = [];
  const missingTools = namesMissingFromDoc(
    surface.mcp.tools.map((tool) => tool.name),
    mcpReadme,
  );
  if (missingTools.length > 0) {
    problems.push(`mcp/README.md never names ${missingTools.length} registered tool(s): ${missingTools.join(', ')}`);
  }
  const missingCommands = cliCommandsMissingFromDoc(surface.cli.commands, cliReadme);
  if (missingCommands.length > 0) {
    problems.push(
      `cli/README.md never names ${missingCommands.length} registered command(s): ${missingCommands.join(', ')}`,
    );
  }
  return problems;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.error) {
    console.error(args.error);
    console.error(usage());
    return 2;
  }

  const generated = await deriveSurfaceText({ timeoutMs: args.timeoutMs });
  const surface = JSON.parse(generated);

  if (!args.check) {
    mkdirSync(path.dirname(OUT), { recursive: true });
    writeFileSync(OUT, generated, 'utf-8');
    console.log(
      `[docs-surface] ${surface.mcp.toolCount} MCP tools (${surface.mcp.readToolCount} read + ${surface.mcp.writeToolCount} write) · ` +
        `${surface.cli.commandCount} CLI commands → ${path.relative(ROOT, OUT)}`,
    );
    return 0;
  }

  let failed = false;
  if (!existsSync(OUT)) {
    console.error(`[docs-surface] missing ${path.relative(ROOT, OUT)} — run \`pnpm docs:surface:build\`.`);
    failed = true;
  } else {
    const committed = readFileSync(OUT, 'utf-8');
    const drift = diffSurface(generated, committed);
    if (drift) {
      console.error(`[docs-surface] ${path.relative(ROOT, OUT)} is stale — run \`pnpm docs:surface:build\`.`);
      console.error(`  first difference at line ${drift.line}`);
      console.error(`    expected: ${drift.expected}`);
      console.error(`    actual:   ${drift.actual}`);
      failed = true;
    }
  }

  const problems = docCoverageProblems({
    surface,
    mcpReadme: readFileSync(MCP_README, 'utf-8'),
    cliReadme: readFileSync(CLI_README, 'utf-8'),
  });
  for (const problem of problems) console.error(`[docs-surface] ${problem}`);
  if (problems.length > 0) failed = true;

  if (failed) return 1;
  console.log(
    `[docs-surface] current · ${surface.mcp.toolCount} MCP tools (${surface.mcp.readToolCount} read + ${surface.mcp.writeToolCount} write) · ` +
      `${surface.cli.commandCount} CLI commands documented`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error('[docs-surface] failed:', err.message ?? err);
      process.exitCode = 1;
    });
}
