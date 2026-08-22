/**
 * Query and re-request the permission state of a File System Access API handle.
 *
 * `queryPermission` / `requestPermission` are undefined in some environments (older
 * browser polyfills). An undefined result is assumed 'granted' so the caller can
 * proceed — matching the behaviour docs-vault-local already had.
 */

export type FsHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
export type FsPermissionMode = 'read' | 'readwrite';
export type FsPermissionState = 'granted' | 'prompt' | 'denied';

interface VerifyOptions {
  /** When true, re-prompts the user if the state is not 'granted'. Defaults to false. */
  ask?: boolean;
}

export async function verifyHandlePermission(
  handle: FsHandle,
  mode: FsPermissionMode,
  options: VerifyOptions = {},
): Promise<FsPermissionState> {
  const opts = { mode };
  const query = (await handle.queryPermission?.(opts)) ?? ('granted' as const);
  if (query === 'granted') return 'granted';
  if (options.ask) {
    const req =
      (await handle.requestPermission?.(opts)) ?? ('granted' as const);
    return req;
  }
  return query;
}
