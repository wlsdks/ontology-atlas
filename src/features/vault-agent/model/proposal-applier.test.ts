// The consent contract: **cancel means zero files changed. A conflict means zero files changed.**
import { describe, expect, it, vi } from 'vitest';

import { applyProposal, proposalToClipboardPacket, proposalLineDiff, summarizeChangeVolume, type VaultWritePort } from './proposal-applier';
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

  it('reports the saved prefix and refreshes after a later write fails', async () => {
    const target = proposal({ snapshotRequested: true });
    target.changes[0].files.push(
      { path: 'elements/new.md', kind: 'create', before: null, after: 'new' },
      { path: 'elements/later.md', kind: 'create', before: null, after: 'later' },
    );
    const order: string[] = [];
    const port = makePort({
      saveDoc: vi.fn(async (slug) => { order.push(slug); }),
      createDoc: vi.fn(async () => { throw new Error('disk full'); }),
      refresh: vi.fn(async () => { order.push('refresh'); }),
    });
    const result = await applyProposal(target, port, { snapshotLabel: 'x' });
    expect(result).toEqual({
      status: 'failed', message: 'Error: disk full',
      writtenPaths: ['capabilities/payment.md'], snapshotSha: 'abc1234',
    });
    expect(order).toEqual(['capabilities/payment', 'refresh']);
    expect(port.createDoc).toHaveBeenCalledTimes(1);
  });

  it('preserves the write error and saved paths when recovery refresh also fails', async () => {
    const target = proposal();
    target.changes[0].files.push({ path: 'elements/new.md', kind: 'create', before: null, after: 'new' });
    const port = makePort({
      createDoc: vi.fn(async () => { throw new Error('disk full'); }),
      refresh: vi.fn(async () => { throw new Error('reload failed'); }),
    });
    await expect(applyProposal(target, port, { snapshotLabel: 'x' })).resolves.toEqual({
      status: 'failed', message: 'Error: disk full', refreshError: 'Error: reload failed',
      writtenPaths: ['capabilities/payment.md'], snapshotSha: null,
    });
  });

  it('reports saved files instead of rejecting when the final refresh fails', async () => {
    const port = makePort({ refresh: vi.fn(async () => { throw new Error('reload failed'); }) });
    await expect(applyProposal(proposal(), port, { snapshotLabel: 'x' })).resolves.toEqual({
      status: 'failed', message: 'Error: reload failed',
      writtenPaths: ['capabilities/payment.md'], snapshotSha: null,
    });
    expect(port.saveDoc).toHaveBeenCalledTimes(1);
  });

  it('reports no confirmed writes and attempts refresh when the first writer fails', async () => {
    const port = makePort({ saveDoc: vi.fn(async () => { throw new Error('permission denied'); }) });
    const result = await applyProposal(proposal(), port, { snapshotLabel: 'x' });
    expect(result).toEqual({ status: 'failed', message: 'Error: permission denied', writtenPaths: [], snapshotSha: null });
    expect(port.refresh).toHaveBeenCalledTimes(1);
  });

  /* Chained changes to one file are written once, and a selection skipping an earlier one is refused. */
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
      writtenPaths: [],
      snapshotSha: null,
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

function chainedProposal(): AgentProposal {
  return proposal({ changes: [
    { id: 'first', tool: 'patch_concept', summary: 'Earlier edit', selected: true, expectedMtime: 100,
      files: [{ path: 'capabilities/payment.md', kind: 'modify', before: 'original', after: 'original\nEARLIER_CONTENT' }] },
    { id: 'second', tool: 'patch_concept', summary: 'Later edit', selected: true, expectedMtime: 100,
      files: [{ path: 'capabilities/payment.md', kind: 'modify', before: 'original\nEARLIER_CONTENT', after: 'original\nEARLIER_CONTENT\nLATER_CONTENT' }] },
  ] });
}

