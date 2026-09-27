// "Use this when MCP is unavailable" must actually run. No
// global `ontology-atlas` command exists (nothing is published to npm), so a bare-name
// line gives `command not found` exactly when MCP is gone. The lock is on the
// property: no emitted fallback may start with that bare name.

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
  // An always-empty list would pass the check above, so the runnable shape
  // (`node <…>/cli/src/index.mjs <sub> …`) is checked too.
  const commands = brief().cliFallbackCommands;
  const runnable = commands.filter(
    (c) => typeof c === 'string' && /^node\s+\S*cli\/src\/index\.mjs\s+\S/.test(c),
  );
  assert.ok(
    runnable.length > 0,
    `no runnable form found:\n${commands.join('\n')}`,
  );
});
