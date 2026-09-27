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

test('the scan is not idle: it yields real commands', () => {
  const commands = brief().cliFallbackCommands;
  assert.ok(Array.isArray(commands));
  assert.ok(commands.length > 0, 'no commands found, so this check measures nothing');
});

test('no command starts with a bare `ontology-atlas`', () => {
  const commands = brief().cliFallbackCommands;
  const dead = commands.filter((c) => typeof c === 'string' && c.startsWith(DEAD_PREFIX));
  assert.deepEqual(
    dead,
    [],
    `these commands fail with command not found when pasted:\n${dead.join('\n')}`,
  );
});

test('each command has a runnable form instead', () => {
  // An always-empty result would pass the check above while meaning nothing, so
  // the shape is checked too: `node <…>/cli/src/index.mjs <sub> …`
  const commands = brief().cliFallbackCommands;
  const runnable = commands.filter(
    (c) => typeof c === 'string' && /^node\s+\S*cli\/src\/index\.mjs\s+\S/.test(c),
  );
  assert.ok(
    runnable.length > 0,
    `no runnable form found:\n${commands.join('\n')}`,
  );
});
