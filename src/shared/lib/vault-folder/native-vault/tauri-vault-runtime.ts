import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function getTauriInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

export function isTauriVaultRuntime(): boolean {
  return getTauriInvoke() !== null;
}

export function getTauriVaultRootPath(handle: FileSystemDirectoryHandle): string | undefined {
  return (handle as unknown as { rootPath?: string }).rootPath;
}
