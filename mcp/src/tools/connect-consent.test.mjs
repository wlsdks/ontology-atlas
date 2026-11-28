/**
 * Where the server asks a person to approve each write, `connect_project_source` is one
 * call: the card names the folder the call binds, and the approval is the confirmation.
 * The calls run through the server process, answering its `elicitation/create` the way
 * a host does.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = process.env.OATLAS_TEST_SERVER_ENTRY ?? join(here, '..', 'javascript-server.mjs');

function repositoryWithProject() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-connect-consent-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'atlas'));
  writeFileSync(join(root, 'src', 'charge.mjs'), 'export function charge(amount) {\n  return amount;\n}\n');
  writeFileSync(
    join(root, 'atlas', 'ledger.md'),
    '---\nuid: 00000000-0000-4000-8000-000000000001\nslug: ledger\nkind: project\ntitle: Ledger\npath: src/charge.mjs\n---\n\nLedger charges customers.\n',
  );
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Atlas Test', '-c', 'user.email=atlas@example.invalid', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

/** One server with the write-consent gate on; `answer` is what the person says to each card. */
function serverAskingPeople(root, answer) {
  const child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, OATLAS_VAULT: join(root, 'atlas'), OATLAS_REPO_ROOT: root, OATLAS_WRITE_CONSENT: '1' },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const cards = [];
  const waiting = new Map();
  let buffered = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffered += chunk;
    for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
      const message = JSON.parse(buffered.slice(0, end));
      buffered = buffered.slice(end + 1);
      if (message.method === 'elicitation/create') {
        cards.push(message.params.message);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { action: answer } })}\n`);
      } else if (message.id !== undefined) waiting.get(message.id)?.(message);
    }
  });
  let nextId = 1;
  const request = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const ready = request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: { elicitation: { form: {} } },
    clientInfo: { name: 'connect-consent-test', version: '1' },
  }).then(() => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`));
  const call = async (name, args) => {
    await ready;
    const { result } = await request('tools/call', { name, arguments: args });
    return result;
  };
  return { call, cards, stop: () => child.kill() };
}

test('an approved connect with no confirm writes the binding in that one call, and the card names the folder', async (t) => {
  const root = repositoryWithProject();
  const session = serverAskingPeople(root, 'accept');
  t.after(() => { session.stop(); rmSync(root, { recursive: true, force: true }); });

  const result = await session.call('connect_project_source', { projectSlug: 'ledger' });

  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.equal(result.structuredContent.confirmed, true);
  assert.equal(result.structuredContent.changed, true);
  assert.equal(result.structuredContent.status, 'verified_current');
  assert.ok(existsSync(join(root, 'atlas', '.ontology-atlas', 'project-sources.json')), 'the binding is in the sidecar');
  assert.equal(session.cards.length, 1, 'one card, not one for a preview and one for the write');
  assert.ok(session.cards[0].includes(JSON.stringify(result.structuredContent.binding.rootPath)), session.cards[0]);
});

test('a declined connect binds nothing, and confirm:false previews without asking anyone', async (t) => {
  const root = repositoryWithProject();
  const declined = serverAskingPeople(root, 'decline');
  t.after(() => { declined.stop(); rmSync(root, { recursive: true, force: true }); });

  const refused = await declined.call('connect_project_source', { projectSlug: 'ledger' });
  assert.equal(refused.isError, true);
  assert.equal(existsSync(join(root, 'atlas', '.ontology-atlas', 'project-sources.json')), false);

  const preview = await declined.call('connect_project_source', { projectSlug: 'ledger', confirm: false });
  assert.equal(preview.structuredContent.confirmed, false);
  assert.equal(preview.structuredContent.changed, false);
  assert.equal(declined.cards.length, 1, 'only the refused write asked');
  assert.equal(existsSync(join(root, 'atlas', '.ontology-atlas', 'project-sources.json')), false);
});
