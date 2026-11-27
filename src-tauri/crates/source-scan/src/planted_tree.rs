//! A throwaway source tree for unit tests: files planted in a temporary folder and read back
//! through the same confined source a scan uses.

#![allow(
    clippy::disallowed_methods,
    reason = "a test plants the files a scan reads, which the crate otherwise never writes"
)]

use std::path::{Path, PathBuf};

use confined_files::{DiskSource, ScanRoots};

/// A folder holding the planted files, removed when it goes out of scope.
pub struct PlantedTree {
    _directory: tempfile::TempDir,
    root: PathBuf,
}

impl PlantedTree {
    /// Plants each `(path, text)` below a new folder, making the folders on the way.
    pub fn new(files: &[(&str, &str)]) -> Self {
        let directory = tempfile::tempdir().expect("temp dir");
        let root = std::fs::canonicalize(directory.path()).expect("real path");
        for (name, text) in files {
            let path = root.join(name);
            std::fs::create_dir_all(path.parent().expect("parent")).expect("folder");
            std::fs::write(path, text).expect("file");
        }
        Self {
            _directory: directory,
            root,
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The tree as a scan reads it: confined to its folder, files up to 1 MiB.
    pub fn source(&self) -> DiskSource {
        let roots = ScanRoots::new(self.root.clone(), self.root.clone()).expect("roots");
        DiskSource::new(
            &roots.allow(&self.root, "rootPath").expect("allowed"),
            1 << 20,
        )
    }
}
