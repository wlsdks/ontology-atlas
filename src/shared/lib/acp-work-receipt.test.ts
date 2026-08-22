import { describe, expect, it, vi } from 'vitest';

import {
  createVaultAcpWorkReceiptStore,
  parseAcpWorkReceipts,
  type AcpWorkReceipt,
} from './acp-work-receipt';

function receipt(overrides: Partial<AcpWorkReceipt> = {}): AcpWorkReceipt {
  return {
    v: 1,
    id: 'session-1:tool-1',
    at: '2026-08-22T04:00:00.000Z',
    updatedAt: '2026-08-22T04:00:00.000Z',
    agent: 'claude-acp',
    request: '관계를 정리해줘',
    tool: 'add_relations',
    decision: 'allowed',
    result: 'pending',
    items: [
      {
        target: 'capabilities/a',
        operation: 'relate',
        relation: { from: 'capabilities/a', type: 'relates', to: 'domains/b' },
        fields: [],
      },
    ],
    ...overrides,
  };
}

describe('ACP work receipts', () => {
  it('keeps the latest snapshot for each decision and skips malformed lines', () => {
    const raw = [
      JSON.stringify(receipt()),
      '{broken',
      JSON.stringify(receipt({
        updatedAt: '2026-08-22T04:00:02.000Z',
        result: 'completed',
      })),
    ].join('\n');

    expect(parseAcpWorkReceipts(raw)).toEqual([
      receipt({ updatedAt: '2026-08-22T04:00:02.000Z', result: 'completed' }),
    ]);
  });

  it('serializes concurrent snapshots in call order instead of losing the result', async () => {
    let text = '';
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let writes = 0;
    const fileHandle = {
      getFile: vi.fn(async () => ({ text: async () => text })),
      createWritable: vi.fn(async () => {
        let next = '';
        return {
          write: async (chunk: string) => {
            writes += 1;
            if (writes === 1) await firstGate;
            next += chunk;
          },
          close: async () => { text = next; },
        };
      }),
    };
    const root = {
      getDirectoryHandle: vi.fn(async () => ({
        getFileHandle: vi.fn(async () => fileHandle),
      })),
    } as unknown as FileSystemDirectoryHandle;
    const store = createVaultAcpWorkReceiptStore(root);
    const pending = store.append(receipt());
    await vi.waitFor(() => expect(writes).toBe(1));
    const completed = store.append(receipt({
      updatedAt: '2026-08-22T04:00:02.000Z',
      result: 'completed',
    }));
    releaseFirst();
    await Promise.all([pending, completed]);

    expect(parseAcpWorkReceipts(text)[0].result).toBe('completed');
  });
});
