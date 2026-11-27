//! Every Markdown file of a vault, listed once in an order that does not depend on the file
//! system.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::slug_rules::VAULT_SOURCES_DIR;

const SKIPPED_FOLDERS: [&str; 7] = [
    "node_modules",
    ".next",
    ".git",
    "out",
    "build",
    "dist",
    ".serena",
];

/// Compares as JavaScript's default `Array.prototype.sort` does: by UTF-16 code unit. It differs
/// from the byte order of UTF-8 for characters beyond U+FFFF against those from U+E000 up.
pub fn utf16_order(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

/// The absolute path of every `.md` file below `root`, except dotfiles, dot folders, build
/// folders, and `sources/` at the root, sorted by UTF-16 code unit of the whole path.
///
/// A link is neither followed nor listed. A folder that cannot be read is skipped without an
/// error, as the file below it cannot be named anyway. Directory order differs between file
/// systems, and every consumer (the document cache, the breadth-first path search, list order)
/// inherits this order, so it is fixed here once.
pub fn list_markdown_files(root: &Path) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(keeps_entry)
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".md"))
        .map(walkdir::DirEntry::into_path)
        .collect();
    found.sort_by(|left, right| utf16_order(&left.to_string_lossy(), &right.to_string_lossy()));
    found
}

fn keeps_entry(entry: &walkdir::DirEntry) -> bool {
    // The root is the folder the person chose, whatever it is called.
    if entry.depth() == 0 {
        return true;
    }
    let name = entry.file_name().to_string_lossy();
    if name.starts_with('.') {
        return false;
    }
    if entry.file_type().is_dir() {
        if SKIPPED_FOLDERS.contains(&name.as_ref()) {
            return false;
        }
        if entry.depth() == 1 && name == VAULT_SOURCES_DIR {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_order_is_utf16_not_utf8() {
        // U+FF5E (a BMP letter above the surrogates) sorts after U+1F600 in UTF-16 and before it
        // in UTF-8.
        let emoji = "\u{1F600}";
        let fullwidth = "\u{FF5E}";
        assert_eq!(utf16_order(emoji, fullwidth), Ordering::Less);
        assert_eq!(emoji.cmp(fullwidth), Ordering::Greater);
        assert_eq!(utf16_order("a/b", "a b"), Ordering::Greater);
    }
}
