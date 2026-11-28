//! The files a reader opens first in a unit: the one named for its folder, an index or main file,
//! then the longest.

use crate::entry_signals::stem_of;
use crate::folder_tree::TreeFile;
use crate::unit_collection::UnitScope;

/// A unit lists at most this many main files.
pub const MAIN_FILES_PER_UNIT: usize = 3;
const ENTRY_FILE_STEMS: [&str; 8] = [
    "index", "main", "mod", "lib", "app", "server", "cli", "__main__",
];
/// A barrel shorter than this names nothing a reader needs; the file it forwards to does.
const BARREL_LINES: usize = 20;

/// The main files of the unit at `unit_path` holding `files`.
pub fn main_files_of(unit_path: &str, scope: UnitScope, files: &[TreeFile]) -> Vec<TreeFile> {
    if scope == UnitScope::File {
        return files.first().cloned().into_iter().collect();
    }
    let folder = unit_path.rsplit('/').next().unwrap_or(unit_path);
    let rank = |file: &TreeFile| {
        let stem = stem_of(&file.path);
        if stem == folder {
            0
        } else if ENTRY_FILE_STEMS.contains(&stem) && file.lines >= BARREL_LINES {
            1
        } else {
            2
        }
    };
    let mut by_length: Vec<&TreeFile> = files.iter().collect();
    by_length.sort_by(|left, right| {
        right
            .lines
            .cmp(&left.lines)
            .then_with(|| answer_format::collation::compare_text(&left.path, &right.path))
    });
    let mut named: Vec<&TreeFile> = by_length
        .iter()
        .copied()
        .filter(|file| rank(file) < 2)
        .collect();
    named.sort_by_key(|file| rank(file));
    let mut candidates: Vec<&TreeFile> = Vec::new();
    candidates.extend(named.first().copied());
    candidates.extend(by_length.first().copied());
    candidates.extend(named.iter().skip(1).copied());
    candidates.extend(by_length.iter().copied());
    let mut picked: Vec<TreeFile> = Vec::new();
    for file in candidates {
        if !picked.iter().any(|held| held.path == file.path) {
            picked.push(file.clone());
        }
        if picked.len() == MAIN_FILES_PER_UNIT {
            break;
        }
    }
    picked
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, lines: usize) -> TreeFile {
        TreeFile {
            path: path.to_string(),
            lines,
        }
    }

    fn names(picked: &[TreeFile]) -> Vec<&str> {
        picked.iter().map(|file| file.path.as_str()).collect()
    }

    #[test]
    fn the_file_named_for_its_folder_comes_first_then_the_longest() {
        let files = [
            file("src/order/helpers.ts", 90),
            file("src/order/order.ts", 10),
            file("src/order/index.ts", 40),
            file("src/order/tiny.ts", 5),
        ];
        assert_eq!(
            names(&main_files_of("src/order", UnitScope::Tree, &files)),
            [
                "src/order/order.ts",
                "src/order/helpers.ts",
                "src/order/index.ts"
            ]
        );
    }

    #[test]
    fn a_three_line_barrel_is_not_a_main_file() {
        let files = [file("a/index.ts", 3), file("a/real.ts", 50)];
        assert_eq!(
            names(&main_files_of("a", UnitScope::Tree, &files)),
            ["a/real.ts", "a/index.ts"]
        );
    }

    #[test]
    fn a_module_of_its_own_is_its_own_main_file() {
        let files = [file("src/big.ts", 400)];
        assert_eq!(
            names(&main_files_of("src/big.ts", UnitScope::File, &files)),
            ["src/big.ts"]
        );
    }
}
