interface SourceCopyBatch {
  root: FileSystemDirectoryHandle;
  paths: Set<string>;
}

const activeBatches = new Set<SourceCopyBatch>();

export function createSourceCopyBatch(root: FileSystemDirectoryHandle) {
  const batch: SourceCopyBatch = { root, paths: new Set() };
  activeBatches.add(batch);
  return {
    /** `name` may sit in folders below `sources/` (`meetings/weekly.md`); no segment may climb. */
    hold(name: string, temporaryNames: readonly string[] = []) {
      const at = name.lastIndexOf('/');
      const folder = at < 0 ? '' : name.slice(0, at + 1);
      for (const path of [name, ...temporaryNames.map((leaf) => `${folder}${leaf}`)]) {
        if (path.split('/').some((leaf) => !leaf || leaf === '.' || leaf === '..' || /[\\\0]/.test(leaf))) {
          throw new Error('Invalid source-copy name');
        }
        batch.paths.add(`sources/${path.normalize('NFC')}`);
      }
    },
    finish() { activeBatches.delete(batch); },
  };
}

export async function pendingSourceCopyPaths(root: FileSystemDirectoryHandle): Promise<ReadonlySet<string>> {
  const paths = new Set<string>();
  for (const batch of [...activeBatches]) {
    let same = batch.root === root;
    if (!same && typeof batch.root.isSameEntry === 'function') {
      try { same = await batch.root.isSameEntry(root); } catch { same = false; }
    }
    if (same && activeBatches.has(batch)) for (const path of batch.paths) paths.add(path);
  }
  return paths;
}
