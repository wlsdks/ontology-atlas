import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRunningVersion } from './use-running-version';

let desktop = true;
let versionRead: () => Promise<string> = () => Promise.resolve('1.4.0');
const getVersion = vi.fn(() => versionRead());

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => desktop,
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => getVersion(),
}));

beforeEach(() => {
  desktop = true;
  versionRead = () => Promise.resolve('1.4.0');
  getVersion.mockClear();
});

describe('useRunningVersion', () => {
  it('reads the running bundle on the desktop', async () => {
    const { result } = renderHook(() => useRunningVersion());
    expect(result.current.version).toBeUndefined();
    await waitFor(() => expect(result.current.version).toBe('1.4.0'));
    expect(result.current.retried).toBe(false);
  });

  it('reports a failed read as null and reads again on request', async () => {
    versionRead = () => Promise.reject(new Error('ipc'));
    const { result } = renderHook(() => useRunningVersion());
    await waitFor(() => expect(result.current.version).toBeNull());
    versionRead = () => Promise.resolve('1.4.1');
    act(() => result.current.reread());
    expect(result.current.retried).toBe(true);
    await waitFor(() => expect(result.current.version).toBe('1.4.1'));
    expect(getVersion).toHaveBeenCalledTimes(2);
  });

  it('reads nothing on the web', async () => {
    desktop = false;
    const { result } = renderHook(() => useRunningVersion());
    await Promise.resolve();
    expect(result.current.version).toBeUndefined();
    expect(getVersion).not.toHaveBeenCalled();
  });
});
