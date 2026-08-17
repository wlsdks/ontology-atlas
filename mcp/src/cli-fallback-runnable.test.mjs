// 「MCP 가 없을 때 이걸 쓰세요」가 실제로 실행돼야 한다.
//
// ## 왜 (2026-08-17 실측)
//
// `agent-brief` 가 에이전트에게 이렇게 건네고 있었다:
//
//   CLI FALLBACKS (MCP connector unavailable)
//     ontology-atlas workspace-brief [vault] --limit 5
//     ontology-atlas health [vault] --limit 5
//
// 그 이름의 전역 명령은 **없다**(레지스트리 발행 폐기, 2026-07-27 원장).
// 그대로 붙여넣으면 `command not found` 다 — 정작 MCP 가 없어서 이 줄이 가장
// 필요한 순간에.
//
// ## 같은 결함이 이미 한 번 고쳐졌다
//
// `cli/src/commands/agent-brief.mjs` 주석에 2026-07-29 기록이 있다:
// *"이 팩이 찍는 명령이 `ontology-atlas …` 였다 … 19줄 전부 복사하면
// `command not found` 였다 — 헤더는 'Run these commands' 라고 적혀 있는데도."*
//
// 그때 **그래프 DB 팩**은 고쳤는데 **이 생산자는 안 고쳤다.** 한 저장소에 같은
// 거짓말을 하는 자리가 둘이었고, 하나만 고쳐졌다.
//
// 그래서 값이 아니라 **성질**을 잠근다: 이 엔진이 내놓는 CLI 명령 중 실행
// 불가능한 맨몸 이름으로 시작하는 것이 없어야 한다.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

let uidSeq = 0;
const doc = (slug, frontmatter) => {
  uidSeq += 1;
  return {
    slug,
    frontmatter: { uid: `00000000-0000-4000-8000-${String(uidSeq).padStart(12, '0')}`, ...frontmatter },
    body: '',
    mtime: 1,
  };
};

function brief() {
  const artifact = compileOntology(
    [
      doc('domains/auth', { kind: 'domain', title: 'Auth', capabilities: ['capabilities/login'] }),
      doc('capabilities/login', { kind: 'capability', title: 'Login', domain: 'domains/auth' }),
    ],
    { includeIndexes: true },
  );
  return queryCompiledOntology(artifact, { operation: 'agent_brief', limit: 5 });
}

/** 실행할 수 없는 이름 — 이 저장소는 npm 에 발행하지 않는다. */
const DEAD_PREFIX = 'ontology-atlas ';

test('검사가 헛돌고 있지 않다 — 실제로 명령을 내놓는다', () => {
  const commands = brief().cliFallbackCommands;
  assert.ok(Array.isArray(commands), 'cliFallbackCommands 가 배열이 아니다');
  assert.ok(commands.length > 0, '명령이 하나도 없다 — 이 검사는 아무것도 못 잰다');
});

test('맨몸 `ontology-atlas` 로 시작하는 명령이 없다', () => {
  const commands = brief().cliFallbackCommands;
  const dead = commands.filter((c) => typeof c === 'string' && c.startsWith(DEAD_PREFIX));
  assert.deepEqual(
    dead,
    [],
    `이 명령들은 붙여넣으면 command not found 다:\n${dead.join('\n')}`,
  );
});

test('그 자리에 실제로 실행되는 모양이 들어 있다', () => {
  // 늘 빈손이면 위 검사가 통과해도 의미가 없다. 형태까지 본다:
  // `node <…>/cli/src/index.mjs <sub> …`
  const commands = brief().cliFallbackCommands;
  const runnable = commands.filter(
    (c) => typeof c === 'string' && /^node\s+\S*cli\/src\/index\.mjs\s+\S/.test(c),
  );
  assert.ok(
    runnable.length > 0,
    `실행 가능한 모양이 하나도 없다:\n${commands.join('\n')}`,
  );
});
