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
import { spawnSync } from 'node:child_process';
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
import { verifyMcpBinary, verifyMcpParity } from './verify-mcp-binary.mjs';

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

const triple = flagValue('--target') ?? hostTargetTriple();
if (!triple) fail(`Unsupported host platform/architecture: ${process.platform}/${process.arch}`);

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

const vault = path.join(root, 'docs', 'ontology');
try {
  const result = await verifyMcpBinary({ binaryPath: outFile, vaultPath: vault });
  console.log(
    `✔ spawn check — version ${result.version}, ${result.toolCount} tools, vault ${path.relative(root, vault)}`,
  );
  const parity = await verifyMcpParity({ binaryPath: outFile, vaultPath: vault });
  console.log(
    `✔ source/bundled parity — ${parity.toolCount} tools, ${parity.sourceVersion} / ${parity.bundledVersion}`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
