// B3 — 활동 로그 계약: append/로테이션/tail 읽기/heartbeat agent 복사.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ACTIVITY_LOG_MAX_LINES,
  ACTIVITY_LOG_RELATIVE_PATH,
  appendActivityEntry,
  buildActivityEntry,
  readActivityEntries,
  readHeartbeatAgent,
} from './activity-log.mjs';

function tmpVault() {
  return mkdtempSync(join(tmpdir(), 'activity-log-'));
}

describe('activity-log (B3 — 로컬 감사 로그)', () => {
  it('append 는 v1 JSONL 한 줄을 남기고 tail 로 읽힌다', () => {
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

  it('로테이션 — 상한 초과 시 앞 절반 절삭, 최신은 보존', () => {
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

  it('깨진 줄은 건너뛰고 sinceMs 필터가 동작한다', () => {
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

  it('heartbeat 의 agent 를 복사하되 없으면 null (조작 금지)', () => {
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
});
