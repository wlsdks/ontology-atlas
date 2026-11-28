//! A `path:` a node cites, taken as a place inside the repository. The text is written by an agent
//! and so is untrusted: `../../somewhere` escapes as well as an absolute path. The fold is lexical,
//! with no link resolved, because the root was settled when it was allowed and resolving it again
//! would disagree with every other boundary of the server.

use std::path::PathBuf;

use answer_format::whitespace::trim;

/// A cited path that stays inside the repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryPath {
    /// The text as the node wrote it, trimmed.
    pub written: String,
    /// The same place with `.` and `..` folded, below the root; empty for the root itself.
    pub below_root: PathBuf,
}

fn is_absolute(text: &str) -> bool {
    let bytes = text.as_bytes();
    text.starts_with('/')
        || text.starts_with('\\')
        || matches!((bytes.first(), bytes.get(1)), (Some(letter), Some(b':')) if letter.is_ascii_alphabetic())
}

/// `value` as a place inside the repository, or `None` when it is empty, absolute or climbs out;
/// callers read `None` as "do not speak", never as a verdict.
pub fn inside_repository(value: &str) -> Option<RepositoryPath> {
    let written = trim(value);
    if written.is_empty() || is_absolute(written) || written.contains('\0') {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    // Windows takes `\` as a path separator as it takes `/`
    // (https://learn.microsoft.com/windows/win32/fileio/naming-a-file, "Fully qualified vs.
    // relative paths"), so `src\..\..\x` climbs out there as `src/../../x` does everywhere.
    for part in written.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            name => parts.push(name),
        }
    }
    Some(RepositoryPath {
        written: written.to_string(),
        below_root: parts.iter().collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_that_climbs_out_or_is_absolute_is_no_place_inside_the_repository() {
        for outside in ["/etc", "../x", "a/../../x", "C:\\x", "", "   "] {
            assert_eq!(inside_repository(outside), None, "{outside}");
        }
        let inside = inside_repository("src/./a/../b.ts").expect("inside");
        assert_eq!(inside.below_root, PathBuf::from("src/b.ts"));
        assert_eq!(
            inside_repository("a/..").map(|place| place.below_root),
            Some(PathBuf::new())
        );
    }

    #[test]
    fn a_backslash_separates_parts_as_a_slash_does() {
        assert_eq!(inside_repository("src\\..\\..\\x"), None);
        let inside = inside_repository("src\\a\\b.ts").expect("inside");
        assert_eq!(inside.below_root, PathBuf::from("src/a/b.ts"));
    }

    /// A drive-relative path (`C:x`), a drive path and a UNC or device path name places outside the
    /// repository on Windows (https://learn.microsoft.com/windows/win32/fileio/naming-a-file,
    /// "Fully qualified vs. relative paths" and "Win32 device namespaces").
    #[cfg(windows)]
    #[test]
    fn a_drive_relative_a_unc_and_a_device_path_are_no_place_inside_the_repository() {
        for outside in ["C:x", "C:\\x", "\\\\server\\share\\x", "\\\\?\\C:\\x"] {
            assert_eq!(inside_repository(outside), None, "{outside}");
        }
    }
}
