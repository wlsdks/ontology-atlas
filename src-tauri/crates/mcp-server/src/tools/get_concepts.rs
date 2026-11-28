//! `get_concepts`: nodes by slug or by uid, each with its frontmatter, a body, what it points at,
//! its review and what the vault finds wrong with it. A name that opens nothing fails its own row
//! and says where to go next; the other rows still answer.

use confined_files::{raw_source_file_for_slug, SlugError, VaultRoot, VAULT_SOURCES_DIR};
use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use vault_document::frontmatter::{Frontmatter, Value};
use vault_document::schema::node_uid_issue;
use vault_document::{
    dependency_refs, describe_body_delivery, describe_review, find_graph_references, neighbor_refs,
    normalized_refs, relation_note_for, resolve_uid, slug_not_found_hint, suggest_similar_slugs,
    BodyDelivery, BodyMode, Issue, LoadedDocument, LoadedVault, NamedReadError, ReferenceIndex,
    SlugLookup, VaultIssues, EXCERPT_MAX_CHARS, FULL_BODY_MAX_CHARS, FULL_BODY_MAX_DOCUMENTS,
};

use super::argument_checks::{argument, non_blank_text};
use super::read_vault::read_vault;
use crate::answer::ToolOutput;
use crate::arguments::Arguments;
use crate::dispatch::CallContext;
use crate::error::{MissingNodeDetails, RowFailure, ToolError};

const MAXIMUM_SELECTORS: usize = 50;
const NOT_A_NODE: &str = "This doc is not a graph node — it has no `kind:`, so it has no relations, no UID, and never appears on the map. Ordinary markdown (meeting notes, memos, drafts) lives in the same folder by design. Cite it as a note, not as graph evidence. To promote it, add a `kind:` or use absorb_document.";

/// Whether the selectors are slugs or uids.
#[derive(Clone, Copy)]
enum Selector {
    Slug,
    Uid,
}

impl Selector {
    fn singular(self) -> &'static str {
        match self {
            Self::Slug => "slug",
            Self::Uid => "uid",
        }
    }

    fn plural(self) -> &'static str {
        match self {
            Self::Slug => "slugs",
            Self::Uid => "uids",
        }
    }
}

/// A list or the empty list: what `|| []` makes of a key that holds nothing.
struct ListOrEmpty<'a>(Option<&'a Value>);

impl Serialize for ListOrEmpty<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self.0 {
            Some(value) => value.serialize(serializer),
            None => serializer.collect_seq(std::iter::empty::<()>()),
        }
    }
}

#[derive(Serialize)]
struct Neighbors<'a> {
    domains: ListOrEmpty<'a>,
    domain: Option<&'a Value>,
    capabilities: ListOrEmpty<'a>,
    elements: ListOrEmpty<'a>,
    dependencies: Vec<String>,
    relates: ListOrEmpty<'a>,
    contains: ListOrEmpty<'a>,
    describes: ListOrEmpty<'a>,
}

impl<'a> Neighbors<'a> {
    fn of(frontmatter: &'a Frontmatter) -> Self {
        Self {
            domains: ListOrEmpty(frontmatter.truthy("domains")),
            domain: frontmatter.truthy("domain"),
            capabilities: ListOrEmpty(frontmatter.truthy("capabilities")),
            elements: ListOrEmpty(frontmatter.truthy("elements")),
            dependencies: normalized_refs(&dependency_refs(frontmatter)),
            relates: ListOrEmpty(frontmatter.truthy("relates")),
            contains: ListOrEmpty(frontmatter.truthy("contains")),
            describes: ListOrEmpty(frontmatter.truthy("describes")),
        }
    }
}

#[derive(Serialize)]
struct Edge {
    to: String,
    via: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    rationale: Option<String>,
}

/// One node read, with what it says about itself and what the vault finds wrong with it.
struct Found {
    document: LoadedDocument,
    /// The body of the version the rest was read from.
    body: String,
    mode: BodyMode,
    delivery: BodyDelivery,
    edges: Vec<Edge>,
    warnings: Vec<Issue>,
}

impl Serialize for Found {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let frontmatter = self.document.frontmatter();
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("ok", &true)?;
        if let Some(uid) = frontmatter.get("uid") {
            map.serialize_entry("uid", uid)?;
        }
        map.serialize_entry("slug", self.document.slug())?;
        map.serialize_entry("isNode", &self.document.node_kind().is_some())?;
        map.serialize_entry("frontmatter", frontmatter)?;
        // `full` sends the body alone: the same text twice would bill a caller who asked for
        // everything for up to 800 duplicate characters.
        match self.mode {
            BodyMode::Full => map.serialize_entry("body", &self.delivery.text)?,
            BodyMode::Excerpt => map.serialize_entry("excerpt", &self.delivery.text)?,
        }
        map.serialize_entry("bodyInfo", &self.delivery.info)?;
        map.serialize_entry("neighbors", &Neighbors::of(frontmatter))?;
        map.serialize_entry("outgoingEdges", &self.edges)?;
        map.serialize_entry("review", &describe_review(frontmatter, &self.body))?;
        if let Some(mtime) = self.document.modified_ms() {
            map.serialize_entry("mtime", &mtime)?;
        }
        if !self.warnings.is_empty() {
            map.serialize_entry("warnings", &self.warnings)?;
        }
        map.end()
    }
}

