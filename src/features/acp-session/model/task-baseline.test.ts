import { describe, expect, it } from 'vitest';
import { captureTaskBaseline, TASK_BASELINE_MAX_DOCUMENT_BYTES } from './task-baseline';

function handle(reads: Array<{ text: string; mtime: number; size?: number }>): FileSystemFileHandle {
  let index = 0;
  return {
    kind: 'file', name: 'node.md', isSameEntry: async () => false,
    getFile: async () => {
      const row = reads[Math.min(index++, reads.length - 1)]!;
      return { size: row.size ?? new TextEncoder().encode(row.text).length, lastModified: row.mtime, text: async () => row.text } as File;
    },
    createWritable: async () => { throw new Error('unused'); },
  };
}

const source = {
  rootPath: '/source', sourceId: 'source-id', kind: 'git' as const, revision: 'abc123',
  fingerprint: 'tree-fingerprint', dirty: true, truncated: false, files: ['src/a.ts'],
};

describe('pre-prompt task baseline capture', () => {
  it('returns immutable exact raw documents and tagged stable meaning/source bases', async () => {
    const result = await captureTaskBaseline({
      vaultId: '/vault', slugs: ['capabilities/refund'],
      fileHandles: new Map([['capabilities/refund', handle([{ text: 'before', mtime: 10 }])]]),
      isCurrent: () => true, inspectSource: async () => source,
      now: () => '2026-09-14T00:00:00.000Z',
    });
    expect(result).toMatchObject({
      status: 'available', capturedAt: '2026-09-14T00:00:00.000Z', vaultId: '/vault',
      counts: { requested: 1, captured: 1, bytes: 6 }, sourceUnavailableReasons: [],
      documents: [{ slug: 'capabilities/refund', raw: 'before', mtime: 10 }],
      sourceBasis: { kind: 'git', revision: 'abc123', fingerprint: 'tree-fingerprint', sourceId: 'source-id' },
    });
    if (result.status !== 'available') throw new Error('expected available baseline');
    expect(result.documents[0]!.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.meaningBasis).toMatch(/^meaning:sha256:[a-f0-9]{64}$/);
    expect(result.sourceBasis?.sourceBasisId).toMatch(/^source:sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(result.documents[0])).toBe(true);
  });

  it('detects changed bytes even when both reads report the same mtime', async () => {
    const result = await captureTaskBaseline({
      vaultId: '/vault', slugs: ['node'],
      fileHandles: new Map([['node', handle([{ text: 'first', mtime: 10 }, { text: 'second', mtime: 10 }])]]),
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'unavailable', reasons: ['document_changed_during_capture'], documents: [], meaningBasis: null });
  });

  it('fails the whole meaning basis for missing and oversized documents', async () => {
    await expect(captureTaskBaseline({ vaultId: '/vault', slugs: ['missing'], fileHandles: new Map(), isCurrent: () => true }))
      .resolves.toMatchObject({ status: 'unavailable', reasons: ['document_missing'], counts: { requested: 1, captured: 0 } });
    await expect(captureTaskBaseline({
      vaultId: '/vault', slugs: ['large'],
      fileHandles: new Map([['large', handle([{ text: '', mtime: 1, size: TASK_BASELINE_MAX_DOCUMENT_BYTES + 1 }])]]),
      isCurrent: () => true,
    })).resolves.toMatchObject({ status: 'unavailable', reasons: ['document_too_large'] });
  });

  it('invalidates membership and context changes during asynchronous capture', async () => {
    const original = handle([{ text: 'stable', mtime: 1 }]);
    const handles = new Map<string, FileSystemFileHandle>([['node', original]]);
    let current = true;
    const changing = handle([{ text: 'stable', mtime: 1 }]);
    const membership = captureTaskBaseline({
      vaultId: '/vault', slugs: ['node'], fileHandles: handles, isCurrent: () => true,
      inspectSource: async () => { handles.set('node', changing); return null; },
    });
    await expect(membership).resolves.toMatchObject({ status: 'unavailable', reasons: ['membership_changed'] });

    const context = captureTaskBaseline({
      vaultId: '/vault', slugs: ['node'], fileHandles: new Map([['node', original]]),
      isCurrent: () => current,
      inspectSource: async () => { current = false; return null; },
    });
    await expect(context).resolves.toMatchObject({ status: 'unavailable', reasons: ['context_changed'] });
  });

  it('keeps complete meaning bytes available while missing or drifting source stays explicit and null', async () => {
    const missing = await captureTaskBaseline({
      vaultId: '/vault', slugs: ['node'], fileHandles: new Map([['node', handle([{ text: 'stable', mtime: 1 }])]]),
      isCurrent: () => true,
    });
    expect(missing).toMatchObject({ status: 'available', sourceBasis: null, sourceUnavailableReasons: ['missing'] });

    let calls = 0;
    const drift = await captureTaskBaseline({
      vaultId: '/vault', slugs: ['node'], fileHandles: new Map([['node', handle([{ text: 'stable', mtime: 1 }])]]),
      isCurrent: () => true, inspectSource: async () => ({ ...source, fingerprint: calls++ ? 'after' : 'before' }),
    });
    expect(drift).toMatchObject({ status: 'available', sourceBasis: null, sourceUnavailableReasons: ['changed_during_capture'] });
  });
});
