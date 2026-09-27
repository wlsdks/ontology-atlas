// Activity log contract: append, rotation, tail read, heartbeat agent copy.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ACTIVITY_LOG_MAX_LINES,
  ACTIVITY_LOG_RELATIVE_PATH,
  appendActivityEntry,
  buildActivityEntry,
  readActivityEntries,
  readHeartbeatAgent,
  resolveAgentName,
} from './activity-log.mjs';

function tmpVault() {
  return mkdtempSync(join(tmpdir(), 'activity-log-'));
}

describe('activity-log (local audit log)', () => {
  it('append writes one v1 JSONL line that tail reads back', () => {
    const root = tmpVault();
    try {
      const entry = buildActivityEntry({
        tool: 'add_relation',
        target: 'capabilities/a',
        summary: 'capabilities/a --depends_on--> capabilities/b',
        why: '쓰기 경로가 b 를 지난다',
        at: '2026-07-21T10:00:00.000Z',
      });
      assert.equal(appendActivityEntry(root, entry), true);
      const raw = readFileSync(join(root, ACTIVITY_LOG_RELATIVE_PATH), 'utf-8');
      assert.match(raw, /"v":1/);
      assert.match(raw, /depends_on/);
      const read = readActivityEntries(root);
      assert.equal(read.length, 1);
      assert.equal(read[0].why, '쓰기 경로가 b 를 지난다');
      assert.equal(read[0].agent, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rotation past the cap drops the older half and keeps the newest lines', () => {
    const root = tmpVault();
    try {
      for (let i = 0; i < ACTIVITY_LOG_MAX_LINES + 1; i += 1) {
        appendActivityEntry(root, buildActivityEntry({
          tool: 'patch_concept', target: `s${i}`, summary: `patch s${i}`, at: '2026-07-21T10:00:00.000Z',
        }));
      }
      const entries = readActivityEntries(root, { limit: ACTIVITY_LOG_MAX_LINES + 10 });
      assert.ok(entries.length <= Math.ceil((ACTIVITY_LOG_MAX_LINES + 1) / 2) + 1);
      assert.equal(entries[entries.length - 1].target, `s${ACTIVITY_LOG_MAX_LINES}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips a malformed line and applies the sinceMs filter', () => {
    const root = tmpVault();
    try {
      mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
      writeFileSync(
        join(root, ACTIVITY_LOG_RELATIVE_PATH),
        'not-json\n' +
          `${JSON.stringify(buildActivityEntry({ tool: 'a', target: 't1', summary: 's', at: '2026-07-20T00:00:00.000Z' }))}\n` +
          `${JSON.stringify(buildActivityEntry({ tool: 'a', target: 't2', summary: 's', at: '2026-07-21T00:00:00.000Z' }))}\n`,
        'utf-8',
      );
      const all = readActivityEntries(root);
      assert.equal(all.length, 2);
      const recent = readActivityEntries(root, { sinceMs: Date.parse('2026-07-20T12:00:00Z') });
      assert.deepEqual(recent.map((e) => e.target), ['t2']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies the heartbeat agent, or null without one (never invented)', () => {
    const root = tmpVault();
    try {
      assert.equal(readHeartbeatAgent(root), null);
      mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
      writeFileSync(join(root, '.ontology-atlas/agent-activity.json'), JSON.stringify({ agent: 'claude-code' }), 'utf-8');
      assert.equal(readHeartbeatAgent(root), 'claude-code');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses both read and append through an outside sidecar symlink, best-effort', () => {
    const root = tmpVault();
    const outside = mkdtempSync(join(tmpdir(), 'activity-log-outside-'));
    const sentinel = join(outside, 'activity.jsonl');
    try {
      writeFileSync(sentinel, 'outside-original\n', 'utf8');
      symlinkSync(outside, join(root, '.ontology-atlas'), process.platform === 'win32' ? 'junction' : 'dir');
      assert.equal(appendActivityEntry(root, buildActivityEntry({
        tool: 'patch_concept', target: 'p', summary: 'patch p',
      })), false);
      assert.equal(readHeartbeatAgent(root), null);
      assert.deepEqual(readActivityEntries(root), []);
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside-original\n');
      assert.equal(existsSync(join(outside, 'agent-activity.json')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('resolveAgentName records the client name from the connection greeting', () => {
  /**
   * Agent names used to come only from the heartbeat file (registered explicitly
   * through the CLI), so activity from an unregistered agent all piled up as
   * `agent: null`. But the MCP initialize greeting **already carries**
   * `clientInfo.name` ("claude-code" and friends). Do not discard a fact the server
   * already knows.
   *
   * Priority: heartbeat (an identity a person or agent registered on purpose) >
   * the greeting's name (automatic) > null. When a heartbeat exists and the
   * greeting says a different name, the heartbeat wins — registration is intent,
   * the greeting is a default.
   */
  it('a heartbeat wins over the greeting', () => {
    const root = tmpVault();
    try {
      mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
      writeFileSync(
        join(root, '.ontology-atlas/agent-activity.json'),
        JSON.stringify({ agent: 'codex' }),
        'utf-8',
      );
      assert.equal(resolveAgentName(root, { name: 'claude-code', version: '1.0' }), 'codex');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('without a heartbeat, uses the greeting name', () => {
    const root = tmpVault();
    try {
      assert.equal(resolveAgentName(root, { name: 'claude-code', version: '1.0' }), 'claude-code');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('with neither, returns null instead of inventing a name', () => {
    const root = tmpVault();
    try {
      assert.equal(resolveAgentName(root, undefined), null);
      assert.equal(resolveAgentName(root, { name: '   ', version: '1' }), null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