/// A row that failed: the selector as it was sent, then why.
#[derive(Serialize)]
struct Failed<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    slug: Option<&'a serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    uid: Option<&'a serde_json::Value>,
    ok: bool,
    #[serde(flatten)]
    failure: RowFailure<'a>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Row<'a> {
    Found(&'a Found),
    Failed(Failed<'a>),
}

#[derive(Serialize)]
struct Concepts<'a> {
    concepts: Vec<Row<'a>>,
}

/// The sentence for a name under `sources/`, where every file is a raw source and never a node.
pub(super) fn raw_source_issue(raw_source: &str) -> String {
    format!(
        "slug \"{raw_source}\" must not name a file under {VAULT_SOURCES_DIR}/: every file there is a raw source, never a node. Write or move a node into a kind folder such as domains/ or capabilities/, and read the source with read_source({{ path: \"{}\" }}).",
        raw_source_file_for_slug(raw_source)
    )
}

fn doc_not_found(root: &VaultRoot, documents: &[LoadedDocument], slug: &str) -> ToolError {
    if let Some(raw_source) = root.raw_source_slug_at(slug) {
        return ToolError::missing_node(
            format!("Doc not found: {slug}. {}", raw_source_issue(&raw_source)),
            MissingNodeDetails {
                subject: "Doc not found",
                slug: Some(slug.to_string()),
                recovery_tools: vec!["read_source"],
                growth_hint: Some(slug_not_found_hint(slug, Some(&raw_source), &[], &[])),
                ..MissingNodeDetails::default()
            },
        );
    }
    let candidates = suggest_similar_slugs(documents, slug, 3);
    let referenced_by = find_graph_references(documents, slug);
    let growth_hint = slug_not_found_hint(slug, None, &candidates, &referenced_by);
    ToolError::missing_node(
        format!("Doc not found: {slug}"),
        MissingNodeDetails {
            subject: "Doc not found",
            slug: Some(slug.to_string()),
            recovery_tools: vec!["list_concepts"],
            create_tool: Some("add_concepts"),
            similar_slugs: Some(candidates),
            referenced_by: (!referenced_by.is_empty()).then_some(referenced_by),
            growth_hint: Some(growth_hint),
            ..MissingNodeDetails::default()
        },
    )
}

fn uid_not_found(uid: &str) -> ToolError {
    ToolError::missing_node(
        format!("Doc not found for uid: {uid}"),
        MissingNodeDetails {
            subject: "Doc not found for uid",
            uid: Some(uid.to_string()),
            recovery_tools: vec!["list_concepts"],
            ..MissingNodeDetails::default()
        },
    )
}

/// Why a slug could not be opened as a file, as the sentence an agent has always been given.
fn unopenable(error: &NamedReadError) -> ToolError {
    match error {
        NamedReadError::Slug(SlugError::RawSource { raw_source }) => {
            ToolError::invalid(raw_source_issue(raw_source))
        }
        NamedReadError::Slug(SlugError::OutsideRootThroughLink { .. })
        | NamedReadError::File(_) => ToolError::failed(error.to_string()),
        NamedReadError::Slug(other) => ToolError::invalid(other.to_string()),
    }
}

/// What every row of one call shares.
struct Request<'a> {
    selector: Selector,
    mode: BodyMode,
    root: &'a VaultRoot,
    documents: &'a [LoadedDocument],
    lookup: SlugLookup<'a>,
}

/// One selection resolved: the text it was given as, and the slug it names when it names one.
struct Resolved {
    text: String,
    canonical: Option<String>,
}

