//! How the body and the members of a summary node changed over its history in Git: for each
//! revision of its file, when it was authored, and what its body and its containment list were.
//! Only those two things are kept, so two clocks can be told apart: the day the description was
//! last written and the day its membership last changed.

use std::collections::HashMap;

use hardened_git::{BlobAt, RepoPath, Repository};
use sha2::{Digest, Sha256};
use vault_document::frontmatter::Frontmatter;

/// The keys through which a parent holds what is below it.
pub const CONTAINMENT_KEYS: [&str; 4] = ["contains", "capabilities", "elements", "domains"];

/// Most revisions read for one node; the oldest are dropped.
pub const MAX_REVISIONS: usize = 40;

/// One revision of a node's file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Revision {
    /// The author time as Git wrote it (`%aI`).
    pub changed_at: String,
    pub body: [u8; 32],
    /// The members, each once, sorted: two lists with the same members are the same membership.
    pub membership: Vec<String>,
}

/// The slugs a node holds under the containment keys, each once, in the order found.
pub fn contained_slugs(frontmatter: &Frontmatter) -> Vec<String> {
    let mut slugs: Vec<String> = Vec::new();
    for key in CONTAINMENT_KEYS {
        for reference in frontmatter.list(key).unwrap_or_default() {
            let reference = answer_format::whitespace::trim(reference);
            if !reference.is_empty() && !slugs.iter().any(|known| known == reference) {
                slugs.push(reference.to_string());
            }
        }
    }
    slugs
}

/// A past revision split by lines and without a YAML parser: an old revision may predate the
/// schema, and a strict parse would take the whole advisory down. The frontmatter is what lies
/// between the opening `---` line and the next line that starts with `---`.
fn split_revision(text: &str) -> (&str, &str) {
    let Some(rest) = text
        .strip_prefix("---\r\n")
        .or_else(|| text.strip_prefix("---\n"))
    else {
        return ("", text);
    };
    let mut at = 0;
    while at < rest.len() {
        let here = rest.get(at..).unwrap_or_default();
        let closing_width = if here.starts_with("\r\n---") {
            Some("\r\n---".len())
        } else if here.starts_with("\n---") {
            Some("\n---".len())
        } else {
            None
        };
        if let Some(width) = closing_width {
            let after = here.get(width..).unwrap_or_default();
            let body = after
                .strip_prefix("\r\n")
                .or_else(|| after.strip_prefix('\n'))
                .unwrap_or(after);
            return (rest.get(..at).unwrap_or_default(), body);
        }
        at += here.chars().next().map_or(1, char::len_utf8);
    }
    ("", text)
}

fn is_line_break(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// The members of the first line that reads `key: [a, b]`, with one quote taken off either end of
/// each. A list written one entry to a line is not read.
fn inline_members(frontmatter: &str, key: &str) -> Vec<String> {
    let marker = format!("{key}:");
    for line in frontmatter.split(is_line_break) {
        let Some(rest) = line.strip_prefix(marker.as_str()) else {
            continue;
        };
        let Some(list) = rest.trim_start_matches([' ', '\t']).strip_prefix('[') else {
            continue;
        };
        let Some((inside, _)) = list.split_once(']') else {
            continue;
        };
        return inside
            .split(',')
            .map(|item| {
                let item = answer_format::whitespace::trim(item);
                let item = item.strip_prefix(['"', '\'']).unwrap_or(item);
                item.strip_suffix(['"', '\'']).unwrap_or(item).to_string()
            })
            .filter(|item| !item.is_empty())
            .collect();
    }
    Vec::new()
}

fn revision_of(changed_at: String, text: &str) -> Revision {
    let (frontmatter, body) = split_revision(text);
    let mut membership: Vec<String> = Vec::new();
    for key in CONTAINMENT_KEYS {
        for member in inline_members(frontmatter, key) {
            let member = answer_format::whitespace::trim(&member).to_string();
            if !member.is_empty() && !membership.contains(&member) {
                membership.push(member);
            }
        }
    }
    membership.sort();
    Revision {
        changed_at,
        body: Sha256::digest(body.as_bytes()).into(),
        membership,
    }
}

/// The revisions of each node's file, newest first, for the nodes of `slugs` whose file has a
/// history. A node with none is absent, never guessed. `vault_scope` is where the vault lies
/// below the top of `repository`.
pub fn node_revisions(
    repository: &Repository,
    vault_scope: &RepoPath,
    slugs: &[&str],
) -> HashMap<String, Vec<Revision>> {
    let mut found = HashMap::new();
    for slug in slugs {
        let Some(file) = RepoPath::new(&format!("{slug}.md")) else {
            continue;
        };
        let path = vault_scope.join(&file);
        let Ok(commits) = repository.file_commits(&path, MAX_REVISIONS) else {
            continue;
        };
        let requests: Vec<BlobAt> = commits
            .iter()
            .map(|(commit, _)| BlobAt {
                commit: commit.clone(),
                path: path.clone(),
            })
            .collect();
        let Ok(blobs) = repository.blobs(&requests) else {
            continue;
        };
        let revisions: Vec<Revision> = commits
            .into_iter()
            .zip(blobs)
            .filter_map(|((_, at), blob)| {
                let bytes = blob?;
                Some(revision_of(at, &String::from_utf8_lossy(&bytes)))
            })
            .collect();
        if !revisions.is_empty() {
            found.insert((*slug).to_string(), revisions);
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_revision_keeps_the_body_and_the_sorted_inline_members() {
        let first = revision_of(
            "t".into(),
            "---\nkind: domain\ncapabilities: [b, 'a']\n---\nBody\n",
        );
        let crlf = revision_of(
            "t".into(),
            "---\r\nkind: domain\r\ncapabilities: [a, \"b\"]\r\n---\r\nBody\n",
        );
        assert_eq!(first.membership, ["a", "b"]);
        assert_eq!(first, crlf);
        let rewritten = revision_of(
            "t".into(),
            "---\nkind: domain\ncapabilities: [a, b]\n---\nOther\n",
        );
        assert_ne!(first.body, rewritten.body);
        assert_eq!(first.membership, rewritten.membership);
    }

    #[test]
    fn a_block_list_is_not_read_as_members_and_a_file_without_frontmatter_is_all_body() {
        let block = revision_of("t".into(), "---\ncapabilities:\n  - a\n---\nBody\n");
        assert!(block.membership.is_empty());
        let plain = revision_of("t".into(), "Just text\n");
        assert_eq!(plain.body.as_slice(), Sha256::digest(b"Just text\n").as_slice());
    }
}
