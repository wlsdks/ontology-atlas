//! Two files of the vault whose names are one slug. A slug is its path in NFC, and some file
//! systems keep two spellings of one name (a Linux checkout of a vault made on macOS can hold
//! `caf\u{e9}.md` composed and decomposed), so the second file would be read as the first and its node
//! lost without a word. Each such name is reported once, on the slug both files share.

use std::collections::HashMap;

use vault_document::{Issue, LoadedDocument};

/// The slugs that more than one of `slugs` names, each with how many do, in the order they are
/// first seen.
fn repeated<'a>(slugs: impl Iterator<Item = &'a str>) -> Vec<(&'a str, usize)> {
    let mut counts: Vec<(&str, usize)> = Vec::new();
    let mut position: HashMap<&str, usize> = HashMap::new();
    for slug in slugs {
        let at = *position.entry(slug).or_insert_with(|| {
            counts.push((slug, 0));
            counts.len() - 1
        });
        if let Some((_, count)) = counts.get_mut(at) {
            *count += 1;
        }
    }
    counts.retain(|(_, count)| *count > 1);
    counts
}

/// One error for each slug that two or more files of `documents` fold to.
pub fn slug_collision_findings(documents: &[LoadedDocument]) -> Vec<(String, Issue)> {
    repeated(documents.iter().map(LoadedDocument::slug))
        .into_iter()
        .map(|(slug, count)| {
            (
                slug.to_string(),
                Issue::error(
                    "duplicate-file-name",
                    format!("{count} files are named {slug}: their names differ only in how the characters are composed (NFC or NFD), and the vault reads one node for them. Rename the others so each node has its own name."),
                ),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_name_given_twice_is_repeated_and_in_the_order_first_seen() {
        let found = repeated(["b", "a", "b", "c", "a", "b"].into_iter());
        assert_eq!(found, [("b", 3), ("a", 2)]);
        assert!(repeated(["a", "b"].into_iter()).is_empty());
    }
}
