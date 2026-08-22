// "Use this when MCP is unavailable" has to actually run.
//
// Why (measured 2026-08-17): `agent-brief` was handing agents this:
//
//   CLI FALLBACKS (MCP connector unavailable)
//     ontology-atlas workspace-brief [vault] --limit 5
//     ontology-atlas health [vault] --limit 5
//
// No global command by that name **exists** (registry publishing was abandoned,
// decision ledger 2026-07-27). Pasting it gives `command not found` — at exactly
// the moment these lines matter most, because MCP is gone.
//
// The same defect was already fixed once. A 2026-07-29 note in
// `cli/src/commands/agent-brief.mjs` records it: *"the commands this pack printed
// were `ontology-atlas …` … copying all 19 lines gave `command not found` — with
// the header reading 'Run these commands'."*
//
// That fixed the **graph-DB pack** and left **this producer** alone. One
// repository had two places telling the same lie, and only one was fixed.
//
// So the lock is on the **property**, not the values: no CLI command this engine
// emits may start with an unrunnable bare name.

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

/** Names that cannot be run — this repository does not publish to npm. */
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
  // An always-empty result would pass the check above while meaning nothing, so
  // the shape is checked too: `node <…>/cli/src/index.mjs <sub> …`
  const commands = brief().cliFallbackCommands;
  const runnable = commands.filter(
    (c) => typeof c === 'string' && /^node\s+\S*cli\/src\/index\.mjs\s+\S/.test(c),
  );
  assert.ok(
    runnable.length > 0,
    `실행 가능한 모양이 하나도 없다:\n${commands.join('\n')}`,
  );
});
