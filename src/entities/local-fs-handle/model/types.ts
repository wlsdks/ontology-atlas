/**
 * Local file-system directory handle 영속 entity.
 *
 * File System Access API 의 `FileSystemDirectoryHandle` 는 IndexedDB 에
 * structured-clone 으로 저장 가능. 이 entity 는 그 핸들 + 메타 (이름,
 * 등록 / 마지막 접근 시각) 를 묶은 record. `current` record 로 자동
 * 복원하고, 최근 vault 목록도 같은 shape 로 보관한다. Tauri desktop 에서는
 * structured-clone 핸들 대신 `desktopRootPath` 로 shim 을 재구성한다.
 */

export interface LocalFsHandleRecord {
  /** 안정 식별자. 단일 vault 모드에서는 'current'. 향후 multi-vault 면 임의 slug. */
  id: string;
  /**
   * 디렉터리 핸들. IndexedDB structured-clone 대상.
   * 권한은 별도 — 복원 후 `queryPermission` / `requestPermission` 으로 확인.
   */
  handle: FileSystemDirectoryHandle;
  /**
   * Tauri desktop fallback. Web FileSystemDirectoryHandle cannot be structured
   * cloned there, so the desktop app stores the selected vault path and
   * reconstructs a handle shim on restore.
   */
  desktopRootPath?: string;
  /** 등록 시점의 표시 이름 (handle.name). 사용자에게 보일 라벨 기본값. */
  name: string;
  /** 최초 등록 epoch ms. */
  createdAt: number;
  /** 마지막 접근 epoch ms — 복원·열기 시 갱신. */
  lastAccessedAt: number;
}
