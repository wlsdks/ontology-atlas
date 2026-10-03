import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAiConnection } from './use-ai-connection';

vi.mock('@/shared/lib/tauri-secrets', () => ({ isSecretBridgeAvailable: () => false, SECRET_PROVIDERS: [] }));
vi.mock('@/shared/lib/tauri-jev', () => ({ jevSecretStatus: vi.fn() }));

describe('audit loading lifecycle', () => {
  it('reads a different same-name folder and exposes failure without inventing zero', async () => {
    const folder = (provider: string, fail = false) => ({ name: 'same', getDirectoryHandle: async () => ({ getFileHandle: async () => ({ getFile: async () => ({ text: async () => {
      if (fail) throw new Error('read denied');
      return JSON.stringify({ v: 1, at: 'now', provider });
    } }) }) }) }) as unknown as FileSystemDirectoryHandle;
    const { result, rerender } = renderHook(({ vaultHandle }) => useAiConnection({ enabled: true, vaultHandle }), { initialProps: { vaultHandle: folder('first') } });
    await waitFor(() => expect(result.current.auditEntries[0]?.provider).toBe('first'));
    rerender({ vaultHandle: folder('second') });
    await waitFor(() => expect(result.current.auditEntries[0]?.provider).toBe('second'));
    const failing = folder('third', true);
    rerender({ vaultHandle: failing });
    await waitFor(() => expect(result.current.auditError).toBe('failed'));
    expect(result.current.auditTotal).toBeNull(); expect(result.current.auditEntries).toEqual([]);
    rerender({ vaultHandle: folder('recovered') });
    await waitFor(() => expect(result.current.auditEntries[0]?.provider).toBe('recovered'));
    expect(result.current.auditError).toBeNull();
  });
  it('releases a superseded reader and shows only the completed current count', async () => {
    const cancel = vi.fn();
    const stream = vi.fn()
      .mockImplementationOnce(() => new ReadableStream<Uint8Array>({ cancel }))
      .mockImplementationOnce(() => new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode('{"v":1,"at":"now","provider":"local"}\n'));
        controller.close();
      } }));
    const vaultHandle = { name: 'vault', getDirectoryHandle: async () => ({ getFileHandle: async () => ({ getFile: async () => ({ stream }) }) }) } as unknown as FileSystemDirectoryHandle;
    const { result, rerender } = renderHook(({ enabled }) => useAiConnection({ enabled, vaultHandle }), { initialProps: { enabled: true } });
    expect(result.current.auditTotal).toBeNull();
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    act(() => result.current.refreshAudit());
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.auditTotal).toBe(1));
    expect(result.current.auditEntries.map(entry => entry.provider)).toEqual(['local']);
    rerender({ enabled: false });
    await waitFor(() => expect(result.current.auditTotal).toBe(0));
    expect(result.current.auditEntries).toEqual([]);
  });
});
