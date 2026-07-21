// P2-① — CLI 쓰기 감사 로그 헬퍼 계약. recordCliWrite 가 mcp 의 activity-log
// 모듈을 재사용해 같은 `.ontology-atlas/activity.jsonl` 에 append 하는지,
// heartbeat agent 를 복사하는지, best-effort(어떤 입력에도 throw 안 함)인지.
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordCliWrite } from './activity-log.mjs';
import { readActivityEntries } from '../../../mcp/src/activity-log.mjs';

function tmpVault() {
  return mkdtempSync(join(tmpdir(), 'cli-activity-log-'));
}

describe('cli activity-log — recordCliWrite (P2-①)', () => {
  it('append 는 mcp 와 같은 activity.jsonl 로 읽히고 cli: 접두 tool 을 남긴다', async () => {
    const root = tmpVault();
    try {
      await recordCliWrite(root, {
        tool: 'cli:relate',
        target: 'capabilities/a',
        summary: 'capabilities/a --depends_on--> capabilities/b',
        why: '쓰기 경로가 b 를 지난다',
      });
      const entries = readActivityEntries(root);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].tool, 'cli:relate');
      assert.equal(entries[0].target, 'capabilities/a');
      assert.equal(entries[0].why, '쓰기 경로가 b 를 지난다');
      assert.equal(entries[0].agent, null);
      assert.equal(entries[0].v, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('heartbeat 의 agent 를 복사한다', async () => {
    const root = tmpVault();
    try {
      mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
      writeFileSync(
        join(root, '.ontology-atlas/agent-activity.json'),
        JSON.stringify({ agent: 'claude-code' }),
        'utf-8',
      );
      await recordCliWrite(root, { tool: 'cli:add', target: 'capabilities/x', summary: 'add capability:capabilities/x' });
      const entries = readActivityEntries(root);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].agent, 'claude-code');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('여러 번 append 하면 순서대로 누적된다 (import 배치)', async () => {
    const root = tmpVault();
    try {
      await recordCliWrite(root, { tool: 'cli:import', target: 'capabilities/a', summary: 'import capability:capabilities/a' });
      await recordCliWrite(root, { tool: 'cli:import', target: 'elements/b', summary: 'import element:elements/b' });
      const entries = readActivityEntries(root);
      assert.deepEqual(entries.map((e) => e.target), ['capabilities/a', 'elements/b']);
      assert.ok(entries.every((e) => e.tool === 'cli:import'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('append 가 불가능한 경로에서도 throw 하지 않는다 (best-effort)', async () => {
    // 존재하지 않는 부모 아래로 파일을 만들 수 없게 만든 뒤에도 조용히 넘어가야 한다.
    // (여기서는 파일을 디렉토리 자리에 둬 mkdir 을 실패시킨다.)
    const root = tmpVault();
    try {
      writeFileSync(join(root, '.ontology-atlas'), 'not a directory', 'utf-8');
      await assert.doesNotReject(
        recordCliWrite(root, { tool: 'cli:add', target: 't', summary: 's' }),
      );
      // 로그가 안 남았어도 호출 자체는 성공적으로 반환.
      assert.equal(existsSync(join(root, '.ontology-atlas/activity.jsonl')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
