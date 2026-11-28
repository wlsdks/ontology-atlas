//! A folder with no repository to ask: one walk that reads each file's size and modification time
//! and no file's bytes. A change that keeps both is not seen, and one that only touches the time
//! is; a repository answers exactly, so this is the fallback and not the rule.

use confined_files::{EntryKind, ProbeFolder};
use sha2::{Digest, Sha256};

use crate::composed_name::composed;
use crate::probe_error::ProbeError;
use crate::source_digest::lower_hex;
use crate::source_inventory_limits::{
    SOURCE_INVENTORY_MAX_DEPTH, SOURCE_INVENTORY_VERSION, SOURCE_PRUNE_DIR_NAMES,
};
use crate::vault_exclusion::is_excluded;

pub struct FolderState {
    pub fingerprint: String,
    pub truncated: bool,
    pub files: Vec<String>,
}

struct Walk<'a> {
    folder: &'a ProbeFolder,
    excluded: Option<&'a str>,
    lines: Vec<String>,
    truncated: bool,
}

impl Walk<'_> {
    fn descend(&mut self, prefix: &str, depth: usize) -> Result<(), ProbeError> {
        if depth > SOURCE_INVENTORY_MAX_DEPTH {
            self.truncated = true;
            return Ok(());
        }
        for child in self.folder.list(prefix)? {
            let relative = if prefix.is_empty() {
                child.name.clone()
            } else {
                format!("{prefix}/{}", child.name)
            };
            if is_excluded(&relative, self.excluded) {
                continue;
            }
            if child.is_directory {
                if !SOURCE_PRUNE_DIR_NAMES.contains(&child.name.as_str()) {
                    self.descend(&relative, depth + 1)?;
                }
                continue;
            }
            // A file removed since the listing is no file of this state.
            let Some(facts) = self.folder.facts(&relative)? else {
                continue;
            };
            if facts.kind != EntryKind::File {
                continue;
            }
            self.lines.push(format!(
                "{}\0{}\0{}\n",
                composed(&relative),
                facts.size,
                facts.modified_ms
            ));
        }
        Ok(())
    }
}

pub fn inspect_folder_state(
    folder: &ProbeFolder,
    excluded: Option<&str>,
) -> Result<FolderState, ProbeError> {
    let mut walk = Walk {
        folder,
        excluded,
        lines: Vec::new(),
        truncated: false,
    };
    walk.descend("", 0)?;
    // A line begins with its path and a zero, which sorts before any path character, so sorting
    // the lines sorts the paths.
    walk.lines.sort();
    let mut hash = Sha256::new();
    hash.update(SOURCE_INVENTORY_VERSION.as_bytes());
    hash.update([0]);
    for line in &walk.lines {
        hash.update(line.as_bytes());
    }
    Ok(FolderState {
        fingerprint: format!("sha256:{}", lower_hex(&hash.finalize())),
        truncated: walk.truncated,
        files: walk
            .lines
            .iter()
            .map(|line| line.split('\0').next().unwrap_or("").to_string())
            .collect(),
    })
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    reason = "a test builds its folders with the standard library"
)]
mod tests {
    use super::*;

    #[test]
    fn a_walk_lists_files_in_path_order_leaves_out_pruned_folders_and_the_vault_and_marks_a_deep_tree_cut() {
        let root = tempfile::tempdir().expect("temp dir");
        for name in ["b.txt", "a/z.txt", "a/y.txt", "node_modules/x.js", "atlas/n.md"] {
            let path = root.path().join(name);
            std::fs::create_dir_all(path.parent().expect("parent")).expect("folder");
            std::fs::write(path, b"x").expect("file");
        }
        let folder = ProbeFolder::open(root.path()).expect("opens");
        let state = inspect_folder_state(&folder, Some("atlas")).expect("walks");
        assert_eq!(state.files, ["a/y.txt", "a/z.txt", "b.txt"]);
        assert!(!state.truncated);

        let mut deep = root.path().to_path_buf();
        for level in 0..=SOURCE_INVENTORY_MAX_DEPTH + 1 {
            deep.push(format!("d{level}"));
        }
        std::fs::create_dir_all(&deep).expect("deep folder");
        let cut = inspect_folder_state(&folder, Some("atlas")).expect("walks");
        assert!(cut.truncated);
    }
}
