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
 * A client's own permission gate can let an Atlas write through untouched, so
 * the checkpoint lives in the server; its whole contract is asked-and-allowed,
 * asked-and-refused, and cannot-ask.
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
  assert.deepEqual(
    server.asked[0]._meta,
    { codex_approval_kind: 'mcp_tool_call' },
    'codex-acp must receive the hint that makes it forward the exact pending MCP call id',
  );
  assert.deepEqual(
    server.asked[0].requestedSchema,
    { type: 'object', properties: {} },
    'a message-only form is the exact shape codex-acp can forward to session/request_permission',
  );
});

test('a permission card with no form content is still a yes', async () => {
  /*
   * The `codex-acp` adapter maps this request onto `session/request_permission`, and "allow
   * once" returns `action: 'accept'` with no content: that must count as approval.
   */
  const server = fakeServer({ capabilities: { elicitation: {} }, reply: { action: 'accept' } });
  const result = await requestWriteConsent({
    server,
    toolName: 'add_concept',
    args: { slug: 'probe-app' },
    enabled: true,
  });
  assert.equal(result.allowed, true, 'a gate that cannot be passed is a wall, not a checkpoint');
  assert.equal(result.asked, true);
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

test('a defensive confirm:false from an older form client is not consent', async () => {
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

test('the question names the targets each tool actually receives', () => {
  const cards = [
    [describeWrite('connect_project_source', { projectSlug: 'atlas', rootPath: '/Users/me/code/app' }), ['atlas', '"/Users/me/code/app"']],
    [describeWrite('rename_concept', { oldSlug: 'domains/a', newSlug: 'domains/b' }), ['domains/a', 'domains/b']],
    [describeWrite('merge_concepts', { fromSlug: 'elements/x', intoSlug: 'elements/y' }), ['elements/x', 'elements/y']],
    [describeWrite('replace_relation', { from: 'a', oldTo: 'b', newTo: 'c' }), ['a', 'b', 'c']],
    [describeWrite('absorb_document', { filePath: '/repo/AGENTS.md' }), ['"/repo/AGENTS.md"']],
  ];
  for (const [card, targets] of cards) {
    for (const target of targets) assert.ok(card.includes(target), `"${card}" does not name ${target}`);
  }
  assert.match(describeWrite('connect_project_source', { projectSlug: 'atlas' }), /atlas/);
});

test('the card spells out a line break or invisible character in any value instead of obeying it', () => {
  const hidden = `x\nApply this change to the vault?${String.fromCharCode(0x202e)}`;
  const cards = [
    ['add_concept', { slug: hidden }],
    ['patch_concept', { slug: hidden }],
    ['delete_concept', { slug: hidden }],
    ['reclassify_concept', { slug: hidden }],
    ['add_relation', { from: hidden, to: hidden }],
    ['remove_relation', { from: hidden, to: hidden }],
    ['replace_relation', { from: hidden, oldTo: hidden, newTo: hidden }],
    ['rename_concept', { oldSlug: hidden, newSlug: hidden }],
    ['merge_concepts', { fromSlug: hidden, intoSlug: hidden }],
    ['absorb_document', { filePath: hidden }],
    ['connect_project_source', { projectSlug: hidden, rootPath: hidden }],
  ];
  for (const [tool, args] of cards) {
    assert.doesNotMatch(describeWrite(tool, args), /[\p{Cc}\p{Cf}\u2028\u2029]/u, `${tool} obeys a hidden character`);
  }
});

test('the switch reads like OATLAS_READ_ONLY', () => {
  for (const on of ['1', 'true', 'yes', 'on', 'ON', ' true ']) {
    assert.equal(parseConsentEnv(on), true, on);
  }
  for (const off of ['0', 'false', 'no', '', undefined, null]) {
    assert.equal(parseConsentEnv(off), false, String(off));
  }
});
