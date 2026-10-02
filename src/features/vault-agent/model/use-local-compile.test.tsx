import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scope: 'local:first#1',
  resolveRun: null as ((value: { turn: unknown }) => void) | null,
  sourceHandles: new Map<string, { getFile: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }> }>(),
  fileHandles: new Map<string, { getFile: () => Promise<{ text: () => Promise<string>; lastModified: number }> }>(),
  docs: [] as Array<{ slug: string; mtime: number; title?: string; frontmatter?: Record<string, unknown>; excerpt?: string; description?: string; tags?: string[] }>,
  executor: vi.fn(),
  card: { proposal: null } as { proposal: unknown },
  createDoc: vi.fn(),
  saveDoc: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({
    sourceHandles: mocks.sourceHandles,
    fileHandles: mocks.fileHandles,
    manifest: { docs: mocks.docs },
    createDoc: mocks.createDoc,
    saveDoc: mocks.saveDoc,
    refresh: mocks.refresh,
  }),
  useVaultSessionIdentityScope: () => mocks.scope,
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  nativeVaultFileHashes: vi.fn(),
}));

vi.mock('@/shared/lib/tauri-llm', () => ({
  llmChat: vi.fn(),
  llmChatErrorMessage: () => 'failed',
}));

vi.mock('./agent-loop', () => ({
  startTurn: () => ({ id: 'turn-1' }),
  runTurn: () => new Promise((resolve) => {
    mocks.resolveRun = resolve as (value: { turn: unknown }) => void;
  }),
}));

vi.mock('./compile-adapter', () => ({ compileAdapter: {} }));
vi.mock('./compile-executor', () => ({
  createCompileExecutor: (deps: unknown) => {
    mocks.executor(deps);
    return { execute: vi.fn(), proposals: () => [] };
  },
}));
vi.mock('./compile-system-prompt', () => ({ buildCompileSystemPrompt: () => 'system' }));
vi.mock('./compile-consent-card', () => ({
  buildCompileConsentCard: () => mocks.card,
}));

import { useLocalCompile } from './use-local-compile';

const args = {
  vaultRoot: '/vault',
  endpoint: { baseUrl: 'http://localhost:1234', model: 'local' },
  sources: [],
  labels: {
    createFile: (path: string) => `create ${path}`,
    modifyFile: (path: string) => `modify ${path}`,
    bridgeMissing: 'bridge missing',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = 'local:first#1';
  mocks.resolveRun = null;
  mocks.sourceHandles.clear();
  mocks.fileHandles.clear();
  mocks.docs = [];
  mocks.card = { proposal: null };
});

function setPage(text: string, mtime = 4242) {
  mocks.fileHandles.set('wiki/records', {
    getFile: async () => ({ text: async () => text, lastModified: mtime }),
  });
}

it('hashes the exact source bytes captured by the production SourceReadPort', async () => {
  let text = 'A';
  const getFile = vi.fn(async () => ({
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  }));
  mocks.sourceHandles.set('sources/plan.md', { getFile });
  const source = { path: 'sources/plan.md', name: 'plan.md', format: 'md', bytes: 1, mtime: 1, state: 'not-compiled' as const, citedBy: [] };
  const hook = renderHook(() => useLocalCompile({ ...args, sources: [source] }));
  act(() => { void hook.result.current.run('compile plan'); });
  await waitFor(() => expect(mocks.executor).toHaveBeenCalledOnce());

  const sourcePort = mocks.executor.mock.calls[0][0].sourcePort as {
    readSourceBytes: (path: string) => Promise<ArrayBuffer | null>;
    hashSource: (path: string, bytes: ArrayBuffer) => Promise<string | null>;
  };
  const captured = await sourcePort.readSourceBytes('sources/plan.md');
  text = 'B';
  await expect(sourcePort.hashSource('sources/plan.md', captured!)).resolves.toBe(
    '559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd',
  );
  expect(getFile).toHaveBeenCalledOnce();
});

async function start() {
  const hook = renderHook(() => useLocalCompile(args));
  act(() => { void hook.result.current.run('refresh wiki/records.md'); });
  await waitFor(() => expect(mocks.executor).toHaveBeenCalledOnce());
  const reader = mocks.executor.mock.calls[0][0].readExistingPage as
    (slug: string) => Promise<{ text: string; mtime: number } | null>;
  return { ...hook, reader };
}

function replacementCard() {
  mocks.card = { proposal: {
    id: 'compile-1', status: 'pending', snapshotRequested: false,
    changes: [{ id: 'page-1', tool: 'propose_wiki_page', summary: 'update records', selected: true,
      expectedMtime: 4242,
      files: [{ path: 'wiki/records.md', kind: 'modify', before: 'old human note', after: 'revised human note' }],
    }],
  } };
}

