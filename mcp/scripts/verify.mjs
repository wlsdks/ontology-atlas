#!/usr/bin/env node
/**
 * MCP server verify CLI — UX-3.
 *
 * 사용자가 .mcp.json 등록 후 *서버가 정상* 인지 1 명령으로 확인.
 *
 * 사용법:
 *   node mcp/scripts/verify.mjs                    # vault = cwd
 *   OMOT_VAULT=./docs/ontology node mcp/scripts/verify.mjs
 *
 * 검증 항목:
 *   1. parser smoke test (parser.test.mjs) 통과
 *   2. server boot — initialize JSON-RPC 응답
 *   3. tools/list — 7 도구 모두 노출
 *   4. tools/call list_concepts — vault 노드 수 출력
 *
 * 모두 PASS → exit 0, 실패 → exit 1 + 진단 메시지.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..');
const PARSER_TEST = join(MCP_ROOT, 'src', 'parser.test.mjs');
const SERVER_ENTRY = join(MCP_ROOT, 'src', 'index.js');
const VAULT = process.env.OMOT_VAULT || process.cwd();

const EXPECTED_TOOLS = [
  'list_concepts',
  'get_concept',
  'find_evidence',
  'find_backlinks',
  'find_path',
  'list_kinds',
  'add_concept',
  'add_relation',
  'patch_concept',
];

function log(level, msg) {
  const tag =
    level === 'ok' ? '\x1b[32m✓\x1b[0m' :
    level === 'fail' ? '\x1b[31m✗\x1b[0m' :
    level === 'info' ? '·' : '?';
  console.log(`${tag} ${msg}`);
}

async function step1ParserSmoke() {
  log('info', 'step 1 — parser smoke test');
  return new Promise((res) => {
    const proc = spawn('node', [PARSER_TEST], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('close', (code) => {
      if (code === 0 && /passed/.test(stdout)) {
        log('ok', stdout.trim().split('\n').slice(-1)[0]);
        res(true);
      } else {
        log('fail', `parser test 실패 (exit ${code})`);
        if (stdout) console.error(stdout);
        if (stderr) console.error(stderr);
        res(false);
      }
    });
  });
}

async function step2BootAndCall() {
  log('info', `step 2 — server boot + tools/list + list_concepts (vault=${VAULT})`);

  const lines = [
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'verify-cli', version: '0' },
      },
    }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { limit: 5 } },
    }),
  ];

  return new Promise((res) => {
    const proc = spawn('node', [SERVER_ENTRY], {
      env: { ...process.env, OMOT_VAULT: VAULT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));

    proc.stdin.write(lines.join('\n') + '\n');
    setTimeout(() => proc.kill('SIGTERM'), 2000);

    proc.on('close', () => {
      const responses = stdout
        .split('\n')
        .filter(Boolean)
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const initRes = responses.find((r) => r.id === 1);
      const listRes = responses.find((r) => r.id === 2);
      const callRes = responses.find((r) => r.id === 3);

      if (!initRes || !initRes.result) {
        log('fail', `initialize 응답 없음. stderr: ${stderr.slice(0, 300)}`);
        return res(false);
      }
      log('ok', `initialize OK — server ${initRes.result.serverInfo?.name}@${initRes.result.serverInfo?.version}`);

      if (!listRes || !listRes.result?.tools) {
        log('fail', 'tools/list 응답 없음');
        return res(false);
      }
      const toolNames = listRes.result.tools.map((t) => t.name).sort();
      const expectedSorted = [...EXPECTED_TOOLS].sort();
      const missing = expectedSorted.filter((n) => !toolNames.includes(n));
      const extra = toolNames.filter((n) => !expectedSorted.includes(n));
      if (missing.length > 0 || extra.length > 0) {
        log('fail', `tools 불일치 — missing: ${missing.join(',') || '(없음)'}, extra: ${extra.join(',') || '(없음)'}`);
        return res(false);
      }
      log('ok', `tools/list ${toolNames.length}/${EXPECTED_TOOLS.length} — ${toolNames.join(' · ')}`);

      if (!callRes || !callRes.result) {
        log('fail', 'list_concepts 호출 응답 없음');
        return res(false);
      }
      try {
        const text = callRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        log('ok', `list_concepts — vault total ${parsed.total} 노드 (vaultRoot ${parsed.vaultRoot})`);
        if (parsed.total === 0) {
          log('info', '경고: vault 가 비어있음. OMOT_VAULT 가 올바른 폴더를 가리키는지 확인 (예: ./docs/ontology)');
        }
        res(true);
      } catch (err) {
        log('fail', `list_concepts 응답 파싱 실패: ${err.message}`);
        res(false);
      }
    });

    proc.on('error', (err) => {
      log('fail', `서버 spawn 실패: ${err.message}`);
      res(false);
    });
  });
}

async function main() {
  console.log('\n[oh-my-ontology-mcp verify]\n');
  const ok1 = await step1ParserSmoke();
  if (!ok1) process.exit(1);
  const ok2 = await step2BootAndCall();
  if (!ok2) process.exit(1);
  console.log('\n\x1b[32m전체 통과\x1b[0m — Claude Code 에 .mcp.json 등록 후 재시작하면 7 도구 사용 가능합니다.\n');
  process.exit(0);
}

main();
