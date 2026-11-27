//! What is wrong with one document read alone: frontmatter the reader could not honour, a node with
//! no identity, relations that are not canonical sets, notes that swallowed other notes, and what
//! its body leaves unsaid. What only the whole vault can see (a reference naming nothing, two
//! documents claiming one slug) is in [`crate::vault_issues`].

use std::collections::HashSet;

use answer_format::collation::compare_text;
use answer_format::whitespace::trim;
use indexmap::IndexSet;
use serde::Serialize;

use crate::body_findings::body_findings;
use crate::document::{Document, RawShape};
use crate::frontmatter::{DiagnosticCode, Frontmatter, Scalar, Value};
use crate::meaning_wording::slug_outside_kind_folder;
use crate::schema::{
    folder_for_kind, inspect_merged_uids, missing_expected_fields, node_uid_issue, MergedUids,
    KNOWN_KINDS,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

/// One finding about a document: a code an agent branches on, how serious it is, and the sentence
/// that says what to do. A finding counted rather than shown carries no sentence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Issue {
    pub code: &'static str,
    pub severity: Severity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl Issue {
    pub fn new(code: &'static str, severity: Severity, message: impl Into<String>) -> Self {
        Self {
            code,
            severity,
            message: Some(message.into()),
        }
    }

    pub fn error(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(code, Severity::Error, message)
    }

    pub fn warning(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(code, Severity::Warning, message)
    }
}

const ARCHITECTURE_PROFILE_SCHEMA: &str = "architecture-profile/v1";

/// The list keys checked for a canonical set, in the order their findings are reported.
const GRAPH_ARRAY_CHECK_ORDER: [&str; 9] = [
    "domains",
    "capabilities",
    "elements",
    "dependencies",
    "depends_on",
    "relates",
    "contains",
    "describes",
    "broader",
];

/// The issues of `document`. `slug` is where the file sits, and without it the check that a node
/// lives in its kind folder uses the `slug:` the file declares, which is a claim that can be wrong.
pub fn validate_document(document: &Document, slug: Option<&str>) -> Vec<Issue> {
    match document.shape() {
        RawShape::Unclosed => vec![Issue::error(
            "unclosed-frontmatter",
            "frontmatter opens with `---` but never closes: this file is not read as a node.",
        )],
        RawShape::Empty | RawShape::Plain => Vec::new(),
        RawShape::Framed => validate_framed(document, slug),
    }
}

fn validate_framed(document: &Document, slug: Option<&str>) -> Vec<Issue> {
    let frontmatter = document.frontmatter();
    let mut issues = Vec::new();
    for diagnostic in document.diagnostics() {
        let code = match diagnostic.code {
            DiagnosticCode::MalformedFrontmatterLine => "malformed-frontmatter-line",
            DiagnosticCode::MalformedQuotedScalar => "malformed-quoted-scalar",
        };
        issues.push(Issue::error(code, diagnostic.message.clone()));
    }
    if frontmatter.is_empty() {
        issues.push(Issue::warning(
            "parse-zero-keys",
            "a frontmatter block is present but no key could be read: suspect indentation or a missing colon.",
        ));
        return issues;
    }
    push_kind_issues(frontmatter, &mut issues);
    if frontmatter
        .text("kind")
        .is_some_and(|kind| !trim(kind).is_empty())
    {
        push_uid_issues(frontmatter, &mut issues);
    }
    push_non_canonical_array_issues(frontmatter, &mut issues);
    push_swallowed_note_issues(frontmatter, &mut issues);
    push_meaning_issues(document, document_slug(frontmatter, slug), &mut issues);
    issues
}

/// The slug a document is addressed by: where the file sits when known, else the `slug:` it
/// declares.
fn document_slug<'a>(frontmatter: &'a Frontmatter, given: Option<&'a str>) -> &'a str {
    match given.map(trim).filter(|slug| !slug.is_empty()) {
        Some(slug) => slug,
        None => frontmatter.text("slug").map(trim).unwrap_or_default(),
    }
}

fn push_kind_issues(frontmatter: &Frontmatter, issues: &mut Vec<Issue>) {
    let Some(kind) = frontmatter.get("kind") else {
        if frontmatter.text("architecture_schema") != Some(ARCHITECTURE_PROFILE_SCHEMA) {
            issues.push(Issue::warning(
                "missing-kind",
                "frontmatter has no `kind:`: a file needs one to become a graph node.",
            ));
        }
        return;
    };
    let Some(text) = kind.as_text().map(trim).filter(|text| !text.is_empty()) else {
        issues.push(Issue::error(
            "empty-kind",
            "`kind:` is empty: this file is not read as a graph node.",
        ));
        return;
    };
    if !KNOWN_KINDS.contains(&text) {
        issues.push(Issue::warning(
            "unknown-kind",
            format!("`kind: {text}` is not a recognised value."),
        ));
        return;
    }
    for key in missing_expected_fields(text, frontmatter) {
        issues.push(Issue::warning(
            "missing-expected-field",
            format!(
                "`{key}:` is empty: a kind={text} node needs it to find its parent in the tree."
            ),
        ));
    }
}

fn push_uid_issues(frontmatter: &Frontmatter, issues: &mut Vec<Issue>) {
    let uid = frontmatter.get("uid");
    if uid.is_none_or(|value| matches!(value, Value::Text(text) if text.is_empty())) {
        issues.push(Issue::error(
            "missing-uid",
            "`uid:` is missing: every ontology node carries a permanent lowercase UUIDv4 that never changes after it is minted.",
        ));
        return;
    }
    if let Some(problem) = node_uid_issue(uid) {
        issues.push(Issue::error("invalid-uid", problem));
        return;
    }
    let Some(uid) = uid.and_then(Value::as_text) else {
        return;
    };
    match inspect_merged_uids(uid, frontmatter.get("merged_uids")) {
        MergedUids::Invalid(problem) => issues.push(Issue::error("invalid-merged-uids", problem)),
        MergedUids::NotCanonical => issues.push(Issue::warning(
            "non-canonical-merged-uids",
            "`merged_uids:` must be an ascending, duplicate-free set of UUIDv4 values.",
        )),
        MergedUids::Canonical => {}
    }
}

fn push_non_canonical_array_issues(frontmatter: &Frontmatter, issues: &mut Vec<Issue>) {
    for key in GRAPH_ARRAY_CHECK_ORDER {
        let Some(items) = frontmatter.list(key) else {
            continue;
        };
        let refs: Vec<&str> = items.iter().map(|item| trim(item)).collect();
        let mut seen: HashSet<&str> = HashSet::new();
        let mut canonical: Vec<&str> = refs
            .iter()
            .copied()
            .filter(|item| !item.is_empty() && seen.insert(item))
            .collect();
        canonical.sort_by(|left, right| compare_text(left, right));
        if refs != canonical {
            issues.push(Issue::warning(
                "non-canonical-graph-array",
                format!("`{key}:` is not a canonical set -- sorted and deduplicated. Writing it again through add_relations or patch_concept normalises it."),
            ));
        }
    }
}

/// A relation note that swallowed the entries after it: an unquoted value with an apostrophe opens
/// a quote state and the following commas stop separating, while the relation arrays stay intact
/// and nothing else fails. A note that names a target this node declares for another is a swallowed
/// entry; a comma that ends a value early turns the rest into a key naming no declared relation.
fn push_swallowed_note_issues(frontmatter: &Frontmatter, issues: &mut Vec<Issue>) {
    let Some(Value::Map(notes)) = frontmatter.get("relation_notes") else {
        return;
    };
    let mut declared: IndexSet<&str> = IndexSet::new();
    for (key, value) in frontmatter.in_object_order() {
        if key == "relation_notes" {
            continue;
        }
        if key == "domain" {
            if let Some(domain) = value
                .as_text()
                .map(trim)
                .filter(|domain| !domain.is_empty())
            {
                declared.insert(domain);
            }
        }
        for item in value.as_list().unwrap_or_default() {
            let item = trim(item);
            if !item.is_empty() {
                declared.insert(item);
            }
        }
    }
    let is_declared = |key: &str| {
        declared.contains(key)
            || declared.iter().any(|reference| {
                reference.ends_with(&format!("/{key}")) || key.ends_with(&format!("/{reference}"))
            })
    };
    let mut targets: IndexSet<&str> = declared
        .iter()
        .copied()
        .filter(|reference| reference.contains('/'))
        .collect();
    targets.extend(notes.keys().map(String::as_str));
    for (key, value) in crate::frontmatter::in_object_order(notes.iter()) {
        if !is_declared(key) {
            let declared_list = if declared.is_empty() {
                String::new()
            } else {
                format!(
                    " (declared: {})",
                    declared.iter().copied().collect::<Vec<_>>().join(" · ")
                )
            };
            issues.push(Issue::error(
                "orphaned-relation-note",
                format!(
                    "the relation_notes key `{key}` names no relation this node declares{declared_list}. No edge carries this note, so every reader drops the sentence. If the key is a swallowed entry (an unquoted value ran past its comma), wrap that value in double quotes and split the entries; otherwise declare the relation or remove the note."
                ),
            ));
        }
        let Scalar::Text(text) = value else {
            continue;
        };
        let swallowed: Vec<&str> = targets
            .iter()
            .copied()
            .filter(|target| *target != key.as_str() && text.contains(&format!("{target}: ")))
            .collect();
        if swallowed.is_empty() {
            continue;
        }
        issues.push(Issue::error(
            "swallowed-relation-note",
            format!(
                "the `{key}` value in relation_notes has swallowed other entries as text ({}). The value is unquoted, so the separator was never read -- those entries have lost their rationale. Wrap the value in double quotes and split the entries.",
                swallowed.join(" · ")
            ),
        ));
    }
}

/// The body half, so validation reports what the write door told the agent. Warnings all: valid but
/// thin.
fn push_meaning_issues(document: &Document, slug: &str, issues: &mut Vec<Issue>) {
    let frontmatter = document.frontmatter();
    let Some(kind) = frontmatter
        .text("kind")
        .map(trim)
        .filter(|kind| KNOWN_KINDS.contains(kind))
    else {
        return;
    };
    let title = frontmatter.text("title").unwrap_or_default();
    for finding in body_findings(kind, slug, title, &document.body()) {
        issues.push(Issue::warning(finding.code, finding.message));
    }
    push_slug_outside_kind_folder(kind, slug, issues);
}

/// A node written outside its kind folder. Silent without a known slug (guessing would accuse every
/// document read from bytes alone) and for kinds that live at the root.
fn push_slug_outside_kind_folder(kind: &str, slug: &str, issues: &mut Vec<Issue>) {
    let folder = folder_for_kind(kind);
    if slug.is_empty() || folder.is_empty() || slug.starts_with(folder) {
        return;
    }
    issues.push(Issue::warning(
        "slug-outside-kind-folder",
        slug_outside_kind_folder(slug, kind, &format!("{folder}{slug}")),
    ));
}
