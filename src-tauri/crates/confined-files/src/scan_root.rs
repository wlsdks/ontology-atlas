//! Which folders a scanning tool may read: the vault and its repository, compared as real paths
//! so a link cannot lead out. The scanning tools are read tools that read-only mode does not
//! stop, so without this one prompted call could scan any folder on the person's disk.

use std::path::{Path, PathBuf};

use crate::confined_root::resolve_path;
use crate::real_paths::{is_within, real_path};

/// A folder a scanning tool may read, as a real path inside the vault or its repository. Only
/// [`ScanRoots::allow`] builds one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceRoot {
    path: PathBuf,
}

impl SourceRoot {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn as_path(&self) -> &Path {
        &self.path
    }
}

/// A scan root that is neither the vault nor below it, nor the repository nor below it. The text
/// is what the server prints; `argument` is the name of the argument the caller passed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanRootRefused {
    pub argument: String,
    pub vault: PathBuf,
    pub repository: PathBuf,
}

impl std::fmt::Display for ScanRootRefused {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{} must be inside the vault ({}) or its repository ({}). \
This server only reads the folder it was opened for.",
            self.argument,
            self.vault.display(),
            self.repository.display()
        )
    }
}

impl std::error::Error for ScanRootRefused {}

/// The two folders a scan may stay inside.
#[derive(Debug, Clone)]
pub struct ScanRoots {
    vault: PathBuf,
    repository: PathBuf,
}

impl ScanRoots {
    pub fn new(vault: PathBuf, repository: PathBuf) -> Self {
        Self { vault, repository }
    }

    /// `target` as a real path when it is the vault, the repository or below one of them. A
    /// target that does not exist is compared as written (made absolute), so it is refused or
    /// allowed by where it would be.
    pub fn allow(&self, target: &Path, argument: &str) -> Result<SourceRoot, ScanRootRefused> {
        let base = std::env::current_dir().unwrap_or_default();
        let canonical = canonical_or_resolved(&base, target);
        let vault = canonical_or_resolved(&base, &self.vault);
        let repository = canonical_or_resolved(&base, &self.repository);
        if is_within(&vault, &canonical) || is_within(&repository, &canonical) {
            return Ok(SourceRoot::new(canonical));
        }
        Err(ScanRootRefused {
            argument: argument.to_string(),
            vault,
            repository,
        })
    }
}

fn canonical_or_resolved(base: &Path, path: &Path) -> PathBuf {
    let absolute = resolve_path(base, path);
    if absolute.exists() {
        real_path(&absolute).unwrap_or(absolute)
    } else {
        absolute
    }
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    fn folders() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let directory = tempfile::tempdir().expect("temp dir");
        let base = real_path(directory.path()).expect("real");
        let repo = base.join("repo");
        let vault = repo.join("docs");
        std::fs::create_dir_all(&vault).expect("vault");
        std::fs::create_dir_all(base.join("elsewhere")).expect("elsewhere");
        (directory, repo, vault)
    }

    #[test]
    fn the_vault_the_repository_and_folders_below_them_are_allowed() {
        let (_directory, repo, vault) = folders();
        let roots = ScanRoots::new(vault.clone(), repo.clone());
        std::fs::create_dir_all(repo.join("src/lib")).expect("src");
        for target in [
            &vault,
            &repo,
            &repo.join("src/lib"),
            &repo.join("src/missing"),
        ] {
            assert!(
                roots.allow(target, "rootPath").is_ok(),
                "{}",
                target.display()
            );
        }
        // A `..` spelling is folded before the check.
        let climbing = repo.join("src/../docs");
        assert_eq!(
            roots
                .allow(&climbing, "rootPath")
                .expect("allowed")
                .as_path(),
            vault
        );
    }

    #[test]
    fn a_folder_elsewhere_is_refused_in_the_servers_words() {
        let (directory, repo, vault) = folders();
        let roots = ScanRoots::new(vault.clone(), repo.clone());
        let elsewhere = real_path(directory.path()).expect("real").join("elsewhere");
        let refused = roots.allow(&elsewhere, "sourcePath").expect_err("refused");
        assert_eq!(
            refused.to_string(),
            format!(
                "sourcePath must be inside the vault ({}) or its repository ({}). \
This server only reads the folder it was opened for.",
                vault.display(),
                repo.display()
            )
        );
        for target in ["/", "/etc", "..", "../.."] {
            assert!(
                roots.allow(Path::new(target), "rootPath").is_err(),
                "{target}"
            );
        }
    }

    #[test]
    fn a_sibling_whose_name_starts_like_the_repository_is_not_inside_it() {
        let (directory, repo, vault) = folders();
        let roots = ScanRoots::new(vault, repo.clone());
        let sibling = real_path(directory.path())
            .expect("real")
            .join("repo-backup");
        std::fs::create_dir_all(&sibling).expect("sibling");
        assert!(roots.allow(&sibling, "rootPath").is_err());
    }

    #[test]
    fn a_link_inside_the_repository_that_leads_out_is_judged_by_where_it_leads() {
        let (directory, repo, vault) = folders();
        let roots = ScanRoots::new(vault, repo.clone());
        let elsewhere = real_path(directory.path()).expect("real").join("elsewhere");
        symlink(&elsewhere, repo.join("shortcut")).expect("link");
        assert!(roots.allow(&repo.join("shortcut"), "rootPath").is_err());
        // The way back in is allowed: a link below the repository to a folder inside it.
        std::fs::create_dir_all(repo.join("src")).expect("src");
        symlink(repo.join("src"), repo.join("alias")).expect("link");
        assert_eq!(
            roots
                .allow(&repo.join("alias"), "rootPath")
                .expect("allowed")
                .as_path(),
            repo.join("src")
        );
    }
}
