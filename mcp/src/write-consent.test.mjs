import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONSENT_DECLINED,
  CONSENT_UNAVAILABLE,
  describeWrite,
  isDryRun,
  parseConsentEnv,
  requestWriteConsent,
} from './write-consent.mjs';

/**
 * The measurement this file locks down: a client can hold a permission gate of its
 * own and still let an Atlas MCP write through untouched (installed rc.10, Codex in
 * `read-only` mode, a self-registered `add_relation` that changed the vault with no
 * card). The checkpoint therefore lives in the server, and the three outcomes below
 * are the whole contract — asked-and-allowed, asked-and-refused, and cannot-ask.
 */

function fakeServer({ capabilities, reply, throws }) {
  const asked = [];
  return {
    asked,
    getClientCapabilities: () => capabilities,
    elicitInput: async (params) => {
      asked.push(params);
      if (throws) throw new Error(throws);
      return reply;
    },
  };
}

test('the gate is off unless the launcher turns it on', async () => {
  const server = fakeServer({ capabilities: { elicitation: {} }, reply: { action: 'decline' } });
  const result = await requestWriteConsent({
    server,
    toolName: 'add_concept',
    args: { slug: 'a' },
    enabled: false,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.asked, false);
  assert.equal(server.asked.length, 0, 'a disabled gate must not talk to the client');
});

test('an accepted confirmation lets the write through', async () => {
  const server = fakeServer({
    capabilities: { elicitation: {} },
    reply: { action: 'accept', content: { confirm: true } },
  });
  const result = await requestWriteConsent({
    server,
    toolName: 'add_relation',
    args: { from: 'a', to: 'b' },
    enabled: true,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.asked, true);
  assert.match(server.asked[0].message, /Link a → b/);
  assert.equal(server.asked[0].requestedSchema.required[0], 'confirm');
});

test('a declined confirmation refuses the write', async () => {
  const server = fakeServer({ capabilities: { elicitation: {} }, reply: { action: 'decline' } });
  const result = await requestWriteConsent({
    server,
    toolName: 'delete_concept',
    args: { slug: 'gone' },
    enabled: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, CONSENT_DECLINED);
  assert.match(result.message, /No change was made/);
});

test('cancelling is not consent', async () => {
  const server = fakeServer({ capabilities: { elicitation: {} }, reply: { action: 'cancel' } });
  const result = await requestWriteConsent({
    server,
    toolName: 'patch_concept',
    args: { slug: 'x' },
    enabled: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, CONSENT_DECLINED);
});

test('accept without the confirm box ticked is not consent', async () => {
  const server = fakeServer({
    capabilities: { elicitation: {} },
    reply: { action: 'accept', content: { confirm: false } },
  });
  const result = await requestWriteConsent({
    server,
    toolName: 'add_concept',
    args: { slug: 'x' },
    enabled: true,
  });
  assert.equal(result.allowed, false, 'the answer, not the dialog, decides');
});

test('a client that cannot be asked is refused, never waved through', async () => {
  const server = fakeServer({ capabilities: {}, reply: undefined });
  const result = await requestWriteConsent({
    server,
    toolName: 'add_concepts',
    args: { concepts: [{}, {}] },
    enabled: true,
  });
  assert.equal(result.allowed, false, 'fail closed');
  assert.equal(result.reason, CONSENT_UNAVAILABLE);
  assert.equal(server.asked.length, 0);
});

test('a failed question is refused, never waved through', async () => {
  const server = fakeServer({ capabilities: { elicitation: {} }, throws: 'transport closed' });
  const result = await requestWriteConsent({
    server,
    toolName: 'add_concept',
    args: { slug: 'x' },
    enabled: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, CONSENT_UNAVAILABLE);
  assert.match(result.message, /transport closed/);
});

test('a dry run changes nothing, so it asks nothing', async () => {
  const server = fakeServer({ capabilities: { elicitation: {} }, reply: { action: 'decline' } });
  const result = await requestWriteConsent({
    server,
    toolName: 'rename_concept',
    args: { from: 'a', to: 'b', dryRun: true },
    enabled: true,
  });
  assert.equal(result.allowed, true);
  assert.equal(server.asked.length, 0);
  assert.equal(isDryRun({ dry_run: true }), true, 'both spellings count');
});

test('the question names the vault-visible effect', () => {
  assert.equal(describeWrite('add_concept', { slug: 'domains/cart' }), 'Create concept domains/cart');
  assert.equal(describeWrite('add_relations', { relations: [1, 2, 3] }), 'Add 3 relation(s)');
  assert.equal(describeWrite('delete_concept', { slug: 'x' }), 'Delete concept x');
  assert.equal(describeWrite('git_snapshot', {}), 'Commit the vault');
  assert.equal(describeWrite('some_new_tool', {}), 'Run some_new_tool');
});

test('the switch reads like OATLAS_READ_ONLY', () => {
  for (const on of ['1', 'true', 'yes', 'on', 'ON', ' true ']) {
    assert.equal(parseConsentEnv(on), true, on);
  }
  for (const off of ['0', 'false', 'no', '', undefined, null]) {
    assert.equal(parseConsentEnv(off), false, String(off));
  }
});
