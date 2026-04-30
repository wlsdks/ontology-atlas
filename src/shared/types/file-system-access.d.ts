// File System Access API 타입 augmentation. 일부 브라우저 API (entries,
// queryPermission, requestPermission, showDirectoryPicker) 가 lib.dom 에
// 아직 완전히 포함되지 않아 here minimal 선언.

interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<
    [string, FileSystemHandle | FileSystemFileHandle | FileSystemDirectoryHandle]
  >;
  queryPermission?(
    descriptor?: FileSystemPermissionDescriptor,
  ): Promise<'granted' | 'prompt' | 'denied'>;
  requestPermission?(
    descriptor?: FileSystemPermissionDescriptor,
  ): Promise<'granted' | 'prompt' | 'denied'>;
}

interface FileSystemFileHandle {
  queryPermission?(
    descriptor?: FileSystemPermissionDescriptor,
  ): Promise<'granted' | 'prompt' | 'denied'>;
  requestPermission?(
    descriptor?: FileSystemPermissionDescriptor,
  ): Promise<'granted' | 'prompt' | 'denied'>;
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
    startIn?: string | FileSystemHandle;
  }) => Promise<FileSystemDirectoryHandle>;
}
