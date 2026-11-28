//! What Git ignores under a folder, so the walk counts a built checkout and a clean one alike:
//! build output and generated files a repository ignores are not its code. A tracked file stays
//! counted even where a pattern would ignore it.

use std::collections::HashSet;
use std::path::Path;

use confined_files::real_path;
use hardened_git::Repository;
use icu_normalizer::ComposingNormalizerBorrowed;

/// The untracked paths under `root` that Git ignores, relative to it with `/` separators and in
/// NFC (macOS Git prints names precomposed while the disk may keep them decomposed); a folder
/// ignored whole is one entry, without its trailing `/`. Empty outside a repository, when the
/// work tree Git uses does not hold the folder (a `core.worktree` naming another folder would list
/// that folder's ignored files), or when Git cannot answer, so the walk then counts every file.
pub fn git_ignored_paths(root: &Path) -> HashSet<String> {
    let repository = Repository::at(root);
    let Ok(Some(top_level)) = repository.top_level() else {
        return HashSet::new();
    };
    let holds_root = match (real_path(&top_level), real_path(root)) {
        (Ok(top), Ok(real_root)) => real_root.starts_with(top),
        _ => false,
    };
    if !holds_root {
        return HashSet::new();
    }
    let Ok(listed) = repository.ignored_paths() else {
        return HashSet::new();
    };
    listed
        .iter()
        .map(|path| nfc(path.strip_suffix('/').unwrap_or(path)))
        .filter(|path| !path.is_empty() && path != ".")
        .collect()
}

/// `text` in NFC, borrowed when it already is or is plain ASCII.
pub fn nfc(text: &str) -> String {
    if text.is_ascii() {
        return text.to_string();
    }
    ComposingNormalizerBorrowed::new_nfc()
        .normalize(text)
        .into_owned()
}
