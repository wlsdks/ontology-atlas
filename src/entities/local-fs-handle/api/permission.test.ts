import { describe, expect, it, vi } from 'vitest';
import { verifyHandlePermission } from './permission';
import type { FsHandle } from './permission';

function makeHandle({
  queryState,
  requestState,
}: {
  queryState?: 'granted' | 'prompt' | 'denied';
  requestState?: 'granted' | 'prompt' | 'denied';
}): FsHandle {
  return {
    queryPermission: vi.fn(async () => queryState),
    requestPermission: vi.fn(async () => requestState),
  } as unknown as FsHandle;
}

describe('verifyHandlePermission', () => {
  it("returns granted when the query is granted", async () => {
    const handle = makeHandle({ queryState: 'granted' });
    expect(await verifyHandlePermission(handle, 'read')).toBe('granted');
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it("returns the query result when ask is false", async () => {
    const handle = makeHandle({ queryState: 'prompt' });
    expect(await verifyHandlePermission(handle, 'read')).toBe('prompt');
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it('requests permission on prompt when ask is true', async () => {
    const handle = makeHandle({ queryState: 'prompt', requestState: 'granted' });
    expect(
      await verifyHandlePermission(handle, 'read', { ask: true }),
    ).toBe('granted');
    expect(handle.requestPermission).toHaveBeenCalled();
  });

  it('returns denied when the request is refused', async () => {
    const handle = makeHandle({ queryState: 'prompt', requestState: 'denied' });
    expect(
      await verifyHandlePermission(handle, 'readwrite', { ask: true }),
    ).toBe('denied');
  });

  it('falls back to granted without queryPermission', async () => {
    const handle = {} as FsHandle;
    expect(await verifyHandlePermission(handle, 'read')).toBe('granted');
  });

  it('falls back to granted without requestPermission', async () => {
    const handle = {
      queryPermission: vi.fn(async () => 'prompt' as const),
    } as unknown as FsHandle;
    expect(
      await verifyHandlePermission(handle, 'readwrite', { ask: true }),
    ).toBe('granted');
  });

  it('passes mode to query and request', async () => {
    const handle = makeHandle({ queryState: 'granted' });
    await verifyHandlePermission(handle, 'readwrite');
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });
});
