//! Every Markdown file of a vault, listed once in an order that does not depend on the file
//! system.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::real_paths::real_path;
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
///
/// `sources` itself must be a real folder of the vault: a vault whose `sources` is a link (to `/`,
/// to `../..`) lists nothing, because the walk would otherwise leave the vault and the caller would
/// read every Markdown file it met. The script server walks only a real directory too.
pub(crate) fn list_raw_source_markdown(root: &Path) -> Vec<ConfinedPath> {
    let sources = root.join(VAULT_SOURCES_DIR);
    if !is_real_folder_of(root, &sources) {
        return Vec::new();
    }
    let mut found: Vec<PathBuf> = WalkDir::new(&sources)
        .follow_links(false)
        .follow_root_links(false)
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
        })
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".md"))
        .map(walkdir::DirEntry::into_path)
        .collect();
    sort_utf16(&mut found);
    found.into_iter().map(ConfinedPath::new).collect()
}

/// Whether `folder` is a folder that is not a link and sits directly in `root` as spelled: its own
/// entry is a directory (`lstat`, so a link to a folder is not one), and its real path is the real
/// path of `root` followed by the same name, which also refuses a junction (Windows shows one as a
/// folder) and a case-folded spelling.
fn is_real_folder_of(root: &Path, folder: &Path) -> bool {
    let is_directory =
        std::fs::symlink_metadata(folder).is_ok_and(|entry| entry.file_type().is_dir());
    if !is_directory {
        return false;
    }
    let (Ok(real_root), Ok(real_folder)) = (real_path(root), real_path(folder)) else {
        return false;
    };
    folder
        .file_name()
        .is_some_and(|name| real_folder == real_root.join(name))
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

    /// A link at `sources` hands the walk a folder outside the vault: nothing is listed, whether
    /// it leads to a folder beside the vault or to the vault's own parent, and a real `sources`
    /// is listed without following the links inside it.
    #[cfg(unix)]
    #[test]
    #[allow(
        clippy::disallowed_methods,
        reason = "a test plants the folders and links the walk meets"
    )]
    fn a_sources_link_is_not_walked_and_a_real_sources_folder_is_without_its_links() {
        let base = tempfile::tempdir().expect("temp dir");
        let real = std::fs::canonicalize(base.path()).expect("real");
        let vault = real.join("vault");
        let outside = real.join("outside");
        std::fs::create_dir_all(&vault).expect("vault");
        std::fs::create_dir_all(outside.join("deep")).expect("outside");
        std::fs::write(outside.join("leak.md"), "kind: capability\n").expect("leak");
        std::fs::write(outside.join("deep/more.md"), "kind: capability\n").expect("more");
        for target in [&outside, &real] {
            std::os::unix::fs::symlink(target, vault.join("sources")).expect("link");
            assert!(list_raw_source_markdown(&vault).is_empty(), "{target:?}");
            std::fs::remove_file(vault.join("sources")).expect("unlink");
        }
        std::fs::create_dir_all(vault.join("sources/notes")).expect("sources");
        std::fs::write(vault.join("sources/notes/a.md"), "a").expect("a");
        std::os::unix::fs::symlink(outside.join("leak.md"), vault.join("sources/linked.md"))
            .expect("file link");
        std::os::unix::fs::symlink(&outside, vault.join("sources/linked-folder"))
            .expect("folder link");
        let listed: Vec<PathBuf> = list_raw_source_markdown(&vault)
            .iter()
            .map(|file| file.as_path().to_path_buf())
            .collect();
        assert_eq!(listed, [vault.join("sources/notes/a.md")]);
    }

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
