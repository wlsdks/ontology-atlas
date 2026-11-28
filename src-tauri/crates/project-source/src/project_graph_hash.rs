//! A semantic change detector for one project's ontology documents: a short hash of the slug, kind,
//! title, domain, path and relation lists of every node in the project's containment, so a receipt
//! can say that the ontology moved since it was measured. The caller owns containment; this owns
//! the canonical text, which the app's screens hash the same way.

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use serde::Serialize;
use vault_document::frontmatter::Frontmatter;
use vault_document::LoadedDocument;

fn non_blank(frontmatter: &Frontmatter, key: &str) -> Option<String> {
    frontmatter
        .text(key)
        .map(trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn string_list(frontmatter: &Frontmatter, key: &str) -> Option<Vec<String>> {
    let mut values: Vec<String> = Vec::new();
    for item in frontmatter.list(key)? {
        let item = trim(item);
        if !item.is_empty() && !values.iter().any(|seen| seen == item) {
            values.push(item.to_string());
        }
    }
    values.sort_by(|left, right| compare_text(left, right));
    (!values.is_empty()).then_some(values)
}

#[derive(Serialize)]
struct Graph {
    #[serde(skip_serializing_if = "Option::is_none")]
    domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    domains: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    capabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    elements: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dependencies: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    depends_on: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    relates: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    contains: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    describes: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    broader: Option<Vec<String>>,
}

#[derive(Serialize)]
struct CanonicalDocument {
    slug: String,
    kind: String,
    title: String,
    graph: Graph,
}

#[derive(Serialize)]
struct Canonical<'a> {
    version: u8,
    #[serde(rename = "projectSlug")]
    project_slug: &'a str,
    docs: Vec<CanonicalDocument>,
}

fn canonical(document: &LoadedDocument) -> CanonicalDocument {
    let frontmatter = document.frontmatter();
    let path = non_blank(frontmatter, "path").map(|path| {
        let unified = path.replace('\\', "/");
        unified.strip_prefix("./").unwrap_or(&unified).to_string()
    });
    CanonicalDocument {
        slug: document.slug().to_string(),
        kind: non_blank(frontmatter, "kind").unwrap_or_default(),
        title: non_blank(frontmatter, "title")
            .or_else(|| non_blank(frontmatter, "name"))
            .unwrap_or_else(|| document.slug().to_string()),
        graph: Graph {
            domain: non_blank(frontmatter, "domain"),
            path,
            domains: string_list(frontmatter, "domains"),
            capabilities: string_list(frontmatter, "capabilities"),
            elements: string_list(frontmatter, "elements"),
            dependencies: string_list(frontmatter, "dependencies"),
            depends_on: string_list(frontmatter, "depends_on"),
            relates: string_list(frontmatter, "relates"),
            contains: string_list(frontmatter, "contains"),
            describes: string_list(frontmatter, "describes"),
            broader: string_list(frontmatter, "broader"),
        },
    }
}

/// `project-graph-v1:` and eight hexadecimal digits: the 32-bit FNV-1a hash over the UTF-16 units
/// of the canonical JSON, the one definition the browser-free app and the server share.
pub fn project_graph_hash(project_slug: &str, documents: &[&LoadedDocument]) -> String {
    let mut documents: Vec<CanonicalDocument> = documents
        .iter()
        .filter(|document| !document.slug().is_empty())
        .map(|document| canonical(document))
        .collect();
    documents.sort_by(|left, right| compare_text(&left.slug, &right.slug));
    let text = answer_format::json::to_string(&Canonical {
        version: 1,
        project_slug,
        docs: documents,
    })
    .unwrap_or_default();
    let mut hash: u32 = 0x811c_9dc5;
    for unit in text.encode_utf16() {
        hash ^= u32::from(unit);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    format!("project-graph-v1:{hash:08x}")
}
