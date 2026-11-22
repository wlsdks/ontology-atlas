/** Permission query and request for an FSA handle; an environment without the methods counts as granted. */

export type FsHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
export type FsPermissionMode = 'read' | 'readwrite';
export type FsPermissionState = 'granted' | 'prompt' | 'denied';

interface VerifyOptions {
  ask?: boolean;
}

export async function verifyHandlePermission(
  handle: FsHandle,
  mode: FsPermissionMode,
  options: VerifyOptions = {},
): Promise<FsPermissionState> {
  const permissionDescriptor = { mode };
  const query = (await handle.queryPermission?.(permissionDescriptor)) ?? ('granted' as const);
  if (query === 'granted') return 'granted';
  if (options.ask) {
    const request =
      (await handle.requestPermission?.(permissionDescriptor)) ?? ('granted' as const);
    return request;
  }
  return query;
}
