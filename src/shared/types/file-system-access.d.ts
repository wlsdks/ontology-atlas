// File System Access API augmentation. `entries`, `queryPermission` and `requestPermission`
// are not fully in `lib.dom` yet, so a minimal declaration lives here.

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
