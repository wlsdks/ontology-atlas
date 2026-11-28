//! Source-role witnesses from a project's documents: each is one claim that a node is implemented at
//! a repository-relative path, and the count that lands is a source binding's only honest
//! confidence signal. The documents must be scoped to the project with the containment the project
//! graph hash uses, so the two cannot disagree about what "this project" is.

use std::collections::HashSet;
use std::sync::LazyLock;

use answer_format::whitespace::trim;
use regex::Regex;
use serde::Serialize;
use vault_document::LoadedDocument;

use crate::competency_evidence::competency_evidence_paths;

static KNOWN_CODE_EXTENSION: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"(?i)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|md|mdx|css|scss|json|ya?ml|py|rs|go|java|rb|swift|kt|vue|svelte|html|sql|sh)$")
});
static CODE_PATH_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^(src|app|cli|mcp|tests?|scripts?|docs|packages?|lib|apps?|internal|pkg)/")
});

fn pattern(source: &str) -> Regex {
    Regex::new(source).unwrap_or_else(|error| unreachable!("a built-in pattern is invalid: {error}"))
}

/// One claim, as the receipt stores it before it is judged: the node, the role it plays and where.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WitnessClaim {
    pub id: String,
    #[serde(rename = "nodeSlug")]
    pub node_slug: String,
    pub role: &'static str,
    pub path: String,
}

/// A `\`-free, `./`-free, root-free spelling of a witness path.
pub fn normalized_witness_path(value: &str) -> String {
    let unified = value.replace('\\', "/");
    let without_dot = unified.strip_prefix("./").unwrap_or(&unified);
    without_dot.trim_start_matches('/').to_string()
}

fn looks_like_code_path(title: &str) -> bool {
    let value = trim(title);
    value.contains('/')
        && !value.chars().any(answer_format::whitespace::is_whitespace)
        && (KNOWN_CODE_EXTENSION.is_match(value) || CODE_PATH_PREFIX.is_match(value))
}

fn has_control_character(value: &str) -> bool {
    value.chars().any(|character| character <= '\u{1f}' || character == '\u{7f}')
}

fn looks_like_witness_path(value: &str) -> bool {
    if value == "." {
        return true;
    }
    let mut characters = value.chars();
    let drive = matches!(
        (characters.next(), characters.next(), characters.next()),
        (Some(letter), Some(':'), Some('/' | '\\')) if letter.is_ascii_alphabetic()
    );
    if value.is_empty()
        || trim(value) != value
        || value.starts_with('/')
        || drive
        || value.contains('\\')
        || has_control_character(value)
    {
        return false;
    }
    let normalized = normalized_witness_path(value);
    !normalized.is_empty()
        && answer_format::utf16::len(&normalized) <= 500
        && normalized
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

fn role_for_kind(kind: &str) -> &'static str {
    if kind == "capability" || kind == "project" {
        "entrypoint"
    } else {
        "implementation"
    }
}

/// The app's graph id of a document, `kind:` and the last slug segment.
fn graph_node_id(document: &LoadedDocument) -> String {
    let frontmatter = document.frontmatter();
    let kind = frontmatter.text("kind").map(trim).unwrap_or("");
    let declared = frontmatter.text("slug").map(trim).unwrap_or("");
    let tail = document.slug().rsplit('/').next().unwrap_or(document.slug());
    let tail = if tail.is_empty() { document.slug() } else { tail };
    let id_slug = if kind == "project" && !declared.is_empty() {
        declared
    } else {
        tail
    };
    format!("{kind}:{id_slug}")
}

struct Claims {
    claims: Vec<WitnessClaim>,
    seen: HashSet<String>,
}