describe('local Compile reads and applies the same current Wiki snapshot', () => {
  it('reads text and timestamp from the fresh File instead of a stale manifest', async () => {
    setPage('fresh human note');
    mocks.docs = [{ slug: 'wiki/records', mtime: 1000, title: 'Records', frontmatter: {}, excerpt: '', description: '', tags: [] }];
    const { reader } = await start();
    await expect(reader('wiki/records')).resolves.toEqual({ text: 'fresh human note', mtime: 4242 });
    await expect(reader('wiki/new')).resolves.toBeNull();
  });

  it('does not turn an unreadable known page into a new-page absence', async () => {
    mocks.fileHandles.set('wiki/records', { getFile: async () => { throw new Error('cannot read'); } });
    const { reader } = await start();
    await expect(reader('wiki/records')).rejects.toThrow('cannot read');
  });

  it('does not call a manifest-known page absent when its handle is missing', async () => {
    mocks.docs = [{ slug: 'wiki/records', mtime: 4242, title: 'Records', frontmatter: {}, excerpt: '', description: '', tags: [] }];
    const { reader } = await start();
    await expect(reader('wiki/records')).rejects.toThrow();
  });

  it('refuses a same-timestamp human edit after the card without writing', async () => {
    setPage('old human note');
    replacementCard();
    const { result } = await start();
    await act(async () => { mocks.resolveRun?.({ turn: { id: 'turn-1' } }); });
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    setPage('new human correction');
    await act(async () => { await result.current.allow(); });
    expect(result.current.status).toBe('failed');
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    expect(mocks.createDoc).not.toHaveBeenCalled();
  });

  it('applies the consented bytes with the fresh timestamp despite an older manifest', async () => {
    setPage('old human note');
    mocks.docs = [{ slug: 'wiki/records', mtime: 1000, title: 'Records', frontmatter: {}, excerpt: '', description: '', tags: [] }];
    replacementCard();
    const { result } = await start();
    await act(async () => { mocks.resolveRun?.({ turn: { id: 'turn-1' } }); });
    await act(async () => { await result.current.allow(); });
    expect(mocks.saveDoc).toHaveBeenCalledWith('wiki/records', 'revised human note', { expectedMtime: 4242 });
    expect(result.current.status).toBe('written');
  });

  it('checks a later changed page before writing an earlier unchanged page', async () => {
    setPage('old human note');
    replacementCard();
    const proposal = mocks.card.proposal as { changes: Array<Record<string, unknown>> };
    proposal.changes.push({
      id: 'page-2', tool: 'propose_wiki_page', summary: 'update second', selected: true,
      expectedMtime: 4242,
      files: [{ path: 'wiki/second.md', kind: 'modify', before: 'old second note', after: 'revised second note' }],
    });
    mocks.fileHandles.set('wiki/second', {
      getFile: async () => ({ text: async () => 'a later human correction', lastModified: 4242 }),
    });
    const { result } = await start();
    await act(async () => { mocks.resolveRun?.({ turn: { id: 'turn-1' } }); });
    await act(async () => { await result.current.allow(); });
    expect(result.current.status).toBe('failed');
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    expect(mocks.createDoc).not.toHaveBeenCalled();
  });
});

describe('useLocalCompile vault origin', () => {
  it('does not reopen a dismissed work surface when a stopped turn settles', async () => {
    const { result } = await start();
    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');
    await act(async () => { mocks.resolveRun?.({ turn: { id: 'stopped-turn' } }); });
    expect(result.current.status).toBe('idle');
    expect(result.current.card).toBeNull();
  });

  it('keeps the initiating vault scope on async work retained after the provider switches', async () => {
    mocks.scope = 'local:first#1';
    mocks.resolveRun = null;
    const { result, rerender } = renderHook(() => useLocalCompile(args));

    act(() => {
      void result.current.run('compile the current library');
    });
    await waitFor(() => expect(result.current.status).toBe('running'));
    expect(result.current.originVaultScope).toBe('local:first#1');

    mocks.scope = 'local:second#2';
    rerender();
    await act(async () => {
      mocks.resolveRun?.({ turn: { id: 'turn-1' } });
    });

    expect(result.current.status).toBe('waiting');
    expect(result.current.card).not.toBeNull();
    expect(result.current.originVaultScope).toBe('local:first#1');
  });
});

describe('useLocalCompile normalized failures', () => {
  it('keeps a failed model turn out of the approval state and allows retry', async () => {
    const { result } = await start();
    const text = 'invalid-provider-response: $.choices[0].message';
    await act(async () => {
      mocks.resolveRun?.({ turn: { id: 'failed-turn', status: 'failed', events: [{ kind: 'notice', code: 'failed', text }] } });
    });
    expect(result.current.status).toBe('failed');
    expect(result.current.errorMessage).toBe(text);
    expect(result.current.card).toBeNull();
    await act(async () => { await result.current.allow(); });
    expect(mocks.createDoc).not.toHaveBeenCalled();
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    act(() => { void result.current.run('retry'); });
    await waitFor(() => expect(result.current.status).toBe('running'));
    await act(async () => { mocks.resolveRun?.({ turn: { id: 'retry-turn', status: 'done', events: [] } }); });
    expect(result.current.status).toBe('waiting');
    expect(result.current.errorMessage).toBeNull();
  });
});
