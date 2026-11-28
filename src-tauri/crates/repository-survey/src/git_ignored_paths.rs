//! What Git ignores under a folder, so the walk counts a built checkout and a clean one alike:
//! build output and generated files a repository ignores are not its code. A tracked file stays
//! counted even where a pattern would ignore it.

use std::collections::HashSet;
use std::path::Path;

use confined_files::real_path;
use hardened_git::Repository;
use icu_normalizer::ComposingNormalizerBorrowed;

/// [`ignored_paths_listing`] where a walk can do without the answer: when Git could not give it,
/// the walk counts every file.
pub fn git_ignored_paths(root: &Path) -> HashSet<String> {
    ignored_paths_listing(root).unwrap_or_default()
}

/// The untracked paths under `root` that Git ignores, relative to it with `/` separators and in
/// NFC (macOS Git prints names precomposed while the disk may keep them decomposed); a folder
/// ignored whole is one entry, without its trailing `/`. Empty outside a repository, and when the
/// work tree Git uses does not hold the folder (a `core.worktree` naming another folder would list
/// that folder's ignored files): nothing there is ignored by Git. `None` when the folder is in a
/// repository and Git could not answer, which is an unknown and not an empty list: a survey built
/// without it counts files the repository ignores and is not worth keeping.
pub fn ignored_paths_listing(root: &Path) -> Option<HashSet<String>> {
    let repository = Repository::at(root);
    let Some(top_level) = repository.top_level().ok()? else {
        return Some(HashSet::new());
    };
    let holds_root = match (real_path(&top_level), real_path(root)) {
        (Ok(top), Ok(real_root)) => real_root.starts_with(top),
        _ => false,
    };
    if !holds_root {
        return Some(HashSet::new());
    }
    let listed = repository.ignored_paths().ok()?;
    Some(
        listed
            .iter()
            .map(|path| nfc(path.strip_suffix('/').unwrap_or(path)))
            .filter(|path| !path.is_empty() && path != ".")
            .collect(),
    )
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
