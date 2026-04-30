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
  it("query 가 'granted' 면 즉시 granted", async () => {
    const handle = makeHandle({ queryState: 'granted' });
    expect(await verifyHandlePermission(handle, 'read')).toBe('granted');
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it("ask=false 면 query 결과 그대로 반환", async () => {
    const handle = makeHandle({ queryState: 'prompt' });
    expect(await verifyHandlePermission(handle, 'read')).toBe('prompt');
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it('ask=true 면 prompt 시 request 호출', async () => {
    const handle = makeHandle({ queryState: 'prompt', requestState: 'granted' });
    expect(
      await verifyHandlePermission(handle, 'read', { ask: true }),
    ).toBe('granted');
    expect(handle.requestPermission).toHaveBeenCalled();
  });

  it('ask=true 후 거부면 denied', async () => {
    const handle = makeHandle({ queryState: 'prompt', requestState: 'denied' });
    expect(
      await verifyHandlePermission(handle, 'readwrite', { ask: true }),
    ).toBe('denied');
  });

  it('queryPermission 미정의면 granted 로 폴백', async () => {
    const handle = {} as FsHandle;
    expect(await verifyHandlePermission(handle, 'read')).toBe('granted');
  });

  it('requestPermission 미정의 + ask=true 도 granted 로 폴백', async () => {
    const handle = {
      queryPermission: vi.fn(async () => 'prompt' as const),
    } as unknown as FsHandle;
    expect(
      await verifyHandlePermission(handle, 'readwrite', { ask: true }),
    ).toBe('granted');
  });

  it('mode 가 query/request 에 그대로 전달', async () => {
    const handle = makeHandle({ queryState: 'granted' });
    await verifyHandlePermission(handle, 'readwrite');
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });
});
