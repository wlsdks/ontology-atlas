//! Whether a pinned citation still names the bytes it was pinned on: the file must read as a regular
//! file below the folder a project is bound to, and its SHA-256 must be the one in the citation.

use std::path::{Path, PathBuf};

use confined_files::{sha256_hex, PlainParts, ScanRoots};

use crate::source_bindings::{read_source_bindings, BindingsRead};
use crate::source_range_citation::SourceRangeCitation;

/// The largest file a citation is checked against; a larger file is never one a read served.
const CITED_FILE_MAX_BYTES: u64 = 256 * 1024;

/// A check of citations against the folder `project_slug` is bound to; `None` when the project has
/// no single binding. A citation that names a hidden or credential file, a link, a file that is not
/// there or one that has changed since it was pinned does not hold.
pub fn pinned_citation_verifier(
    vault: &Path,
    project_slug: &str,
) -> Option<impl Fn(&SourceRangeCitation) -> bool> {
    let BindingsRead::Ok(bindings) = read_source_bindings(vault) else {
        return None;
    };
    let held: Vec<_> = bindings
        .iter()
        .filter(|binding| binding.project_slug == project_slug)
        .collect();
    let [only] = held.as_slice() else {
        return None;
    };
    let root = PathBuf::from(&only.root_path);
    Some(move |citation: &SourceRangeCitation| holds(&root, citation))
}

fn holds(root: &Path, citation: &SourceRangeCitation) -> bool {
    // The bound folder is both the vault and the repository of this one question, so it is allowed.
    let Ok(roots) = ScanRoots::new(root.to_path_buf(), root.to_path_buf()) else {
        return false;
    };
    let Ok(source_root) = roots.allow(root, "rootPath") else {
        return false;
    };
    let parts: Vec<&str> = citation.path.split('/').collect();
    let Ok(plain) = PlainParts::new(&parts) else {
        return false;
    };
    source_root
        .read_repository_file(&plain, CITED_FILE_MAX_BYTES)
        .is_ok_and(|file| sha256_hex(&file.bytes) == citation.sha256)
}
