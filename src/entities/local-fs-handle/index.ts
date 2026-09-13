export type { LocalFsHandleRecord } from './model/types';
export {
  CURRENT_LOCAL_FS_HANDLE_ID,
  deleteLocalFsHandle,
  forgetRecentLocalFsHandle,
  getLocalFsHandle,
  listRecentLocalFsHandles,
  putLocalFsHandle,
  recordLocalFsHandleContents,
  touchLocalFsHandle,
} from './api/store';
export { verifyHandlePermission } from './api/permission';
