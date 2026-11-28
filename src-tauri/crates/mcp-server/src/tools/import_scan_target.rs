//! The folder an import tool scans and the scan of it: the call's `rootPath` checked to be inside
//! the vault or its repository, opened for reading with the size cap a scan allows, and read.

use std::path::Path;

use confined_files::{DiskSource, EntryKind, ScanRoots, SourceFiles};
use source_scan::{scan_imports, ImportScan, ImportScanOptions, SOURCE_FILE_MAX_BYTES};

use crate::dispatch::CallContext;
use crate::error::ToolError;

/// A scan root that was allowed and is a folder, and the root as the answer names it.
pub struct ScanTarget {
    pub label: String,
    root: std::path::PathBuf,
    source: DiskSource,
}

impl ScanTarget {
    /// The repository's root when `root_path` is `None`, else `root_path` once it is a real path
    /// inside the vault or the repository, and a folder.
    pub fn open(context: &CallContext<'_>, root_path: Option<&str>) -> Result<Self, ToolError> {
        Self::allow(context, root_path)?.require_folder()
    }

    /// The same root as [`Self::open`], checked to be inside the vault or the repository but not
    /// yet to be a folder: a tool that must name another problem first calls
    /// [`Self::require_folder`] when it reaches the scan.
    pub fn allow(context: &CallContext<'_>, root_path: Option<&str>) -> Result<Self, ToolError> {
        let config = context.config();
        let roots = ScanRoots::new(config.vault_root.clone(), config.repo_root.clone())
            .map_err(|error| ToolError::failed(error.to_string()))?;
        let wanted = root_path.map_or(config.repo_root.as_path(), Path::new);
        let allowed = roots
            .allow(wanted, "rootPath")
            .map_err(|refused| ToolError::invalid(refused.to_string()))?;
        let label = allowed.as_path().to_string_lossy().into_owned();
        let source = DiskSource::new(&allowed, SOURCE_FILE_MAX_BYTES);
        Ok(Self {
            label,
            root: allowed.as_path().to_path_buf(),
            source,
        })
    }

    /// The root itself when it is a folder, else the refusal both servers write for it.
    pub fn require_folder(self) -> Result<Self, ToolError> {
        if self.source.kind(&self.root) != Ok(Some(EntryKind::Directory)) {
            return Err(ToolError::failed(format!(
                "rootPath not a directory: {}",
                self.label
            )));
        }
        Ok(self)
    }

    pub fn scan(&self, options: &ImportScanOptions) -> ImportScan {
        scan_imports(&self.source, &self.label, options)
    }
}