impl Claims {
    /// One path may witness different roles (a capability entrypoint and its element): a node's
    /// repeated claim is dropped, never the path globally.
    fn add(&mut self, id: String, node_slug: &str, role: &'static str, path: &str) {
        if !looks_like_witness_path(path) {
            return;
        }
        let path = normalized_witness_path(path);
        if !self.seen.insert(format!("{node_slug}\0{path}")) {
            return;
        }
        self.claims.push(WitnessClaim {
            id,
            node_slug: node_slug.to_string(),
            role,
            path,
        });
    }
}

/// Every claim the documents make: a node's `path:`, the code paths of its `elements:`, the paths
/// the project's competency answers cite, and an element whose title is a raw code path.
pub fn derive_witness_claims(project_slug: &str, documents: &[&LoadedDocument]) -> Vec<WitnessClaim> {
    derive_witness_claims_with_body(project_slug, documents, None)
}

/// The same claims when the project's body is `project_body` instead of the file's: what a
/// competency section about to be written would claim.
pub fn derive_witness_claims_with_body(
    project_slug: &str,
    documents: &[&LoadedDocument],
    project_body: Option<&str>,
) -> Vec<WitnessClaim> {
    let mut claims = Claims {
        claims: Vec::new(),
        seen: HashSet::new(),
    };
    for document in documents {
        let frontmatter = document.frontmatter();
        let slug = document.slug();
        if let Some(path) = frontmatter.text("path").filter(|path| !trim(path).is_empty()) {
            let kind = frontmatter.text("kind").unwrap_or("");
            claims.add(format!("{slug}:path"), slug, role_for_kind(kind), path);
        }
        for element in frontmatter.list("elements").unwrap_or_default() {
            if !looks_like_code_path(element) {
                continue;
            }
            let normalized = normalized_witness_path(element);
            claims.add(
                format!("{slug}:element:{normalized}"),
                slug,
                "implementation",
                &normalized,
            );
        }
    }
    let project = documents.iter().find(|document| {
        document.frontmatter().text("kind") == Some("project")
            && (document.slug() == project_slug
                || document.frontmatter().text("slug") == Some(project_slug))
    });
    if let Some(project) = project {
        let file_body = project.body();
        let body = project_body.map(std::borrow::Cow::Borrowed).or_else(|| file_body.ok());
        if let Some(body) = body {
            for (index, path) in competency_evidence_paths(&body).iter().enumerate() {
                claims.add(
                    format!("competency-evidence:{}", index + 1),
                    project.slug(),
                    "competency-evidence",
                    path,
                );
            }
        }
    }
    for document in documents {
        let frontmatter = document.frontmatter();
        if frontmatter.text("kind") != Some("element") {
            continue;
        }
        let Some(title) = frontmatter.text("title").filter(|title| !trim(title).is_empty()) else {
            continue;
        };
        if looks_like_code_path(title) {
            claims.add(
                format!("{}:path", graph_node_id(document)),
                document.slug(),
                "implementation",
                title,
            );
        }
    }
    claims
        .claims
        .sort_by(|left, right| answer_format::utf16::compare(&left.id, &right.id));
    claims.claims
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_witness_path_is_relative_free_of_dot_parts_and_may_be_the_root() {
        for good in [".", "src/a.ts", "src/dir", "./src/a.ts"] {
            assert!(looks_like_witness_path(good), "{good}");
        }
        for bad in ["", "/etc/x", "C:\\x", "src/../x", "a//b", " a", "a\\b", "a\u{0}b"] {
            assert!(!looks_like_witness_path(bad), "{bad:?}");
        }
        assert_eq!(normalized_witness_path("./src\\a.ts"), "src/a.ts");
    }

    #[test]
    fn an_element_title_is_a_code_path_only_with_a_slash_no_space_and_a_known_ending_or_prefix() {
        assert!(looks_like_code_path("src/billing/invoice.ts"));
        assert!(looks_like_code_path("internal/billing"));
        assert!(!looks_like_code_path("Billing code"));
        assert!(!looks_like_code_path("billing.ts"));
        assert!(!looks_like_code_path("some/place with space.ts"));
    }
}
