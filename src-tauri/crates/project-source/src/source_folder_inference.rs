//! The folder a call without `rootPath` binds: the git repository around the vault, else the
//! nearest folder above it that holds a project manifest. Never the filesystem root or the home
//! folder, a binding too wide to measure anything and more likely an accident. It only proposes:
//! a person or `confirm` writes the binding.

use std::path::{Path, PathBuf};

use confined_files::ProbeFolder;

use crate::git_state::find_git_root;

/// Folder levels walked up from the vault before giving up.
const MAX_ANCESTOR_DEPTH: usize = 12;

/// Files that make a folder a plausible project root without Git.
const MANIFEST_FILES: [&str; 13] = [
    "Cargo.toml",
    "CMakeLists.txt",
    "Gemfile",
    "Package.swift",
    "build.gradle",
    "build.gradle.kts",
    "composer.json",
    "go.mod",
    "mix.exs",
    "package.json",
    "pnpm-workspace.yaml",
    "pom.xml",
    "pyproject.toml",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InferenceMarker {
    EnclosingGitRepository,
    AncestorProjectManifest,
}

impl InferenceMarker {
    /// The word a connect answer prints as `inferredFrom`.
    pub fn word(self) -> &'static str {
        match self {
            Self::EnclosingGitRepository => "enclosing_git_repository",
            Self::AncestorProjectManifest => "ancestor_project_manifest",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InferredFolder {
    pub root: PathBuf,
    pub marker: InferenceMarker,
}

fn real_folder(path: &Path) -> Option<PathBuf> {
    ProbeFolder::open(path).ok().map(|folder| folder.path().to_path_buf())
}

fn home_folder() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    real_folder(Path::new(&home))
}

fn too_wide(path: &Path, home: Option<&Path>) -> bool {
    path.parent().is_none() || home.is_some_and(|home| path == home)
}

fn holds_manifest(folder: &Path) -> bool {
    ProbeFolder::open(folder)
        .map(|open| MANIFEST_FILES.iter().any(|name| open.has_file(name)))
        .unwrap_or(false)
}

/// The proposal for `vault`; `None` when no enclosing code folder exists.
pub fn infer_source_folder(vault: &Path) -> Option<InferredFolder> {
    let vault = real_folder(vault)?;
    let home = home_folder();
    let allowed = |path: &Path| !too_wide(path, home.as_deref()) && vault.starts_with(path);
    if let Some(root) = find_git_root(&vault).and_then(|found| real_folder(&found)) {
        if allowed(&root) {
            return Some(InferredFolder {
                root,
                marker: InferenceMarker::EnclosingGitRepository,
            });
        }
    }
    let mut cursor = vault.clone();
    for _ in 0..=MAX_ANCESTOR_DEPTH {
        if holds_manifest(&cursor) && allowed(&cursor) {
            return Some(InferredFolder {
                root: cursor,
                marker: InferenceMarker::AncestorProjectManifest,
            });
        }
        cursor = cursor.parent()?.to_path_buf();
    }
    None
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "a test builds its folders with the standard library"
)]
mod tests {
    use super::*;

    #[test]
    fn the_nearest_folder_with_a_manifest_above_the_vault_is_proposed() {
        let top = tempfile::tempdir().expect("folder");
        let code = top.path().join("code");
        let vault = code.join("docs/vault");
        std::fs::create_dir_all(&vault).expect("vault");
        std::fs::write(code.join("go.mod"), "module x\n").expect("manifest");
        let proposed = infer_source_folder(&vault).expect("proposed");
        assert_eq!(proposed.marker, InferenceMarker::AncestorProjectManifest);
        assert_eq!(proposed.root, real_folder(&code).expect("real"));
    }

    #[test]
    fn a_vault_with_no_manifest_or_repository_above_it_gets_no_proposal() {
        let top = tempfile::tempdir().expect("folder");
        let vault = top.path().join("vault");
        std::fs::create_dir_all(&vault).expect("vault");
        assert_eq!(infer_source_folder(&vault).map(|found| found.marker), None);
    }
}
