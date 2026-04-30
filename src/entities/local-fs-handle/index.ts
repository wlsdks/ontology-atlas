export type { LocalFsHandleRecord } from './model/types';
export {
  CURRENT_LOCAL_FS_HANDLE_ID,
  deleteLocalFsHandle,
  getLocalFsHandle,
  putLocalFsHandle,
  touchLocalFsHandle,
} from './api/store';
export type {
  FsHandle,
  FsPermissionMode,
  FsPermissionState,
} from './api/permission';
export { verifyHandlePermission } from './api/permission';
