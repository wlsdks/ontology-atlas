import assert from 'node:assert/strict';
import { test } from 'node:test';

import { foreignServer, listenerDirectory } from './playwright-server-owner.mjs';

const fakeLsof = (pid, cwd) => (bin, args) => {
  if (args.includes('-t')) return pid;
  return cwd === null ? '' : `p${pid}\nfcwd\nn${cwd}`;
};

test('a free port and an unreadable owner never refuse', () => {
  assert.equal(listenerDirectory('127.0.0.1', 3100, fakeLsof('', null)), null);
  assert.equal(foreignServer('127.0.0.1', 3100, '/repo', fakeLsof('', null)), null);
  assert.equal(foreignServer('127.0.0.1', 3100, '/repo', fakeLsof('42', null)), null);
});

test('a server started from this checkout or below it is reused', () => {
  assert.equal(foreignServer('127.0.0.1', 3100, '/repo', fakeLsof('42', '/repo')), null);
  assert.equal(foreignServer('127.0.0.1', 3100, '/repo', fakeLsof('42', '/repo/app')), null);
});

test('a server from another worktree or project is refused by name', () => {
  const message = foreignServer('127.0.0.1', 3100, '/repo', fakeLsof('42', '/other/excalidraw-mcp-server'));
  assert.match(message, /\/other\/excalidraw-mcp-server/);
  assert.match(message, /PLAYWRIGHT_BASE_URL/);
  assert.ok(foreignServer('127.0.0.1', 3100, '/repo', fakeLsof('42', '/repo-2')), 'a sibling prefix is not this checkout');
});

test('asks lsof about the address Playwright connects to', () => {
  const seen = [];
  const exec = (bin, args) => { seen.push(args.join(' ')); return ''; };
  listenerDirectory('127.0.0.1', 3100, exec);
  listenerDirectory('localhost', 3100, exec);
  assert.match(seen[0], /-iTCP@127\.0\.0\.1:3100/);
  assert.match(seen[1], /-iTCP:3100/);
});
