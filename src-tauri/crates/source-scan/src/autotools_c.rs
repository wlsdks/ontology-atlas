//! Whether a repository is an autotools C project, whose include graph an import scan cannot
//! read: zero edges there is not evidence of zero dependencies, and the scan says so.

use std::path::Path;

use confined_files::EntryKind;

use crate::path_facts::PathFacts;
use crate::source_walk::{list_sorted, DEFAULT_IGNORE};

const MAX_ENTRIES: usize = 2000;
const MAX_DEPTH: usize = 3;
const MANIFESTS: [&str; 3] = ["configure.ac", "configure.in", "Makefile.am"];
const SOURCE_FOLDERS: [&str; 5] = ["src", "source", "lib", "app", "internal"];

/// An autotools manifest at the root and a `.c` or `.h` file where C source is usually kept.
pub fn detect_autotools_c(facts: &PathFacts<'_>) -> bool {
    let root = facts.root();
    if !MANIFESTS
        .iter()
        .any(|manifest| facts.is_own_file(&root.join(manifest)))
    {
        return false;
    }
    let mut seen = 0usize;
    if holds_c_source(facts, root, 0, false, &mut seen) {
        return true;
    }
    SOURCE_FOLDERS.iter().any(|folder| {
        let folder = root.join(folder);
        facts.is_own_directory(&folder) && holds_c_source(facts, &folder, 0, true, &mut seen)
    })
}

fn holds_c_source(
    facts: &PathFacts<'_>,
    directory: &Path,
    depth: usize,
    descend: bool,
    seen: &mut usize,
) -> bool {
    if depth > MAX_DEPTH || *seen >= MAX_ENTRIES {
        return false;
    }
    for (name, kind) in list_sorted(facts.files(), directory) {
        if *seen >= MAX_ENTRIES {
            return false;
        }
        *seen += 1;
        if DEFAULT_IGNORE.contains(&name.as_str()) || name.starts_with('.') {
            continue;
        }
        match kind {
            EntryKind::Directory
                if descend
                    && holds_c_source(facts, &directory.join(&name), depth + 1, true, seen) =>
            {
                return true;
            }
            EntryKind::File => {
                let lowered = name.to_lowercase();
                if lowered.ends_with(".c") || lowered.ends_with(".h") {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
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
}
