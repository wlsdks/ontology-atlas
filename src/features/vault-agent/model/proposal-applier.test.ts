// The consent contract: **cancel means zero files changed. A conflict means zero files changed.**
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
  it('writes only selected changes using the exact string the card rendered', async () => {
    const port = makePort();
    const result = await applyProposal(proposal(), port, { snapshotLabel: 'x' });
    expect(result.status).toBe('applied');
    expect(port.saveDoc).toHaveBeenCalledWith(
      'capabilities/payment',
      '---\nkind: capability\ndependencies: [refund]\n---\n\n결제\n',
      { expectedMtime: 100 },
    );
  });

  it('does not write deselected changes', async () => {
    const port = makePort();
    const target = proposal();
    target.changes[0].selected = false;
    const result = await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(result).toEqual({ status: 'applied', snapshotSha: null, writtenPaths: [] });
    expect(port.saveDoc).not.toHaveBeenCalled();
    expect(port.createDoc).not.toHaveBeenCalled();
  });

  it('stops with zero files changed when a person edited the file after the proposal', async () => {
    // Overwriting quietly makes a sentence a person just wrote disappear without a trace.
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

  it('writes nothing when any one of several changes conflicts', async () => {
    // A half-applied state is the hardest state to undo.
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

  it('takes the checkpoint before writing when it is checked', async () => {
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

  it('does not write when the checkpoint cannot be created', async () => {
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

  it('does not invent a conflict in a vault without mtimes', async () => {
    const port = makePort({ currentMtime: vi.fn(() => undefined) });
    const result = await applyProposal(proposal(), port, { snapshotLabel: 'x' });
    expect(result.status).toBe('applied');
  });

  it('routes a new file to createDoc', async () => {
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

  /*
   * Bug sweep 2026-09-01 — one file, several changes. The builder computes each
   * change's `after` on the previous change's `after`, so at apply time:
   * writing every selected `after` in sequence tripped the second write's own
   * mtime guard (half-applied), and a deselected change whose later sibling
   * stayed selected still reached disk inside that sibling's `after` (consent
   * violated). The applier now writes each file once — the last selected
   * `after` — and refuses a selection that skips an earlier same-file change.
   */
  it('writes once per file with the last after when two chained changes to one file are selected', async () => {
    const port = makePort();
    const target = proposal();
    target.changes[0].files[0].after = 'A1';
    target.changes.push({
      id: 'c2',
      tool: 'add_relation',
      summary: 'capabilities/payment.md 에 relates 추가',
      selected: true,
      expectedMtime: 100,
      files: [
        { path: 'capabilities/payment.md', kind: 'modify', before: 'A1', after: 'A1+A2' },
      ],
    });
    const result = await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(result.status).toBe('applied');
    expect(port.saveDoc).toHaveBeenCalledTimes(1);
    expect(port.saveDoc).toHaveBeenCalledWith('capabilities/payment', 'A1+A2', {
      expectedMtime: 100,
    });
  });

  it('refuses and reports failure when only the later of two chained changes is selected', async () => {
    const port = makePort();
    const target = proposal();
    target.changes[0].selected = false;
    target.changes[0].files[0].after = 'A1';
    target.changes.push({
      id: 'c2',
      tool: 'add_relation',
      summary: 'capabilities/payment.md 에 relates 추가',
      selected: true,
      expectedMtime: 100,
      files: [
        { path: 'capabilities/payment.md', kind: 'modify', before: 'A1', after: 'A1+A2' },
      ],
    });
    const result = await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(result.status).toBe('failed');
    expect(port.saveDoc).not.toHaveBeenCalled();
    expect(port.createDoc).not.toHaveBeenCalled();
  });

  it('writes only the earlier after when the later chained change is deselected', async () => {
    const port = makePort();
    const target = proposal();
    target.changes[0].files[0].after = 'A1';
    target.changes.push({
      id: 'c2',
      tool: 'add_relation',
      summary: 'capabilities/payment.md 에 relates 추가',
      selected: false,
      expectedMtime: 100,
      files: [
        { path: 'capabilities/payment.md', kind: 'modify', before: 'A1', after: 'A1+A2' },
      ],
    });
    const result = await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(result.status).toBe('applied');
    expect(port.saveDoc).toHaveBeenCalledTimes(1);
    expect(port.saveDoc).toHaveBeenCalledWith('capabilities/payment', 'A1', {
      expectedMtime: 100,
    });
  });

  it('a vault-only agent cannot sign and apply project competency qualification itself', async () => {
    const port = makePort();
    const target = proposal({
      changes: [
        {
          id: 'c1',
          tool: 'patch_concept',
          summary: '고치기 sample-product.md',
          selected: true,
          expectedMtime: 100,
          files: [
            {
              path: 'sample-product.md',
              kind: 'modify',
              before: '---\nkind: project\n---\n\n# Sample\n',
              after: [
                '---',
                'kind: project',
                '---',
                '',
                '# Sample',
                '',
                '## Competency answers',
                '',
                '### abilities — answered',
                '',
                'Only one domain is covered.',
              ].join('\n'),
            },
          ],
        },
      ],
    });

    const result = await applyProposal(target, port, { snapshotLabel: 'x' });

    expect(result).toEqual({
      status: 'failed',
      message: 'Source-backed competency qualification must be created through the MCP builder.',
    });
    expect(port.snapshot).not.toHaveBeenCalled();
    expect(port.saveDoc).not.toHaveBeenCalled();
    expect(port.refresh).not.toHaveBeenCalled();
  });
});

describe('summarizeChangeVolume', () => {
  it('counts the totals the card header reports', () => {
    const volume = summarizeChangeVolume(proposal().changes);
    expect(volume.files).toBe(1);
    expect(volume.added).toBe(1);
    expect(volume.removed).toBe(0);
  });
});