impl Request<'_> {
    fn resolve(&self, selected: &serde_json::Value) -> Result<Resolved, ToolError> {
        let name = self.selector.singular();
        let text = non_blank_text(selected, name)?;
        let canonical = match self.selector {
            Selector::Slug => self
                .lookup
                .resolve(self.root, &text)
                .map_err(|ambiguous| ToolError::failed(ambiguous.to_string()))?,
            Selector::Uid => {
                if let Some(issue) = node_uid_issue(Some(&Value::Text(text.clone()))) {
                    return Err(ToolError::invalid(issue));
                }
                resolve_uid(self.documents, &text)
                    .map_err(|ambiguous| ToolError::failed(ambiguous.to_string()))?
                    .map(str::to_string)
            }
        };
        Ok(Resolved { text, canonical })
    }

    fn read(&self, resolved: &Resolved, vault_issues: &VaultIssues) -> Result<Found, ToolError> {
        let missing = || match self.selector {
            Selector::Slug => doc_not_found(self.root, self.documents, &resolved.text),
            Selector::Uid => uid_not_found(&resolved.text),
        };
        let Some(canonical) = &resolved.canonical else {
            return Err(missing());
        };
        let document = LoadedVault::read_named(self.root, canonical)
            .map_err(|error| unopenable(&error))?
            .ok_or_else(missing)?;
        self.describe(document, vault_issues)
    }

    fn describe(
        &self,
        document: LoadedDocument,
        vault_issues: &VaultIssues,
    ) -> Result<Found, ToolError> {
        let slug = document.slug();
        let body = document
            .body()
            .map_err(|error| ToolError::failed(error.to_string()))?
            .into_owned();
        let mut warnings = document.issues().to_vec();
        if document.node_kind().is_none() {
            warnings.push(Issue::warning("not-a-graph-node", NOT_A_NODE));
        }
        warnings.extend_from_slice(vault_issues.for_slug(slug));
        let frontmatter = document.frontmatter();
        let edges = neighbor_refs(frontmatter)
            .into_iter()
            .map(|neighbor| Edge {
                rationale: relation_note_for(frontmatter, &neighbor.reference, None),
                to: neighbor.reference,
                via: neighbor.key,
            })
            .collect();
        let hint = match self.mode {
            BodyMode::Full => format!(
                "Body exceeds the {FULL_BODY_MAX_CHARS}-char single-call cap — read the file directly for the remainder."
            ),
            BodyMode::Excerpt => format!(
                "Only the first prose paragraph was returned. Call get_concepts({{ slugs: [\"{slug}\"], body: \"full\" }}) for the whole body (definition / evidence / confidence / in-scope-out-of-scope sections live there)."
            ),
        };
        let delivery = describe_body_delivery(&body, self.mode, EXCERPT_MAX_CHARS, Some(&hint));
        Ok(Found {
            mode: self.mode,
            delivery,
            edges,
            warnings,
            body,
            document,
        })
    }
}

fn selector_of(arguments: &Arguments) -> Result<Selector, ToolError> {
    match (
        arguments.get("slugs").is_some(),
        arguments.get("uids").is_some(),
    ) {
        (true, false) => Ok(Selector::Slug),
        (false, true) => Ok(Selector::Uid),
        _ => Err(ToolError::invalid(
            "get_concepts requires exactly one of slugs or uids.",
        )),
    }
}

fn body_mode(arguments: &Arguments) -> Result<BodyMode, ToolError> {
    match argument(arguments, "body")? {
        None => Ok(BodyMode::Excerpt),
        Some(value) => match value.as_str() {
            Some("excerpt") => Ok(BodyMode::Excerpt),
            Some("full") => Ok(BodyMode::Full),
            _ => Err(ToolError::invalid("body must be one of: excerpt, full.")),
        },
    }
}

pub fn call(context: &CallContext<'_>, arguments: &Arguments) -> Result<ToolOutput, ToolError> {
    let selector = selector_of(arguments)?;
    let selected = argument(arguments, selector.plural())?.unwrap_or(serde_json::Value::Null);
    let serde_json::Value::Array(selected) = selected else {
        return Err(ToolError::invalid(format!(
            "{} must be an array of strings",
            selector.plural()
        )));
    };
    let mode = body_mode(arguments)?;
    if selected.is_empty() {
        return ToolOutput::json(&Concepts {
            concepts: Vec::new(),
        });
    }
    let plural = selector.plural();
    if selected.len() > MAXIMUM_SELECTORS {
        return Err(ToolError::invalid(format!(
            "Too many {plural}: {}. Max {MAXIMUM_SELECTORS} per call — split into multiple get_concepts batches.",
            selected.len()
        )));
    }
    if mode == BodyMode::Full && selected.len() > FULL_BODY_MAX_DOCUMENTS {
        return Err(ToolError::invalid(format!(
            "Too many {plural} for body:\"full\": {}. Max {FULL_BODY_MAX_DOCUMENTS} per call — split into multiple get_concepts batches, or drop body:\"full\" to read {} excerpts at once.",
            selected.len(),
            selected.len()
        )));
    }
    let read = read_vault(context)?;
    let documents = read.vault.documents();
    let request = Request {
        selector,
        mode,
        root: &read.root,
        documents,
        lookup: SlugLookup::new(documents),
    };
    let resolved: Vec<Result<Resolved, ToolError>> = selected
        .iter()
        .map(|choice| request.resolve(choice))
        .collect();
    // What the vault says of the nodes asked for, and of no other.
    let vault_issues = {
        let asked: Vec<&str> = resolved
            .iter()
            .filter_map(|resolved| resolved.as_ref().ok()?.canonical.as_deref())
            .collect();
        VaultIssues::about(documents, &ReferenceIndex::new(documents), &asked)
    };
    let results: Vec<Result<Found, ToolError>> = resolved
        .into_iter()
        .map(|resolved| resolved.and_then(|resolved| request.read(&resolved, &vault_issues)))
        .collect();
    let concepts = results
        .iter()
        .zip(&selected)
        .map(|(result, choice)| match result {
            Ok(found) => Row::Found(found),
            Err(error) => {
                let (slug, uid) = match selector {
                    Selector::Slug => (Some(choice), None),
                    Selector::Uid => (None, Some(choice)),
                };
                Row::Failed(Failed {
                    slug,
                    uid,
                    ok: false,
                    failure: error.as_row(),
                })
            }
        })
        .collect();
    ToolOutput::json(&Concepts { concepts })
}
