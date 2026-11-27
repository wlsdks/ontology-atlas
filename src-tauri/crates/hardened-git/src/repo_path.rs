//! The name of a place inside a repository: what a vault, a page or an agent may say in a `git`
//! question, checked when it is built so no later code has to check it again.

use std::path::{Component, Path, PathBuf};

/// A path inside a repository, `/`-separated, never absolute, never climbing, never an option and
/// never a pathspec word. `.` is the repository root.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RepoPath(String);

/// A folder that is not below the repository's top level once both are real paths.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("the folder is outside the repository")]
pub struct OutsideRepository {
    /// The folder's real path, which is what an answer says about it.
    pub real: PathBuf,
}

/// A folder inside a repository: the real path it was reached at, and where it lies below the
/// top.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacedFolder {
    pub real: PathBuf,
    pub path: RepoPath,
}

impl RepoPath {
    /// Trailing slashes are dropped. `None` for an empty path, an absolute one, one that starts
    /// with `-`, one with a backslash, a NUL, a newline or a `..` part.
    pub fn new(raw: &str) -> Option<Self> {
        let trimmed = raw.trim().trim_end_matches('/');
        let refused = trimmed.is_empty()
            || trimmed.starts_with('/')
            || trimmed.starts_with('-')
            || trimmed.contains(['\\', '\0', '\n', '\r'])
            || trimmed.split('/').any(|part| part == "..");
        (!refused).then(|| Self(trimmed.to_string()))
    }

    /// The repository root as a path.
    pub fn root() -> Self {
        Self(".".to_string())
    }

    /// A path below the repository as the platform writes it, with `/` separators. `None` when it
    /// is not a valid [`RepoPath`] (for example it climbs).
    pub fn from_path(relative: &Path) -> Option<Self> {
        if relative.as_os_str().is_empty() {
            return Some(Self::root());
        }
        let text: Vec<String> = relative
            .components()
            .map(|part| part.as_os_str().to_string_lossy().into_owned())
            .collect();
        Self::new(&text.join("/"))
    }

    /// Where `folder` lies below `top_level`, both resolved to real paths first (macOS reaches
    /// `/var` through `/private/var`, a Windows path may carry a `\\?\` prefix). Windows compares
    /// letters without regard to case, because NTFS keeps a name's case but looks it up without
    /// it (Microsoft, "Case Sensitivity" in the file-name documentation).
    pub fn of_folder(top_level: &Path, folder: &Path) -> Result<PlacedFolder, OutsideRepository> {
        let real = dunce::canonicalize(folder).unwrap_or_else(|_| folder.to_path_buf());
        let top = dunce::canonicalize(top_level).unwrap_or_else(|_| top_level.to_path_buf());
        let placed = below(&top, &real).and_then(|relative| Self::from_path(&relative));
        match placed {
            Some(path) => Ok(PlacedFolder { real, path }),
            None => Err(OutsideRepository { real }),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Whether `candidate`, a path git printed, is this place or lies under it.
    pub fn holds(&self, candidate: &str) -> bool {
        self.0 == "."
            || candidate == self.0
            || candidate
                .strip_prefix(self.0.as_str())
                .is_some_and(|rest| rest.starts_with('/'))
    }
}

fn below(root: &Path, path: &Path) -> Option<PathBuf> {
    let mut rest = path.components();
    for expected in root.components() {
        let actual = rest.next()?;
        if !same_component(expected, actual) {
            return None;
        }
    }
    Some(rest.as_path().to_path_buf())
}

fn same_component(left: Component<'_>, right: Component<'_>) -> bool {
    if cfg!(windows) {
        left.as_os_str().to_string_lossy().to_lowercase()
            == right.as_os_str().to_string_lossy().to_lowercase()
    } else {
        left == right
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_repository_path_refuses_every_spelling_that_could_be_an_option_or_an_escape() {
        for refused in [
            "",
            "  ",
            "/etc/passwd",
            "-rf",
            "--output=/tmp/x",
            "a\\b",
            "a\0b",
            "a\nb",
            "../x",
            "a/../b",
            "a/..",
        ] {
            assert_eq!(RepoPath::new(refused), None, "{refused:?}");
        }
        assert_eq!(
            RepoPath::new("docs/ontology/").map(|p| p.0),
            Some("docs/ontology".to_string())
        );
        assert_eq!(
            RepoPath::new(" src/a.ts ").map(|p| p.0),
            Some("src/a.ts".to_string())
        );
        assert_eq!(
            RepoPath::new(":(top)x").map(|p| p.0),
            Some(":(top)x".to_string())
        );
        assert_eq!(RepoPath::new(".").map(|p| p.0), Some(".".to_string()));
        assert_eq!(
            RepoPath::from_path(Path::new("")).map(|p| p.0),
            Some(".".to_string())
        );
        assert_eq!(
            RepoPath::from_path(Path::new("a/b")).map(|p| p.0),
            Some("a/b".to_string())
        );
        assert_eq!(RepoPath::from_path(Path::new("../b")), None);
    }

    #[test]
    fn a_place_holds_itself_and_what_is_below_it_by_whole_parts() {
        let docs = RepoPath::new("docs").expect("path");
        assert!(docs.holds("docs"));
        assert!(docs.holds("docs/a.md"));
        assert!(!docs.holds("docs-old/a.md"));
        assert!(!docs.holds("a/docs"));
        assert!(RepoPath::root().holds("anything/at/all"));
    }

    #[cfg(unix)]
    #[test]
    fn a_folder_reached_through_a_link_is_placed_by_where_it_really_is() {
        let base = std::env::temp_dir().join(format!("repo-path-{}", std::process::id()));
        let top = base.join("top");
        let vault = top.join("docs/ontology");
        std::fs::create_dir_all(&vault).expect("vault");
        std::os::unix::fs::symlink(&top, base.join("alias")).expect("link");
        let through_link = base.join("alias/docs/ontology");
        let placed = RepoPath::of_folder(&top, &through_link).expect("inside");
        assert_eq!(placed.path.as_str(), "docs/ontology");
        assert_eq!(placed.real, dunce::canonicalize(&vault).expect("real"));
        let at_top = RepoPath::of_folder(&top, &top).expect("inside");
        assert_eq!(at_top.path.as_str(), ".");
        assert!(RepoPath::of_folder(&vault, &top).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    /// NTFS stores a name's case but finds it without regard to case, and `git rev-parse
    /// --show-toplevel` prints the drive letter as the process folder spelled it, so the two
    /// paths may differ only in case.
    #[cfg(windows)]
    #[test]
    fn a_windows_folder_is_placed_without_regard_to_case_and_with_forward_slashes() {
        let top = Path::new("C:\\Users\\me\\Repo");
        let vault = Path::new("c:\\users\\me\\repo\\docs\\ontology");
        assert_eq!(
            below(top, vault).and_then(|relative| RepoPath::from_path(&relative)),
            RepoPath::new("docs/ontology")
        );
        assert_eq!(below(top, Path::new("C:\\Users\\me\\Repository")), None);
    }
}
