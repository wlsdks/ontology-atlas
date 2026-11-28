//! How the body and the members of a summary node changed over its history in Git: for each
//! revision of its file, when it was authored, and what its body and its containment list were.
//! Only those two things are kept, so two clocks can be told apart: the day the description was last
//! written and the day its membership last changed.

use std::collections::HashMap;

use hardened_git::{BlobAt, CommitId, RepoPath, Repository};
use sha2::{Digest, Sha256};
use vault_document::frontmatter::Frontmatter;
use vault_document::Document;

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

fn revision_of(changed_at: String, text: &str) -> Revision {
    let document = Document::from_text(text);
    let mut membership = contained_slugs(document.frontmatter());
    membership.sort();
    let digest = Sha256::digest(document.body().as_bytes());
    Revision {
        changed_at,
        body: digest.into(),
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
                commit: CommitId::clone(commit),
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
    fn a_revision_keeps_the_body_and_the_sorted_members_whatever_the_list_style() {
        let inline = revision_of("t".into(), "---\nkind: domain\ncapabilities: [b, a]\n---\nBody\n");
        let block = revision_of("t".into(), "---\nkind: domain\ncapabilities:\n  - a\n  - b\n---\nBody\n");
        assert_eq!(inline.membership, ["a", "b"]);
        assert_eq!(inline, block);
        let rewritten = revision_of("t".into(), "---\nkind: domain\ncapabilities: [a, b]\n---\nOther\n");
        assert_ne!(inline.body, rewritten.body);
        assert_eq!(inline.membership, rewritten.membership);
    }
}
