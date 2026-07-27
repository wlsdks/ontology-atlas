#!/usr/bin/env node
/**
 * MCP 서버를 단일 자기완결 바이너리로 컴파일해 앱 번들에 실을 자리에 놓는다.
 *
 *   node scripts/build-mcp-binary.mjs                     # 호스트 아키텍처
 *   node scripts/build-mcp-binary.mjs --target x86_64-apple-darwin
 *   node scripts/build-mcp-binary.mjs --skip-verify       # 컴파일만
 *
 * 왜 필요한가: 설치형 앱을 깔아도 에이전트가 붙지 못하는 모순을 끊는다.
 * 다운로드 1회가 사람 표면과 에이전트 표면을 동시에 설치하게 만든다.
 *
 * fail-closed: 컴파일 직후 실제로 스폰해 `initialize` → `tools/list` 왕복을
 * 받고 도구 수가 기대치와 같은지 본다. 부팅 못 하는 바이너리를 앱에 싣는 것이
 * 이 슬라이스의 최악 실패 모드라 여기서 막는다.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  MCP_BINARY_OUTPUT_DIR,
  MCP_SERVER_ENTRY,
  binaryFileNameForTriple,
  bunCompileArgs,
  hostTargetTriple,
  SUPPORTED_TARGET_TRIPLES,
} from './lib/mcp-binary.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function flagValue(name) {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    [
      'Usage: node scripts/build-mcp-binary.mjs [--target <triple>] [--skip-verify]',
      '',
      `  --target        ${SUPPORTED_TARGET_TRIPLES.join(' | ')} (default: host)`,
      '  --skip-verify   compile without spawning the result',
    ].join('\n'),
  );
  process.exit(0);
}

if (process.platform !== 'darwin') {
  fail('The bundled MCP binary is a macOS app payload — build it on macOS.');
}

const triple = flagValue('--target') ?? hostTargetTriple();
if (!triple) fail(`Unsupported host architecture: ${process.arch}`);

const outDir = path.join(root, MCP_BINARY_OUTPUT_DIR);
const outFile = path.join(outDir, binaryFileNameForTriple(triple));

if (!existsSync(path.join(root, MCP_SERVER_ENTRY))) {
  fail(`MCP entry not found: ${MCP_SERVER_ENTRY} (run from the repository root)`);
}

const bunProbe = spawnSync('bun', ['--version'], { encoding: 'utf-8' });
if (bunProbe.status !== 0) {
  fail(
    'bun is required to compile the bundled MCP binary.\n' +
      '  Install: curl -fsSL https://bun.sh/install | bash',
  );
}

mkdirSync(outDir, { recursive: true });

let compileArgs;
try {
  compileArgs = bunCompileArgs({ triple, outfile: outFile });
} catch (error) {
  fail(error.message);
}

console.log(`▸ bun ${compileArgs.join(' ')}`);
const compiled = spawnSync('bun', compileArgs, { stdio: 'inherit', cwd: root });
if (compiled.status !== 0) fail(`bun compile failed with exit ${compiled.status}`);
if (!existsSync(outFile)) fail(`bun reported success but ${outFile} is missing`);

const sizeMb = (statSync(outFile).size / (1024 * 1024)).toFixed(1);
console.log(`✔ ${path.relative(root, outFile)} — ${sizeMb} MB (bun ${bunProbe.stdout.trim()})`);

if (argv.includes('--skip-verify')) process.exit(0);

if (triple !== hostTargetTriple()) {
  console.log('ℹ cross-compiled binary — skipping the spawn check (cannot run it here).');
  process.exit(0);
}

const EXPECTED_MIN_TOOLS = 32;
const vault = path.join(root, 'docs', 'ontology');

const child = spawn(outFile, [], {
  env: { ...process.env, OATLAS_VAULT: vault },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});
child.on('error', (error) => fail(`could not spawn the compiled binary: ${error.message}`));

const request = (id, method) =>
  `${JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params:
      method === 'initialize'
        ? {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'build-mcp-binary', version: '1' },
          }
        : {},
  })}\n`;

child.stdin.write(request(1, 'initialize'));
setTimeout(() => child.stdin.write(request(2, 'tools/list')), 700);

const deadline = setTimeout(() => {
  child.kill();
  fail(
    `compiled binary did not answer within 20s.\n  exit signal path\n  stderr: ${stderr.slice(0, 600)}`,
  );
}, 20_000);

const poll = setInterval(() => {
  const messages = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const initialize = messages.find((m) => m.id === 1)?.result;
  const tools = messages.find((m) => m.id === 2)?.result?.tools;
  if (!initialize || !tools) return;

  clearInterval(poll);
  clearTimeout(deadline);
  child.kill();

  if (tools.length < EXPECTED_MIN_TOOLS) {
    fail(`compiled binary advertised ${tools.length} tools, expected ≥ ${EXPECTED_MIN_TOOLS}`);
  }
  console.log(
    `✔ spawn check — version ${initialize.serverInfo?.version}, ${tools.length} tools, vault ${path.relative(root, vault)}`,
  );
  process.exit(0);
}, 150);
