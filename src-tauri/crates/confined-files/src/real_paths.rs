//! Real paths (links resolved) and the lexical questions asked of them.

use std::io;
use std::path::{Component, Path, PathBuf};

/// The path with every link resolved. On Windows the result has no `\\?\` prefix, so it prints
/// and compares as Node's `realpathSync` does.
pub fn real_path(path: &Path) -> io::Result<PathBuf> {
    dunce::canonicalize(path)
}

/// Whether `path` is `root` or lies below it, part by part (so `/a/bc` is not inside `/a/b`).
/// Windows compares letters without regard to case, as its file system does.
pub fn is_within(root: &Path, path: &Path) -> bool {
    #[cfg(windows)]
    {
        let fold = |candidate: &Path| -> Vec<String> {
            candidate
                .components()
                .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
                .collect()
        };
        let root_parts = fold(root);
        let path_parts = fold(path);
        path_parts.starts_with(&root_parts)
    }
    #[cfg(not(windows))]
    {
        path.starts_with(root)
    }
}

/// The parts of `path` below `root`, or `None` when it is not below it.
pub fn segments_below(root: &Path, path: &Path) -> Option<Vec<String>> {
    if !is_within(root, path) {
        return None;
    }
    let skip = root.components().count();
    Some(
        path.components()
            .skip(skip)
            .filter_map(|part| match part {
                Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
                _ => None,
            })
            .collect(),
    )
}

/// The link a path is, when it is a link: where it points, made absolute against its folder and
/// folded lexically. `None` for anything else.
pub fn link_target(path: &Path) -> Option<PathBuf> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if !metadata.file_type().is_symlink() {
        return None;
    }
    let target = std::fs::read_link(path).ok()?;
    let folder = path.parent()?;
    Some(crate::confined_root::resolve_path(folder, &target))
}

#[cfg(test)]
#[cfg(unix)]
mod tests {
    use super::*;

    #[test]
    fn inside_means_below_by_whole_parts() {
        assert!(is_within(Path::new("/a/b"), Path::new("/a/b")));
        assert!(is_within(Path::new("/a/b"), Path::new("/a/b/c/d")));
        assert!(!is_within(Path::new("/a/b"), Path::new("/a/bc")));
        assert!(!is_within(Path::new("/a/b"), Path::new("/a")));
    }

    #[test]
    fn the_parts_below_a_root_exclude_the_root_itself() {
        assert_eq!(
            segments_below(Path::new("/v"), Path::new("/v/sources/a.md")),
            Some(vec!["sources".to_string(), "a.md".to_string()])
        );
        assert_eq!(
            segments_below(Path::new("/v"), Path::new("/v")),
            Some(vec![])
        );
        assert_eq!(segments_below(Path::new("/v"), Path::new("/w/x")), None);
    }
}
