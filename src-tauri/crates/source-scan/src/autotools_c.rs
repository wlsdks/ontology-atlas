//! Whether a repository is an autotools C project, whose include graph an import scan cannot
//! read: zero edges there is not evidence of zero dependencies, and the scan says so.

use confined_files::EntryKind;

use crate::path_facts::PathFacts;
use crate::source_walk::{walk_sorted, Flow, WalkLimits, DEFAULT_IGNORE};

const MAX_ENTRIES: usize = 2000;
/// Folders below the root that are looked into: a source folder and three levels under it.
const DEEPEST_FOLDER: usize = 4;
const MANIFESTS: [&str; 3] = ["configure.ac", "configure.in", "Makefile.am"];
const SOURCE_FOLDERS: [&str; 5] = ["src", "source", "lib", "app", "internal"];

/// An autotools manifest at the root and a `.c` or `.h` file where C source is usually kept: at
/// the root itself or below a source folder.
pub fn detect_autotools_c(facts: &PathFacts<'_>) -> bool {
    let root = facts.root();
    if !MANIFESTS
        .iter()
        .any(|manifest| facts.is_own_file(&root.join(manifest)))
    {
        return false;
    }
    let mut found = false;
    walk_sorted(
        facts.files(),
        root,
        WalkLimits {
            deepest_folder: DEEPEST_FOLDER,
            max_entries: MAX_ENTRIES,
        },
        &|entry| {
            !DEFAULT_IGNORE.contains(&entry.name)
                && !entry.name.starts_with('.')
                && (entry.kind == EntryKind::File
                    || entry.depth > 0
                    || SOURCE_FOLDERS.contains(&entry.name))
        },
        &mut |entry| {
            let lowered = entry.name.to_lowercase();
            if entry.kind == EntryKind::File && (lowered.ends_with(".c") || lowered.ends_with(".h"))
            {
                found = true;
                return Flow::Stop;
            }
            Flow::Continue
        },
    );
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::planted_tree::PlantedTree;

    fn detect(files: &[&str]) -> bool {
        let planted: Vec<(&str, &str)> = files.iter().map(|name| (*name, "")).collect();
        let tree = PlantedTree::new(&planted);
        let source = tree.source();
        detect_autotools_c(&PathFacts::new(&source))
    }

    #[test]
    fn a_manifest_and_c_source_make_an_autotools_project_and_either_alone_does_not() {
        assert!(detect(&["configure.ac", "src/main.c"]));
        assert!(detect(&["Makefile.am", "util.H"]));
        assert!(!detect(&["configure.ac", "src/main.rs"]));
        assert!(!detect(&["src/main.c"]));
    }

    #[test]
    fn c_source_counts_only_at_the_root_or_within_three_folders_of_a_source_folder() {
        assert!(!detect(&["configure.ac", "docs/example.c"]));
        assert!(detect(&["configure.ac", "src/a/b/c/deep.c"]));
        assert!(!detect(&["configure.ac", "src/a/b/c/d/deeper.c"]));
    }
}
