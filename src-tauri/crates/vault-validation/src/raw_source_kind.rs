//! A file under `sources/` that carries a `kind:`. Every file there is read as a raw source and
//! never as a node, so the kind would be silently ignored; this says where the file would have to
//! live to become one.

use confined_files::VaultRoot;
use vault_document::schema::folder_for_kind;
use vault_document::{Document, Issue};

/// The kinds a node can have in a vault folder: the known kinds without the README's.
const NODE_KINDS: [&str; 5] = ["project", "domain", "capability", "element", "document"];

/// The slug of each raw source that claims a kind, and the finding about it, in slug order.
pub fn raw_source_kind_issues(root: &VaultRoot) -> Vec<(String, Issue)> {
    let mut found = Vec::new();
    for file in root.raw_source_markdown_files() {
        let Some(slug) = root.slug_of(&file) else {
            continue;
        };
        let Ok(text) = file.read_text() else {
            continue;
        };
        let document = Document::from_text(&text);
        let Some(kind) = document
            .frontmatter()
            .text("kind")
            .map(answer_format::whitespace::trim)
            .filter(|kind| !kind.is_empty())
        else {
            continue;
        };
        let home = match folder_for_kind(kind) {
            "" if NODE_KINDS.contains(&kind) => "the vault root",
            "" => "its kind folder",
            folder => folder,
        };
        let path = format!("{slug}.md");
        found.push((
            slug.clone(),
            Issue::warning(
                "kind-under-sources",
                format!("{path} carries `kind: {kind}`, but every file under sources/ is read as a raw source, never as a node. To make it a node, move it into {home}, then patch_concept each node that validate_vault reports with a dangling-graph-reference to {slug} so it names the new slug."),
            ),
        ));
    }
    found
}

#[cfg(test)]
#[allow(
    clippy::disallowed_methods,
    reason = "a test plants the files the check reads, which the crate otherwise never writes"
)]
mod tests {
    use super::*;

    #[test]
    fn a_raw_source_with_a_kind_is_told_where_it_would_have_to_live() {
        let folder = tempfile::tempdir().expect("folder");
        let sources = folder.path().join("sources");
        std::fs::create_dir_all(&sources).expect("sources");
        std::fs::write(sources.join("a.md"), "---\nkind: capability\n---\nBody\n").expect("a");
        std::fs::write(sources.join("b.md"), "No frontmatter\n").expect("b");
        std::fs::write(sources.join("c.md"), "---\nkind: document\n---\nBody\n").expect("c");
        let root = VaultRoot::open(folder.path()).expect("root");
        let found = raw_source_kind_issues(&root);
        let slugs: Vec<&str> = found.iter().map(|(slug, _)| slug.as_str()).collect();
        assert_eq!(slugs, ["sources/a", "sources/c"]);
        assert!(found[0]
            .1
            .message
            .as_deref()
            .unwrap_or("")
            .contains("move it into capabilities/,"));
        assert!(found[1]
            .1
            .message
            .as_deref()
            .unwrap_or("")
            .contains("move it into the vault root,"));
    }

    /// A file saved on Windows ends its lines with CR LF (Git's `autocrlf` does it on checkout), and
    /// its frontmatter is read all the same: the kind under `sources/` is found.
    #[test]
    fn a_raw_source_saved_with_windows_line_endings_still_reports_its_kind() {
        let folder = tempfile::tempdir().expect("folder");
        let sources = folder.path().join("sources");
        std::fs::create_dir_all(&sources).expect("sources");
        std::fs::write(
            sources.join("a.md"),
            "---\r\nkind: capability\r\ntitle: A\r\n---\r\nBody\r\n",
        )
        .expect("a");
        let root = VaultRoot::open(folder.path()).expect("root");
        let found = raw_source_kind_issues(&root);
        let slugs: Vec<&str> = found.iter().map(|(slug, _)| slug.as_str()).collect();
        assert_eq!(slugs, ["sources/a"]);
    }
}
