//! Where a folder lies inside the repository that holds it, so a vault in a subfolder is asked
//! about by the name git knows it by. One implementation serves the MCP server and the app.

use std::path::{Component, Path, PathBuf};

use confined_files::{is_within_folding_case, real_path};
use hardened_git::RepoPath;

/// A folder inside a repository: the real path it was reached at, and where it lies below the top.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacedFolder {
    /// Links resolved and, on Windows, no `\\?\` prefix: what an answer says about the folder.
    pub real: PathBuf,
    pub path: RepoPath,
}

/// Why a folder has no place in the repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FolderPlacementError {
    /// The folder is not below the repository's top level once both are real paths.
    Outside { real: PathBuf },
    /// A name on the way is not text, or holds a line break or NUL, so no question to `git` can
    /// carry it.
    NotAskable { real: PathBuf },
}

impl std::fmt::Display for FolderPlacementError {
    fn fmt(&self, out: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        out.write_str(match self {
            Self::Outside { .. } => "the folder is outside the repository",
            Self::NotAskable { .. } => {
                "a name on the way to the folder cannot be written in a git question"
            }
        })
    }
}

impl std::error::Error for FolderPlacementError {}

/// Where `folder` lies below `top_level`, both resolved to real paths first (macOS reaches `/var`
/// through `/private/var`; a Windows path may carry a `\\?\` prefix). Windows compares letters
/// without regard to case, because NTFS keeps a name's case but looks it up without it
/// (Microsoft, "Case Sensitivity" in the file-name documentation). The place is built from the
/// real names, so a folder called ` notes` or `-drafts` is placed as it is spelled.
pub fn place_folder(top_level: &Path, folder: &Path) -> Result<PlacedFolder, FolderPlacementError> {
    let real = real_path(folder).unwrap_or_else(|_| folder.to_path_buf());
    let top = real_path(top_level).unwrap_or_else(|_| top_level.to_path_buf());
    if !is_within_folding_case(&top, &real) {
        return Err(FolderPlacementError::Outside { real });
    }
    // The parts after the top's own, whatever letter case the two spell it in.
    let parts: Option<Vec<&str>> = real
        .components()
        .skip(top.components().count())
        .map(|part| match part {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect();
    match parts.and_then(RepoPath::from_parts) {
        Some(path) => Ok(PlacedFolder { real, path }),
        None => Err(FolderPlacementError::NotAskable { real }),
    }
}
