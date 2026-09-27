/** Permission query and request for an FSA handle; an environment without the methods counts as granted. */

export type FsHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
export type FsPermissionMode = 'read' | 'readwrite';
export type FsPermissionState = 'granted' | 'prompt' | 'denied';

interface VerifyOptions {
  /** Re-prompts when not granted; default false. */
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
