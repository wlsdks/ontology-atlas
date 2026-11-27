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
    source: DiskSource,
}

impl ScanTarget {
    /// The repository's root when `root_path` is `None`, else `root_path` once it is a real path
    /// inside the vault or the repository.
    pub fn open(context: &CallContext<'_>, root_path: Option<&str>) -> Result<Self, ToolError> {
        let config = context.config();
        let roots = ScanRoots::new(config.vault_root.clone(), config.repo_root.clone())
            .map_err(|error| ToolError::failed(error.to_string()))?;
        let wanted = root_path.map_or(config.repo_root.as_path(), Path::new);
        let allowed = roots
            .allow(wanted, "rootPath")
            .map_err(|refused| ToolError::invalid(refused.to_string()))?;
        let label = allowed.as_path().to_string_lossy().into_owned();
        let source = DiskSource::new(&allowed, SOURCE_FILE_MAX_BYTES);
        if source.kind(allowed.as_path()) != Ok(Some(EntryKind::Directory)) {
            return Err(ToolError::failed(format!(
                "rootPath not a directory: {label}"
            )));
        }
        Ok(Self { label, source })
    }

    pub fn scan(&self, options: &ImportScanOptions) -> ImportScan {
        scan_imports(&self.source, &self.label, options)
    }
}
