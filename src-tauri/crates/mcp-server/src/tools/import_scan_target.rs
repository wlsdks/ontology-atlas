//! The folder an import tool scans and the scan of it: the call's `rootPath` checked to be inside
//! the vault or its repository, opened for reading with the size cap a scan allows, and read.

use std::path::Path;

use confined_files::{
    confined_source_reads_enabled, DiskSource, EntryKind, ScanRoots, SnapshotError, SnapshotSource,
    SourceFiles, SourceRoot, SourceSnapshot,
};
use source_scan::{scan_imports, ImportScan, ImportScanOptions, SOURCE_FILE_MAX_BYTES};

use crate::dispatch::CallContext;
use crate::error::ToolError;

/// Where a scan reads its files: the disk, or the census the app passed when it asked for every
/// read to come from one (`OATLAS_CONFINED_SOURCE_READS=1`). A census target never opens the
/// disk, so a file replaced or a link planted after the census was taken changes nothing.
enum Reads {
    Disk(DiskSource),
    Census,
}

/// A scan root that was allowed and is a folder, and the root as the answer names it.
pub struct ScanTarget {
    pub label: String,
    root: std::path::PathBuf,
    allowed: SourceRoot,
    reads: Reads,
}

/// What a census that cannot be used says, as the script server says it.
fn census_failure(error: SnapshotError) -> ToolError {
    ToolError::failed(error.to_string())
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
        Self::allow_named(context, root_path, "rootPath")
    }

    /// [`Self::allow`] for a tool whose argument has another name, which the refusal repeats.
    pub fn allow_named(
        context: &CallContext<'_>,
        root_path: Option<&str>,
        argument: &str,
    ) -> Result<Self, ToolError> {
        Self::allowed_for(
            context,
            root_path,
            argument,
            confined_source_reads_enabled(),
        )
    }

    fn allowed_for(
        context: &CallContext<'_>,
        root_path: Option<&str>,
        argument: &str,
        from_census: bool,
    ) -> Result<Self, ToolError> {
        let config = context.config();
        let roots = ScanRoots::new(config.vault_root.clone(), config.repo_root.clone())
            .map_err(|error| ToolError::failed(error.to_string()))?;
        let wanted = root_path.map_or(config.repo_root.as_path(), Path::new);
        let allowed = roots
            .allow(wanted, argument)
            .map_err(|refused| ToolError::invalid(refused.to_string()))?;
        let label = allowed.as_path().to_string_lossy().into_owned();
        let reads = if from_census {
            Reads::Census
        } else {
            Reads::Disk(DiskSource::new(&allowed, SOURCE_FILE_MAX_BYTES))
        };
        Ok(Self {
            label,
            root: allowed.as_path().to_path_buf(),
            allowed,
            reads,
        })
    }

    /// A run over the census for this root, with a record of its own. The census is taken once
    /// for the life of the process; a call whose census is missing, unreadable or of another
    /// folder than this root is refused, so the disk is never read in its place.
    pub fn census_run(&self) -> Result<SnapshotSource<'static>, ToolError> {
        SourceSnapshot::inherited()
            .and_then(|census| census.source_for(&self.root))
            .map_err(census_failure)
    }

    /// Whether this target reads from the census.
    pub fn reads_census(&self) -> bool {
        matches!(self.reads, Reads::Census)
    }

    /// The root itself when it is a folder, else the refusal both servers write for it.
    pub fn require_folder(self) -> Result<Self, ToolError> {
        let kind = match &self.reads {
            Reads::Disk(source) => source.kind(&self.root),
            Reads::Census => self.census_run()?.kind(&self.root),
        };
        if kind != Ok(Some(EntryKind::Directory)) {
            return Err(ToolError::failed(format!(
                "rootPath not a directory: {}",
                self.label
            )));
        }
        Ok(self)
    }

    /// The real folder the scan reads.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The same folder as the root a confined read opens files below.
    pub fn source_root(&self) -> &SourceRoot {
        &self.allowed
    }

    /// The same folder read with its own file size cap, for a reader that treats a larger file as
    /// data rather than code.
    pub fn source_with_limit(&self, max_file_bytes: usize) -> DiskSource {
        DiskSource::new(&self.allowed, max_file_bytes)
    }

    /// The scan of the folder. Read from the census, the answer carries what the run stood on,
    /// and a read the census refused fails the run even when the scan went on without it.
    pub fn scan(&self, options: &ImportScanOptions) -> Result<ImportScan, ToolError> {
        match &self.reads {
            Reads::Disk(source) => Ok(scan_imports(source, &self.label, options)),
            Reads::Census => {
                let run = self.census_run()?;
                // The script server asks the census about the root first, so the run records it.
                let _ = run.kind(&self.root);
                let mut scan = scan_imports(&run, &self.label, options);
                scan.read_boundary = Some(run.finish().map_err(census_failure)?);
                Ok(scan)
            }
        }
    }
}
