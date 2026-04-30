/**
 * File System Access API 핸들의 권한 상태 조회 / 재요청 유틸.
 *
 * `queryPermission` / `requestPermission` 은 일부 환경에서 미정의 (예: 구
 * 브라우저 polyfill) — undefined 면 'granted' 로 가정해 호출자가 진행할 수
 * 있도록 한다. 이는 docs-vault-local 의 기존 동작과 동일.
 */

export type FsHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
export type FsPermissionMode = 'read' | 'readwrite';
export type FsPermissionState = 'granted' | 'prompt' | 'denied';

interface VerifyOptions {
  /** true 면 'granted' 가 아닐 때 사용자에게 권한 재요청. 기본 false. */
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
