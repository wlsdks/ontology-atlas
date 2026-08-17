// B3 — 활동 로그 계약: append/로테이션/tail 읽기/heartbeat agent 복사.
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

  it('외부 sidecar symlink에서는 읽기와 append를 모두 best-effort로 거부한다', () => {
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

describe('resolveAgentName — 연결 인사의 클라이언트 이름 자동 기록 (2026-08-13)', () => {
  /**
   * 실시간 에이전트 표시의 1번 조각. 종전에는 agent 이름이 하트비트 파일(CLI 로
   * 직접 등록)에서만 왔다 — 등록을 안 한 에이전트의 활동은 전부 agent: null 로
   * 쌓였다. 그런데 MCP initialize 인사에는 clientInfo.name("claude-code" 등)이
   * **이미 실려 온다.** 서버가 아는 사실을 버리지 않는다.
   *
   * 우선순위: 하트비트(사람/에이전트가 일부러 등록한 정체) > 인사의 이름(자동)
   * > null. 하트비트가 있는데 인사가 다른 이름을 말하면 하트비트가 이긴다 —
   * 등록은 의도이고 인사는 기본값이다.
   */
  it('하트비트가 있으면 하트비트가 이긴다', () => {
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

  it('하트비트가 없으면 인사의 이름을 쓴다', () => {
    const root = tmpVault();
    try {
      assert.equal(resolveAgentName(root, { name: 'claude-code', version: '1.0' }), 'claude-code');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('둘 다 없으면 null — 이름을 지어내지 않는다', () => {
    const root = tmpVault();
    try {
      assert.equal(resolveAgentName(root, undefined), null);
      assert.equal(resolveAgentName(root, { name: '   ', version: '1' }), null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
