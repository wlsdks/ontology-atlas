// 동의 계약: **취소하면 파일 0개 변경. 충돌해도 파일 0개 변경.**
import { describe, expect, it, vi } from 'vitest';

import { applyProposal, summarizeChangeVolume, type VaultWritePort } from './proposal-applier';
import type { AgentProposal } from './types';

function proposal(overrides: Partial<AgentProposal> = {}): AgentProposal {
  return {
    id: 'p1',
    status: 'pending',
    snapshotRequested: false,
    readNodesThisTurn: ['capabilities/payment'],
    changes: [
      {
        id: 'c1',
        tool: 'patch_concept',
        summary: '고치기 capabilities/payment.md',
        selected: true,
        expectedMtime: 100,
        files: [
          {
            path: 'capabilities/payment.md',
            kind: 'modify',
            before: '---\nkind: capability\n---\n\n결제\n',
            after: '---\nkind: capability\ndependencies: [refund]\n---\n\n결제\n',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makePort(overrides: Partial<VaultWritePort> = {}): VaultWritePort {
  return {
    createDoc: vi.fn(async () => {}),
    saveDoc: vi.fn(async () => {}),
    currentMtime: vi.fn(() => 100),
    refresh: vi.fn(async () => {}),
    snapshot: vi.fn(async () => 'abc1234'),
    ...overrides,
  };
}

describe('proposal-applier', () => {
  it('선택된 변경만 쓰고, 카드가 그린 문자열을 그대로 쓴다', async () => {
    const port = makePort();
    const result = await applyProposal(proposal(), port, { snapshotLabel: 'x' });
    expect(result.status).toBe('applied');
    expect(port.saveDoc).toHaveBeenCalledWith(
      'capabilities/payment',
      '---\nkind: capability\ndependencies: [refund]\n---\n\n결제\n',
      { expectedMtime: 100 },
    );
  });

  it('선택 해제된 변경은 쓰지 않는다 (선별 수용)', async () => {
    const port = makePort();
    const target = proposal();
    target.changes[0].selected = false;
    const result = await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(result).toEqual({ status: 'applied', snapshotSha: null, writtenPaths: [] });
    expect(port.saveDoc).not.toHaveBeenCalled();
    expect(port.createDoc).not.toHaveBeenCalled();
  });

  it('제안한 뒤 사람이 같은 파일을 고쳤으면 파일 0개 변경으로 멈춘다', async () => {
    // 조용히 덮어쓰면 사람이 방금 쓴 문장이 흔적 없이 사라진다.
    const port = makePort({ currentMtime: vi.fn(() => 999) });
    const result = await applyProposal(proposal(), port, { snapshotLabel: 'x' });
    expect(result).toEqual({
      status: 'conflict',
      conflictedPaths: ['capabilities/payment.md'],
    });
    expect(port.saveDoc).not.toHaveBeenCalled();
    expect(port.snapshot).not.toHaveBeenCalled();
    expect(port.refresh).not.toHaveBeenCalled();
  });

  it('여러 변경 중 하나라도 충돌하면 아무것도 쓰지 않는다', async () => {
    // 반쯤 적용된 상태는 되돌리기 가장 어려운 상태다.
    const port = makePort({
      currentMtime: vi.fn((slug: string) => (slug.includes('refund') ? 999 : 100)),
    });
    const target = proposal();
    target.changes.push({
      id: 'c2',
      tool: 'patch_concept',
      summary: '고치기 capabilities/refund.md',
      selected: true,
      expectedMtime: 100,
      files: [
        {
          path: 'capabilities/refund.md',
          kind: 'modify',
          before: 'a',
          after: 'b',
        },
      ],
    });
    const result = await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(result.status).toBe('conflict');
    expect(port.saveDoc).not.toHaveBeenCalled();
  });

  it('저장점이 체크되면 쓰기보다 먼저 찍힌다', async () => {
    const order: string[] = [];
    const port = makePort({
      snapshot: vi.fn(async () => {
        order.push('snapshot');
        return 'sha1234';
      }),
      saveDoc: vi.fn(async () => {
        order.push('save');
      }),
    });
    const result = await applyProposal(proposal({ snapshotRequested: true }), port, {
      snapshotLabel: '에이전트 적용 전 저장점',
    });
    expect(order).toEqual(['snapshot', 'save']);
    expect(result).toMatchObject({ status: 'applied', snapshotSha: 'sha1234' });
  });

  it('저장점을 못 만들면 쓰지 않는다 — "되돌릴 수 있다" 가 거짓이 되면 안 된다', async () => {
    const port = makePort({
      snapshotRequested: undefined,
      snapshot: vi.fn(async () => {
        throw new Error('git 이 없어요');
      }),
    } as Partial<VaultWritePort>);
    const result = await applyProposal(proposal({ snapshotRequested: true }), port, {
      snapshotLabel: 'x',
    });
    expect(result.status).toBe('failed');
    expect(port.saveDoc).not.toHaveBeenCalled();
  });

  it('mtime 을 모르는 볼트에서는 충돌을 지어내지 않는다', async () => {
    const port = makePort({ currentMtime: vi.fn(() => undefined) });
    const result = await applyProposal(proposal(), port, { snapshotLabel: 'x' });
    expect(result.status).toBe('applied');
  });

  it('새 파일은 createDoc 으로 간다', async () => {
    const port = makePort();
    const target = proposal({
      changes: [
        {
          id: 'c1',
          tool: 'add_concept',
          summary: '만들기 elements/refund-api.md',
          selected: true,
          files: [
            { path: 'elements/refund-api.md', kind: 'create', before: null, after: '# x' },
          ],
        },
      ],
    });
    await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(port.createDoc).toHaveBeenCalledWith('elements/refund-api', '# x');
    expect(port.saveDoc).not.toHaveBeenCalled();
  });
});

describe('summarizeChangeVolume — 접힌 diff 에 도장 찍기 방지', () => {
  it('카드 헤더가 총량을 말할 수 있게 센다', () => {
    const volume = summarizeChangeVolume(proposal().changes);
    expect(volume.files).toBe(1);
    expect(volume.added).toBe(1);
    expect(volume.removed).toBe(0);
  });
});
