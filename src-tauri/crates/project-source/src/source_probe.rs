//! The source a project's code lives in, as one fingerprint a later call can compare. The one probe
//! the app and the MCP server both run, so a receipt minted by either is read as current by the
//! other: a repository answers from its index and its changes, any other folder from one walk of
//! sizes and times, and no file count bounds either.

use std::path::Path;

use confined_files::ProbeFolder;

use crate::folder_state::inspect_folder_state;
use crate::git_state::{find_git_root, inspect_git_state};
use crate::probe_error::ProbeError;
use crate::source_digest::source_digest;
use crate::vault_exclusion::excluded_vault_folder;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Git,
    Folder,
}

impl SourceKind {
    pub fn word(self) -> &'static str {
        match self {
            Self::Git => "git",
            Self::Folder => "folder",
        }
    }

    pub fn from_word(word: &str) -> Option<Self> {
        match word {
            "git" => Some(Self::Git),
            "folder" => Some(Self::Folder),
            _ => None,
        }
    }
}

/// What one probe found. `files` are the composed repository-relative paths of every file the
/// fingerprint covers.
#[derive(Debug, Clone)]
pub struct SourceProbe {
    pub root_path: String,
    pub source_id: String,
    pub kind: SourceKind,
    pub revision: String,
    pub fingerprint: String,
    pub dirty: Option<bool>,
    pub truncated: bool,
    pub files: Vec<String>,
    /// The vault's folder inside the source, left out of the inventory.
    pub vault_excluded: Option<String>,
}

/// Probes `root_path`. With `vault` naming the vault folder inside the source, that folder is left
/// out and reported as `vault_excluded`.
pub fn inspect_project_source(
    root_path: &Path,
    vault: Option<&Path>,
) -> Result<SourceProbe, ProbeError> {
    let folder = ProbeFolder::open(root_path)?;
    let git_root = find_git_root(folder.path());
    let (root, kind) = match &git_root {
        Some(top) => (top.clone(), SourceKind::Git),
        None => (folder.path().to_path_buf(), SourceKind::Folder),
    };
    let excluded = excluded_vault_folder(&root, vault);
    let root_text = root.to_string_lossy().into_owned();
    let source_id = source_digest(&[kind.word().as_bytes(), root_text.as_bytes()]);
    let (revision, fingerprint, dirty, truncated, files) = match kind {
        SourceKind::Git => {
            let top = ProbeFolder::open(&root)?;
            let state = inspect_git_state(&top, excluded.as_deref())?;
            (
                state.revision,
                state.fingerprint,
                Some(state.dirty),
                state.truncated,
                state.files,
            )
        }
        SourceKind::Folder => {
            let state = inspect_folder_state(&folder, excluded.as_deref())?;
            (
                state.fingerprint.clone(),
                state.fingerprint,
                None,
                state.truncated,
                state.files,
            )
        }
    };
    Ok(SourceProbe {
        root_path: root_text,
        source_id,
        kind,
        revision,
        fingerprint,
        dirty,
        truncated,
        files,
        vault_excluded: excluded,
    })
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "a test builds its folders with the standard library"
)]
mod tests {
    use super::*;

    fn write(root: &Path, name: &str, text: &str) {
        let path = root.join(name);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("folder");
        std::fs::write(path, text).expect("file");
    }

    #[test]
    fn a_folder_without_git_is_fingerprinted_by_one_walk_and_the_vault_inside_it_does_not_count() {
        let root = tempfile::tempdir().expect("temp dir");
        write(root.path(), "src/main.go", "package main");
        write(root.path(), "atlas/projects/app.md", "---\nkind: project\n---\n");
        let vault = root.path().join("atlas");
        let before = inspect_project_source(root.path(), Some(&vault)).expect("probes");
        assert_eq!(before.kind, SourceKind::Folder);
        assert_eq!(before.files, ["src/main.go"]);
        assert_eq!(before.vault_excluded.as_deref(), Some("atlas"));
        assert_eq!(before.dirty, None);
        assert!(before.fingerprint.starts_with("sha256:"));

        write(root.path(), "atlas/domains/new.md", "---\nkind: domain\n---\n");
        let after_vault_write = inspect_project_source(root.path(), Some(&vault)).expect("probes");
        assert_eq!(before.fingerprint, after_vault_write.fingerprint);

        write(root.path(), "src/extra.go", "package main");
        let after_code_change = inspect_project_source(root.path(), Some(&vault)).expect("probes");
        assert_ne!(before.fingerprint, after_code_change.fingerprint);
    }

    #[test]
    fn a_path_that_is_not_a_folder_is_refused_in_the_words_the_script_server_used() {
        let root = tempfile::tempdir().expect("temp dir");
        write(root.path(), "a.txt", "a");
        let error = inspect_project_source(&root.path().join("a.txt"), None).expect_err("a file");
        assert_eq!(error.to_string(), "project source root must be a directory");
    }
}
