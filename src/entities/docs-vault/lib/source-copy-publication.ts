interface SourceCopyBatch {
  root: FileSystemDirectoryHandle;
  paths: Set<string>;
}

const activeBatches = new Set<SourceCopyBatch>();

export function createSourceCopyBatch(root: FileSystemDirectoryHandle) {
  const batch: SourceCopyBatch = { root, paths: new Set() };
  activeBatches.add(batch);
  return {
    hold(name: string, temporaryNames: readonly string[] = []) {
      for (const leaf of [name, ...temporaryNames]) {
        if (!leaf || leaf === '.' || leaf === '..' || /[/\\\0]/.test(leaf)) throw new Error('Invalid source-copy name');
        batch.paths.add(`sources/${leaf.normalize('NFC')}`);
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
