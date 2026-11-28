//! Every Markdown file of a vault, listed once in an order that does not depend on the file
//! system.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::slug_rules::VAULT_SOURCES_DIR;
use crate::vault_root::ConfinedPath;

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
pub(crate) fn list_markdown_files(root: &Path) -> Vec<ConfinedPath> {
    let mut found: Vec<PathBuf> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(keeps_entry)
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".md"))
        .map(walkdir::DirEntry::into_path)
        .collect();
    sort_utf16(&mut found);
    found.into_iter().map(ConfinedPath::new).collect()
}

/// The absolute path of every `.md` file below the vault's `sources/` folder, for a check that
/// asks what a raw source claims to be. A name that starts with a dot is skipped, a link is
/// neither followed nor listed, and a folder that cannot be read is skipped.
pub(crate) fn list_raw_source_markdown(root: &Path) -> Vec<ConfinedPath> {
    let mut found: Vec<PathBuf> = WalkDir::new(root.join(VAULT_SOURCES_DIR))
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.'))
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".md"))
        .map(walkdir::DirEntry::into_path)
        .collect();
    sort_utf16(&mut found);
    found.into_iter().map(ConfinedPath::new).collect()
}

/// Sorts `paths` by UTF-16 code unit. The byte order of UTF-8 is the same order unless a path holds
/// a character from U+E000 up to U+FFFF (which UTF-16 puts after the astral characters that UTF-8
/// puts after it), so the common listing is sorted as bytes; one that has such a character is
/// sorted on keys of UTF-16 units made once per path.
fn sort_utf16(paths: &mut [PathBuf]) {
    let beyond_astral_lead = |path: &PathBuf| {
        path.to_string_lossy()
            .chars()
            .any(|character| ('\u{e000}'..='\u{ffff}').contains(&character))
    };
    if paths.iter().any(beyond_astral_lead) {
        paths
            .sort_by_cached_key(|path| path.to_string_lossy().encode_utf16().collect::<Vec<u16>>());
    } else {
        paths.sort_unstable_by(|left, right| {
            left.as_os_str()
                .as_encoded_bytes()
                .cmp(right.as_os_str().as_encoded_bytes())
        });
    }
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
    fn the_byte_sort_and_the_unit_sort_agree_unless_a_path_holds_a_character_from_u_e000_up() {
        let sorted = |names: &[&str]| {
            let mut paths: Vec<PathBuf> = names.iter().map(PathBuf::from).collect();
            sort_utf16(&mut paths);
            paths
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect::<Vec<_>>()
        };
        let by_units = |names: &[&str]| {
            let mut names: Vec<String> = names.iter().map(ToString::to_string).collect();
            names.sort_by(|left, right| utf16_order(left, right));
            names
        };
        for names in [
            vec!["b/a.md", "a/b.md", "a b/c.md", "a-c/d.md", "a/b/c.md"],
            vec!["\u{1F600}.md", "z.md", "\u{FF5E}.md", "\u{D7FF}.md"],
            vec!["\u{1F600}/a.md", "\u{AC00}/a.md", "caf\u{e9}.md", "cafe.md"],
        ] {
            assert_eq!(sorted(&names), by_units(&names), "{names:?}");
        }
    }

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