describe('proposal clipboard handoff', () => {
  it('refuses an unchecked predecessor before a clipboard packet or checkpoint exists', async () => {
    const target = chainedProposal();
    target.changes[0].selected = false;
    target.snapshotRequested = true;
    const port = makePort();
    await expect(applyProposal(target, port, { snapshotLabel: 'test' })).resolves.toMatchObject({ status: 'failed', writtenPaths: [] });
    expect(port.snapshot).not.toHaveBeenCalled();
    expect(() => proposalToClipboardPacket(target)).toThrow();
  });

  it('exports the exact final bytes once per selected file', async () => {
    const target = chainedProposal();
    const port = makePort();
    await applyProposal(target, port, { snapshotLabel: 'test' });
    const packet = proposalToClipboardPacket(target);
    expect(packet.match(/^--- capabilities\/payment\.md ---$/gm)).toHaveLength(1);
    expect(packet).toContain(vi.mocked(port.saveDoc).mock.calls[0][1]);
  });

  it('keeps a deselected trailing edit out of the exported bytes', () => {
    const target = chainedProposal();
    target.changes[1].selected = false;
    expect(proposalToClipboardPacket(target)).toContain('EARLIER_CONTENT');
    expect(proposalToClipboardPacket(target)).not.toContain('LATER_CONTENT');
  });

  it('returns no executable packet for an empty selection', () => {
    const target = chainedProposal();
    target.changes.forEach(change => { change.selected = false; });
    expect(proposalToClipboardPacket(target)).toBe('');
  });
});

describe('net proposal volume', () => {
  it('counts a chained file once from its original to its final text', () => {
    const target = chainedProposal();
    target.changes[1].files[0].after = 'original\nFINAL_CONTENT';
    expect(summarizeChangeVolume(target.changes)).toEqual({ files: 1, added: 1, removed: 0 });
  });

  it.each([
    ['same\nsame\nend', 'same\nend', 0, 1],
    ['same\nend', 'same\nsame\nend', 1, 0],
    ['a\nb', 'b\na', 1, 1],
    ['', '', 0, 0],
    ['', 'one\n', 1, 0],
    ['one\r\n', 'one\n', 0, 0],
    ['결제\n결제\n끝', '결제\n끝', 0, 1],
  ])('counts ordered line changes for %j to %j', (before, after, added, removed) => {
    const target = proposal();
    target.changes[0].files[0] = { path: 'capabilities/payment.md', kind: 'modify', before, after };
    expect(summarizeChangeVolume(target.changes)).toEqual({ files: 1, added, removed });
  });
});

describe('ordered proposal line diff', () => {
  it.each([
    ['a\nb', 'b\na'], ['same\nsame', 'same'], ['a\nb\na', 'b\na\nb'], ['결제\n끝', '끝\n결제'], ['', ''],
  ])('preserves both complete line sequences for %j to %j', (before, after) => {
    const rows = proposalLineDiff(before, after);
    expect(rows.filter(row => row.kind !== 'added').map(row => row.text)).toEqual(before ? before.split('\n') : []);
    expect(rows.filter(row => row.kind !== 'removed').map(row => row.text)).toEqual(after ? after.split('\n') : []);
  });

  it('keeps a large unchanged document and a sparse replacement exact', () => {
    const before = Array.from({ length: 10000 }, (_, index) => 'line ' + index);
    const after = [...before];
    after[5000] = 'replacement';
    const rows = proposalLineDiff(before.join('\n'), after.join('\n'));
    expect(rows.filter(row => row.kind === 'removed')).toEqual([{ kind: 'removed', text: 'line 5000' }]);
    expect(rows.filter(row => row.kind === 'added')).toEqual([{ kind: 'added', text: 'replacement' }]);
    expect(rows.filter(row => row.kind !== 'removed').map(row => row.text)).toEqual(after);
  });
});

describe('proposal file chain boundaries', () => {
  it('keeps create followed by edit as one created file and final clipboard body', async () => {
    const target = chainedProposal();
    target.changes[0].files[0].kind = 'create';
    target.changes[0].files[0].before = null;
    const port = makePort();
    await applyProposal(target, port, { snapshotLabel: 'test' });
    expect(port.createDoc).toHaveBeenCalledExactlyOnceWith('capabilities/payment', target.changes[1].files[0].after);
    expect(port.saveDoc).not.toHaveBeenCalled();
    expect(proposalToClipboardPacket(target)).toContain('file: capabilities/payment.md (create)');
    expect(summarizeChangeVolume(target.changes)).toEqual({ files: 1, added: 3, removed: 0 });
  });

  it('shows zero net lines when selected chained edits cancel each other', () => {
    const target = chainedProposal();
    target.changes[1].files[0].after = 'original';
    expect(summarizeChangeVolume(target.changes)).toEqual({ files: 1, added: 0, removed: 0 });
  });
});
