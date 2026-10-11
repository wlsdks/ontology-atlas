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
  it('reads legacy receipts but never treats a malformed new identity as legacy correlation', () => {
    expect(parseAcpWorkReceipts(JSON.stringify(receipt()))[0]).not.toHaveProperty('origin');
    expect(parseAcpWorkReceipts(JSON.stringify(receipt({ origin: {
      vaultId: '/vault', sessionGeneration: -1, sessionId: 's-1', userEventId: 'u-1', requestId: 0, toolCallId: 't-1',
    } })))).toEqual([]);
    expect(parseAcpWorkReceipts(JSON.stringify({ ...receipt(), writerCorrelation: { status: 'verified', server: '', tool: 'patch_concept' } }))).toEqual([]);
  });

  it('rejects impossible permission, result, and structured terminal combinations', () => {
    const explicitOrigin = { vaultId: '/vault', sessionGeneration: 2, sessionId: 's-1', userEventId: 'u-1', requestId: 0, toolCallId: 't-1' };
    const correlated = { status: 'verified' as const, server: 'atlas-vault', tool: 'patch_concept',
      toolCall: 'structured-mcp' as const, approval: 'structured-mcp' as const, terminal: 'pending' as const };
    expect(parseAcpWorkReceipts(JSON.stringify(receipt({ decision: 'rejected', result: 'completed' })))).toEqual([]);
    expect(parseAcpWorkReceipts(JSON.stringify(receipt({ decision: 'allowed', result: 'not-run' })))).toEqual([]);
    expect(parseAcpWorkReceipts(JSON.stringify(receipt({ writerCorrelation: correlated })))).toEqual([]);
    expect(parseAcpWorkReceipts(JSON.stringify(receipt({ origin: explicitOrigin,
      result: 'completed', writerCorrelation: correlated })))).toEqual([]);
    expect(parseAcpWorkReceipts(JSON.stringify(receipt({ origin: explicitOrigin,
      result: 'completed', writerCorrelation: { ...correlated, terminal: 'completed' } })))).toHaveLength(1);
    expect(parseAcpWorkReceipts(JSON.stringify(receipt({ origin: explicitOrigin, decision: 'rejected', result: 'not-run',
      writerCorrelation: { ...correlated, terminal: 'not-observed' } })))).toHaveLength(1);
  });

  it.each([0, 42, '', 'request-1'])('preserves typed numeric and string request ids, including zero and empty string (%j)', (requestId) => {
    const origin = { vaultId: '/vault', sessionGeneration: 2, sessionId: 's-1', userEventId: 'u-1', requestId, toolCallId: 't-1' };
    const parsed = parseAcpWorkReceipts(JSON.stringify(receipt({ origin })))[0]!;
    expect(parsed.origin?.requestId).toBe(requestId);
    expect(typeof parsed.origin?.requestId).toBe(typeof requestId);
  });

  it('keeps identity bounded and does not serialize task baselines or raw bodies', () => {
    const value = receipt({
      origin: { vaultId: '/vault', sessionGeneration: 2, sessionId: 's-1', userEventId: 'u-1', requestId: 0, toolCallId: 't-1' },
      writerCorrelation: { status: 'verified', server: 'atlas-vault', tool: 'patch_concept', toolCall: 'structured-mcp', approval: 'structured-mcp', terminal: 'pending' },
    });
    const encoded = JSON.stringify(value);
    expect(encoded).not.toContain('taskBaseline');
    expect(encoded).not.toContain('rawInput');
    expect(encoded).not.toContain('codeVerification');
    const parsed = parseAcpWorkReceipts(encoded)[0]!;
    (value.origin as { vaultId: string }).vaultId = '/mutated';
    expect(parsed.origin?.vaultId).toBe('/vault');
  });

  it('does not merge the same derived id across explicit session identities', () => {
    const first = receipt({ origin: { vaultId: '/vault', sessionGeneration: 1, sessionId: 's-1', userEventId: 'u-1', requestId: 1, toolCallId: 'same' } });
    const second = receipt({ origin: { vaultId: '/vault', sessionGeneration: 2, sessionId: 's-2', userEventId: 'u-2', requestId: 1, toolCallId: 'same' }, updatedAt: '2026-08-22T04:00:01.000Z' });
    expect(parseAcpWorkReceipts(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`)).toHaveLength(2);
  });
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
