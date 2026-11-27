//! Real paths (links resolved) and the lexical questions asked of them.

use std::io;
use std::path::{Component, Path, PathBuf};

/// The path with every link resolved. On Windows the result has no `\\?\` prefix, so it prints
/// and compares as Node's `realpathSync` does.
pub fn real_path(path: &Path) -> io::Result<PathBuf> {
    dunce::canonicalize(path)
}

/// Whether `path` is `root` or lies below it, part by part (so `/a/bc` is not inside `/a/b`),
/// comparing letters exactly. A vault is confined this way on every platform: the vault's
/// parent folder may hold siblings whose names differ from the vault's only in case, and
/// `../VAULT/notes` must not reach one.
pub fn is_within(root: &Path, path: &Path) -> bool {
    path.starts_with(root)
}

/// [`is_within`] with Windows comparing letters without regard to case, as `path.win32.relative`
/// does for the scan-root and evidence-read checks. Elsewhere it is [`is_within`].
pub fn is_within_folding_case(root: &Path, path: &Path) -> bool {
    #[cfg(windows)]
    {
        let fold = |candidate: &Path| -> Vec<String> {
            candidate
                .components()
                .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
                .collect()
        };
        fold(path).starts_with(&fold(root))
    }
    #[cfg(not(windows))]
    {
        is_within(root, path)
    }
}

/// The parts of `path` below `root`, or `None` when it is not below it.
pub fn segments_below(root: &Path, path: &Path) -> Option<Vec<String>> {
    let relative = path.strip_prefix(root).ok()?;
    Some(
        relative
            .components()
            .filter_map(|part| match part {
                Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
                _ => None,
            })
            .collect(),
    )
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
        assert!(!is_within(Path::new("/a/b"), Path::new("/a/B/c")));
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

/// On Windows the vault compares exactly and the scan and evidence checks fold case.
#[cfg(test)]
#[cfg(windows)]
mod windows_tests {
    use super::*;

    #[test]
    fn a_vault_compares_letters_exactly_and_a_scan_root_does_not() {
        let vault = Path::new("C:\\parent\\vault");
        let sibling = Path::new("C:\\parent\\VAULT\\notes");
        assert!(!is_within(vault, sibling));
        assert!(is_within_folding_case(vault, sibling));
        assert!(!is_within_folding_case(
            vault,
            Path::new("C:\\parent\\vault2")
        ));
        assert_eq!(segments_below(vault, sibling), None);
    }
}
